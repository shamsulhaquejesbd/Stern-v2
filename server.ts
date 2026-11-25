import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_ALLOWED_RADIUS_METERS,
  DEFAULT_GRACE_PERIOD_MINUTES,
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  DEFAULT_OFFICE_LOCATIONS,
  DEFAULT_SHIFT_END_TIME,
  DEFAULT_SHIFT_START_TIME,
  calculateShiftAttendanceStatus,
  evaluateGeofenceAttendance,
  formatTime12Hour,
  isValidCoordinatePair,
} from './src/lib/geofence.ts';
import type {
  AttendanceRecord,
  OfficeLocation,
  PayrollSettings,
  RejectedAttendanceAttempt,
} from './src/types/payroll.ts';
import type {
  EmployeeOvertimePolicy,
  OvertimeRequest,
  OvertimeRequisition,
  OvertimeRequisitionApprovalHistoryEntry,
  OvertimeRequisitionPurposeItem,
} from './src/types/overtime.ts';
import {
  applyRequisitionDecision,
  applyRequisitionResubmission,
  buildCreatedRequisition,
  canUserApproveRequisition,
  doesActorMatchRequester,
  normalizeRequisitionPurposes,
  validateOvertimeRequisitionPayload,
  type RequisitionDecisionAction,
} from './src/lib/overtimeRequisitionEngine.ts';
import {
  findCancelledOvertimeRequest,
  findDuplicateOvertimeRequest,
  generateNextOvertimeRequestNumber,
  reconcileAttendanceOvertimeRequest,
  type AttendanceOvertimeSourceMode,
  type QrOvertimeSyncResult,
} from './src/lib/overtimeAutomation.ts';
import type { FieldForceRep, User } from './src/types/erp.ts';
import {
  findLinkedUserForEmployee,
  resolveEmployeeForERPUser,
  resolveGeofenceConfigFromUser,
  verifyTransactionIdentityMatchesUser,
  type ResolvedMobileEmployeeProfile,
} from './src/lib/fieldForceAuth.ts';
import {
  authorizeCostSheetForUser,
  resolveManufacturingCostPermissions,
  sanitizeMaterialIssueContextForUser,
  sanitizeMaterialIssueRecordForUser,
  sanitizeProductionOrderForUser,
} from './src/lib/manufacturingPermissions.ts';
import {
  authorizeOvertimeReport,
  authorizeOvertimeSubPage,
  resolveOvertimePermissions,
  sanitizeOvertimeRecordForUser,
} from './src/lib/overtimePermissions.ts';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_SETTINGS_TABLE_SQL,
  SystemBrandingConfig,
  SystemSettingsConfig,
  SystemSettingsDbStatus,
  cleanBrandingLogoDataUrl,
  isValidBrandingLogoDataUrl,
  normalizeSystemSettings,
} from './src/types/systemSettings.ts';
import { canModifySystemBranding } from './src/lib/systemSettingsPermissions.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase server client (optional, falls back gracefully if tables not yet migrated)
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://gelfhddiibxkcpyekaau.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_Dui2haTLCcFI3KvAZqfZtw_JP5P5-vF';

let serverSupabase: SupabaseClient | null = null;
try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    serverSupabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch {
  serverSupabase = null;
}

// Authoritative server-side stores (hydrated from Supabase if available + synced from client)
const officeLocationsStore = new Map<string, OfficeLocation>(
  DEFAULT_OFFICE_LOCATIONS.map((loc) => [loc.id, loc])
);
const attendanceRecordsStore = new Map<string, AttendanceRecord>(); // key: `${employeeId}_${date}`
const rejectedAttemptsStore: RejectedAttendanceAttempt[] = [];
const lastEmployeeGpsPing = new Map<
  string,
  { latitude: number; longitude: number; timestampMs: number }
>();
const lastQrScanCooldownMap = new Map<string, number>(); // key: employeeId -> last accepted scan ms
const attendanceLockQueues = new Map<string, Promise<void>>(); // key: `${employeeId}_${date}`
let payrollSettingsStore: Partial<PayrollSettings> = {};
const QR_SCAN_COOLDOWN_MS = 3000;
const mfgUsersCache = new Map<string, any>();
const fieldForceRepsCache = new Map<string, FieldForceRep>();

const indexUserInMfgCache = (u: any) => {
  if (!u || typeof u !== 'object') return;
  if (u.id) mfgUsersCache.set(String(u.id).toLowerCase(), u);
  if (u.userId) mfgUsersCache.set(String(u.userId).toLowerCase(), u);
  if (u.uid) mfgUsersCache.set(String(u.uid).toLowerCase(), u);
  if (u.salesmanCode) mfgUsersCache.set(String(u.salesmanCode).toLowerCase(), u);
  if (u.email) mfgUsersCache.set(String(u.email).toLowerCase(), u);
};

const mapSupabaseUserRow = (row: any) => {
  let parsedPermissions = row.permissions;
  if (typeof parsedPermissions === 'string') {
    try {
      parsedPermissions = JSON.parse(parsedPermissions);
    } catch {
      parsedPermissions = null;
    }
  }
  const geoBridge =
    parsedPermissions &&
    typeof parsedPermissions === 'object' &&
    parsedPermissions.geofence &&
    typeof parsedPermissions.geofence === 'object'
      ? parsedPermissions.geofence
      : undefined;
  const rawLat = row.office_latitude ?? geoBridge?.officeLatitude;
  const rawLng = row.office_longitude ?? geoBridge?.officeLongitude;
  const rawRadius = row.allowed_radius_meters ?? geoBridge?.allowedRadiusMeters;
  const rawLocStatus = row.location_status ?? geoBridge?.locationStatus;
  const rawGrace = row.grace_period_minutes ?? geoBridge?.gracePeriodMinutes;

  return {
    id: row.uid ? String(row.uid) : `u-sb-${row.id}`,
    userId:
      row.user_id ||
      row.uid ||
      (row.email ? String(row.email).split('@')[0].toUpperCase() : `EMP-${row.id}`),
    name: row.name || 'Staff User',
    email: row.email || '',
    phone: row.phone || '',
    role: row.role || 'Field Force',
    designation: row.designation || '',
    department: row.department || '',
    region: row.region || '',
    area: row.area || '',
    territory: row.territory || '',
    isSalesman: row.is_salesman,
    salesmanCode: row.salesman_code || row.salesmancode || undefined,
    monthlySalesTargetBDT: row.monthly_target_bdt || row.monthlysalestargetbdt,
    assignedOfficeId: row.assigned_office_id || geoBridge?.assignedOfficeId || undefined,
    assignedOfficeName: row.assigned_office_name || geoBridge?.assignedOfficeName || undefined,
    officeLatitude:
      rawLat !== null && rawLat !== undefined && rawLat !== '' && Number.isFinite(Number(rawLat))
        ? Number(rawLat)
        : undefined,
    officeLongitude:
      rawLng !== null && rawLng !== undefined && rawLng !== '' && Number.isFinite(Number(rawLng))
        ? Number(rawLng)
        : undefined,
    allowedRadiusMeters: Number(rawRadius) > 0 ? Number(rawRadius) : undefined,
    officeAddress: row.office_address || geoBridge?.officeAddress || undefined,
    locationStatus:
      rawLocStatus === 'Inactive'
        ? ('Inactive' as const)
        : rawLocStatus === 'Active'
        ? ('Active' as const)
        : undefined,
    shiftStartTime: row.shift_start_time || geoBridge?.shiftStartTime || undefined,
    shiftEndTime: row.shift_end_time || geoBridge?.shiftEndTime || undefined,
    gracePeriodMinutes:
      rawGrace !== null && rawGrace !== undefined && rawGrace !== '' && Number.isFinite(Number(rawGrace))
        ? Number(rawGrace)
        : undefined,
    status: row.status || 'Active',
    permissions: parsedPermissions || {},
  };
};

async function withAttendanceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = attendanceLockQueues.get(key) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => next);
  attendanceLockQueues.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (attendanceLockQueues.get(key) === chained) {
      attendanceLockQueues.delete(key);
    }
  }
}

function getServerAttendanceDateTime(now = new Date()): {
  date: string;
  time24: string;
  time24WithSeconds: string;
  time12: string;
  iso: string;
} {
  const tz = process.env.ATTENDANCE_TIMEZONE;
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      const yr = getPart('year');
      const mo = getPart('month');
      const da = getPart('day');
      const hr = getPart('hour') === '24' ? '00' : getPart('hour');
      const mi = getPart('minute');
      const se = getPart('second');
      const time24 = `${hr}:${mi}`;
      return {
        date: `${yr}-${mo}-${da}`,
        time24,
        time24WithSeconds: `${hr}:${mi}:${se}`,
        time12: formatTime12Hour(time24) || time24,
        iso: now.toISOString(),
      };
    } catch {
      // Fallback to server local calendar & clock
    }
  }
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const da = String(now.getDate()).padStart(2, '0');
  const hr = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const se = String(now.getSeconds()).padStart(2, '0');
  const time24 = `${hr}:${mi}`;
  return {
    date: `${yr}-${mo}-${da}`,
    time24,
    time24WithSeconds: `${hr}:${mi}:${se}`,
    time12: formatTime12Hour(time24) || time24,
    iso: now.toISOString(),
  };
}

interface ResolvedOfficeConfig {
  assignedOfficeId: string;
  assignedOfficeName: string;
  officeAddress: string;
  officeLatitude: number;
  officeLongitude: number;
  allowedRadiusMeters: number;
  locationStatus: 'Active' | 'Inactive';
}

async function resolveOfficeForEmployee(body: any): Promise<ResolvedOfficeConfig> {
  // 1. Resolve User record (authoritative owner of Assigned Office GPS & Shift Geofence)
  let resolvedUser: Partial<User> | undefined =
    body.user && typeof body.user === 'object' ? (body.user as Partial<User>) : undefined;

  if (!resolvedUser) {
    const candidateKeys = [body.userId, body.userCode, body.userEmail]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    for (const k of candidateKeys) {
      const hit = mfgUsersCache.get(k);
      if (hit) {
        resolvedUser = hit;
        break;
      }
    }
  }

  if (!resolvedUser && (body.employeeId || body.employeeCode || body.employeeName)) {
    const allUsers = Array.from(mfgUsersCache.values());
    if (allUsers.length > 0) {
      const cachedRep =
        (body.employeeId ? fieldForceRepsCache.get(String(body.employeeId)) : undefined) ||
        Array.from(fieldForceRepsCache.values()).find(
          (r) =>
            (body.employeeId && String(r.id) === String(body.employeeId)) ||
            (body.employeeCode && r.code && r.code.toLowerCase() === String(body.employeeCode).toLowerCase())
        ) ||
        ({
          id: String(body.employeeId || ''),
          userId: body.userId ? String(body.userId) : undefined,
          code: String(body.employeeCode || ''),
          name: String(body.employeeName || ''),
        } as Partial<FieldForceRep>);
      resolvedUser = findLinkedUserForEmployee(cachedRep, allUsers);
    }
  }

  // Query Supabase users table if cache missed or if we want authoritative DB values
  if (serverSupabase && (!resolvedUser || !isValidCoordinatePair(Number(resolvedUser.officeLatitude), Number(resolvedUser.officeLongitude)))) {
    try {
      const uidOrId = String(resolvedUser?.userId || resolvedUser?.id || body.userId || '').trim();
      const email = String(resolvedUser?.email || body.userEmail || '').trim();
      let dbRow: any = null;
      if (email) {
        const { data } = await serverSupabase.from('users').select('*').ilike('email', email).limit(1).maybeSingle();
        if (data) dbRow = data;
      }
      if (!dbRow && uidOrId) {
        const { data } = await serverSupabase
          .from('users')
          .select('*')
          .or(`uid.eq.${uidOrId},user_id.eq.${uidOrId}`)
          .limit(1)
          .maybeSingle();
        if (data) dbRow = data;
      }
      if (!dbRow && (body.employeeId || body.employeeCode || body.employeeName)) {
        const { data: allUserRows } = await serverSupabase.from('users').select('*');
        if (Array.isArray(allUserRows) && allUserRows.length > 0) {
          const mappedUsers = allUserRows.map(mapSupabaseUserRow);
          for (const mu of mappedUsers) {
            indexUserInMfgCache(mu);
          }
          const empCandidate: Partial<FieldForceRep> = {
            id: String(body.employeeId || ''),
            userId: body.userId ? String(body.userId) : undefined,
            code: String(body.employeeCode || ''),
            name: String(body.employeeName || ''),
          };
          resolvedUser = findLinkedUserForEmployee(empCandidate, mappedUsers) || resolvedUser;
        }
      } else if (dbRow) {
        resolvedUser = mapSupabaseUserRow(dbRow);
        indexUserInMfgCache(resolvedUser);
      }
    } catch {
      // Fall back safely to cached user / officeLocationsStore / body
    }
  }

  // 2. Resolve assigned office master record (User's assignedOfficeId takes priority)
  const officeId = String(resolvedUser?.assignedOfficeId || body.assignedOfficeId || body.officeId || '').trim();
  let storedOffice = officeId && officeId !== 'custom' ? officeLocationsStore.get(officeId) : undefined;

  if (!storedOffice && serverSupabase && officeId && officeId !== 'custom') {
    try {
      const { data } = await serverSupabase
        .from('office_locations')
        .select('*')
        .eq('id', officeId)
        .maybeSingle();
      if (data) {
        storedOffice = {
          id: String(data.id),
          code: data.code || undefined,
          name: data.name,
          address: data.address,
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          allowedRadiusMeters: Number(data.allowed_radius_meters) || DEFAULT_ALLOWED_RADIUS_METERS,
          status: data.status === 'Inactive' ? 'Inactive' : 'Active',
        };
        officeLocationsStore.set(storedOffice.id, storedOffice);
      }
    } catch {
      // Ignore if table not migrated yet
    }
  }

  const hasValidUserCoords =
    resolvedUser &&
    typeof resolvedUser.officeLatitude === 'number' &&
    typeof resolvedUser.officeLongitude === 'number' &&
    isValidCoordinatePair(resolvedUser.officeLatitude, resolvedUser.officeLongitude);

  const officeLatitude = hasValidUserCoords
    ? Number(resolvedUser!.officeLatitude)
    : storedOffice?.latitude ?? Number(body.officeLatitude);
  const officeLongitude = hasValidUserCoords
    ? Number(resolvedUser!.officeLongitude)
    : storedOffice?.longitude ?? Number(body.officeLongitude);

  const allowedRadiusMeters =
    (Number(resolvedUser?.allowedRadiusMeters) > 0 ? Number(resolvedUser!.allowedRadiusMeters) : 0) ||
    Number(storedOffice?.allowedRadiusMeters) ||
    Number(body.allowedRadiusMeters) ||
    DEFAULT_ALLOWED_RADIUS_METERS;

  const assignedOfficeId =
    resolvedUser?.assignedOfficeId ||
    storedOffice?.id ||
    officeId ||
    'office-hq';

  const assignedOfficeName =
    resolvedUser?.assignedOfficeName ||
    storedOffice?.name ||
    body.assignedOfficeName ||
    'Head Office';

  const officeAddress =
    resolvedUser?.officeAddress ||
    storedOffice?.address ||
    body.officeAddress ||
    '';

  const locationStatus: 'Active' | 'Inactive' =
    resolvedUser?.locationStatus ||
    storedOffice?.status ||
    (body.locationStatus === 'Inactive' ? 'Inactive' : 'Active');

  return {
    assignedOfficeId,
    assignedOfficeName,
    officeAddress,
    officeLatitude,
    officeLongitude,
    allowedRadiusMeters,
    locationStatus,
  };
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentTimeHHmm(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getCurrentTimeHHmmss(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

async function persistRejectedAttempt(attempt: RejectedAttendanceAttempt) {
  rejectedAttemptsStore.unshift(attempt);
  if (rejectedAttemptsStore.length > 1000) {
    rejectedAttemptsStore.pop();
  }
  if (serverSupabase) {
    try {
      await serverSupabase.from('attendance_rejected_attempts').insert({
        id: attempt.id,
        employee_id: attempt.employeeId,
        employee_code: attempt.employeeCode || null,
        employee_name: attempt.employeeName,
        department: attempt.department || null,
        designation: attempt.designation || null,
        assigned_office_id: attempt.assignedOfficeId || null,
        assigned_office_name: attempt.assignedOfficeName || null,
        office_latitude: attempt.officeLatitude ?? null,
        office_longitude: attempt.officeLongitude ?? null,
        allowed_radius_meters: attempt.allowedRadiusMeters,
        attempt_type: attempt.attemptType,
        attendance_date: attempt.attendanceDate,
        attempt_time: attempt.attemptTime,
        latitude: attempt.latitude ?? null,
        longitude: attempt.longitude ?? null,
        distance_meters: attempt.distanceMeters ?? null,
        gps_accuracy_meters: attempt.gpsAccuracyMeters ?? null,
        gps_validation_status: 'Rejected',
        rejection_reason: attempt.rejectionReason,
        device_info: attempt.deviceInfo || null,
      });
    } catch {
      // Non-fatal if table not yet created
    }
  }
}

async function persistAcceptedAttendance(
  record: AttendanceRecord
): Promise<{ dbSynced: boolean; dbError?: string; dbCode?: string }> {
  const key = `${record.employeeId}_${record.date}`;
  attendanceRecordsStore.set(key, record);
  if (!serverSupabase) {
    return { dbSynced: false, dbError: 'Supabase server client is not configured.' };
  }
  const workingPayload: Record<string, any> = {
    id: record.id,
    employee_id: record.employeeId || record.fieldForceId || '',
    employee_code: record.employeeCode || '',
    employee_name: record.employeeName,
    department: record.department || null,
    designation: record.designation || null,
    date: record.date,
    status: record.status,
    in_time: record.inTime || record.checkInTime || null,
    out_time: record.outTime || record.checkOutTime || null,
    overtime_hours: record.overtimeHours || 0,
    work_hours: record.workHours || 0,
    late_duration_minutes: record.lateDurationMinutes ?? record.lateMinutes ?? 0,
    assigned_office_id: record.assignedOfficeId || null,
    assigned_office_name: record.assignedOfficeName || null,
    office_latitude: record.officeLatitude ?? null,
    office_longitude: record.officeLongitude ?? null,
    allowed_radius_meters: record.allowedRadiusMeters ?? DEFAULT_ALLOWED_RADIUS_METERS,
    check_in_latitude: record.checkInLatitude ?? null,
    check_in_longitude: record.checkInLongitude ?? null,
    check_in_distance_meters: record.checkInDistanceMeters ?? null,
    check_in_gps_accuracy_meters: record.checkInGpsAccuracyMeters ?? null,
    check_in_location_text: record.checkInLocationText || null,
    check_out_latitude: record.checkOutLatitude ?? null,
    check_out_longitude: record.checkOutLongitude ?? null,
    check_out_distance_meters: record.checkOutDistanceMeters ?? null,
    check_out_gps_accuracy_meters: record.checkOutGpsAccuracyMeters ?? null,
    check_out_location_text: record.checkOutLocationText || null,
    gps_validation_status: record.gpsValidationStatus || 'Accepted',
    validation_reason: record.validationReason || null,
    remarks: record.remarks || null,
    updated_at: new Date().toISOString(),
  };

  try {
    let lastError: any = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error } = await serverSupabase
        .from('employee_attendances')
        .upsert(workingPayload, { onConflict: 'employee_id,date' });
      if (!error) {
        return { dbSynced: true };
      }
      lastError = error;
      const msg = String(error.message || '');
      let missingCol: string | null = null;
      if (error.code === 'PGRST204' || msg.includes('schema cache')) {
        missingCol = msg.match(/Could not find the '([^']+)' column/i)?.[1] || null;
      } else if (error.code === '42703' || msg.toLowerCase().includes('does not exist')) {
        missingCol =
          msg.match(/column\s+"([^"]+)"/i)?.[1] ||
          msg.match(/column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i)?.[1] ||
          null;
      }
      if (missingCol && Object.prototype.hasOwnProperty.call(workingPayload, missingCol)) {
        delete workingPayload[missingCol];
        continue;
      }
      break;
    }
    return {
      dbSynced: false,
      dbError: lastError?.message || 'Failed to save attendance to Supabase.',
      dbCode: lastError?.code ? String(lastError.code) : undefined,
    };
  } catch (err: any) {
    return {
      dbSynced: false,
      dbError: err?.message || 'Exception while saving attendance to Supabase.',
    };
  }
}

export function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ensec-erp-geofence-server' });
  });

  // --------------------------------------------------------------------------
  // Office Locations CRUD
  // --------------------------------------------------------------------------
  app.get('/api/office-locations', async (_req, res) => {
    if (serverSupabase) {
      try {
        const { data, error } = await serverSupabase
          .from('office_locations')
          .select('*')
          .order('created_at', { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
          for (const row of data) {
            officeLocationsStore.set(String(row.id), {
              id: String(row.id),
              code: row.code || undefined,
              name: row.name || 'Office Location',
              address: row.address || '',
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              allowedRadiusMeters: Number(row.allowed_radius_meters) || DEFAULT_ALLOWED_RADIUS_METERS,
              status: row.status === 'Inactive' ? 'Inactive' : 'Active',
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            });
          }
        }
      } catch {}
    }
    res.json({ locations: Array.from(officeLocationsStore.values()) });
  });

  app.post('/api/office-locations/sync', (req, res) => {
    const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
    for (const loc of locations) {
      if (loc && loc.id && loc.name) {
        officeLocationsStore.set(String(loc.id), {
          id: String(loc.id),
          code: loc.code,
          name: String(loc.name),
          address: String(loc.address || ''),
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          allowedRadiusMeters: Number(loc.allowedRadiusMeters) || DEFAULT_ALLOWED_RADIUS_METERS,
          status: loc.status === 'Inactive' ? 'Inactive' : 'Active',
        });
      }
    }
    res.json({ synced: officeLocationsStore.size, locations: Array.from(officeLocationsStore.values()) });
  });

  app.post('/api/office-locations', async (req, res) => {
    const { id, code, name, address, latitude, longitude, allowedRadiusMeters, status, skipSupabaseSync } = req.body || {};
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!name || !isValidCoordinatePair(lat, lng)) {
      return res.status(400).json({ error: 'Valid office name, latitude, and longitude are required.' });
    }
    const nowIso = new Date().toISOString();
    const normalizedCode = code && String(code).trim() ? String(code).trim() : undefined;
    const loc: OfficeLocation = {
      id: id ? String(id) : `office-${Date.now().toString().slice(-6)}`,
      code: normalizedCode,
      name: String(name).trim(),
      address: String(address || '').trim(),
      latitude: lat,
      longitude: lng,
      allowedRadiusMeters: Number(allowedRadiusMeters) > 0 ? Number(allowedRadiusMeters) : DEFAULT_ALLOWED_RADIUS_METERS,
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    officeLocationsStore.set(loc.id, loc);
    if (serverSupabase && !skipSupabaseSync) {
      const { error } = await serverSupabase.from('office_locations').upsert(
        {
          id: loc.id,
          code: loc.code || null,
          name: loc.name,
          address: loc.address,
          latitude: loc.latitude,
          longitude: loc.longitude,
          allowed_radius_meters: loc.allowedRadiusMeters,
          status: loc.status,
          created_at: nowIso,
          updated_at: loc.updatedAt,
        },
        { onConflict: 'id' }
      );
      if (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    return res.status(201).json({ location: loc });
  });

  app.put('/api/office-locations/:id', async (req, res) => {
    const locId = String(req.params.id);
    const existing = officeLocationsStore.get(locId);
    const body = req.body || {};
    const lat = body.latitude !== undefined ? Number(body.latitude) : existing?.latitude;
    const lng = body.longitude !== undefined ? Number(body.longitude) : existing?.longitude;
    if (!isValidCoordinatePair(lat, lng)) {
      return res.status(400).json({ error: 'Valid office latitude and longitude are required.' });
    }
    const normalizedCode =
      body.code !== undefined
        ? body.code && String(body.code).trim()
          ? String(body.code).trim()
          : undefined
        : existing?.code;
    const updated: OfficeLocation = {
      id: locId,
      code: normalizedCode,
      name: String(body.name ?? existing?.name ?? 'Office Location').trim(),
      address: String(body.address ?? existing?.address ?? '').trim(),
      latitude: lat!,
      longitude: lng!,
      allowedRadiusMeters:
        Number(body.allowedRadiusMeters ?? existing?.allowedRadiusMeters) || DEFAULT_ALLOWED_RADIUS_METERS,
      status: (body.status ?? existing?.status) === 'Inactive' ? 'Inactive' : 'Active',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    officeLocationsStore.set(locId, updated);
    if (serverSupabase && !body.skipSupabaseSync) {
      const { error } = await serverSupabase.from('office_locations').upsert(
        {
          id: updated.id,
          code: updated.code || null,
          name: updated.name,
          address: updated.address,
          latitude: updated.latitude,
          longitude: updated.longitude,
          allowed_radius_meters: updated.allowedRadiusMeters,
          status: updated.status,
          updated_at: updated.updatedAt,
        },
        { onConflict: 'id' }
      );
      if (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    return res.json({ location: updated });
  });

  app.delete('/api/office-locations/:id', async (req, res) => {
    const locId = String(req.params.id);
    officeLocationsStore.delete(locId);
    if (serverSupabase && req.query.skipSupabaseSync !== '1') {
      const { error } = await serverSupabase.from('office_locations').delete().eq('id', locId);
      if (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    res.json({ deleted: true, id: locId });
  });

  // --------------------------------------------------------------------------
  // Dry-Run GPS Distance Validation Endpoint
  // --------------------------------------------------------------------------
  app.post('/api/attendance/validate', async (req, res) => {
    const body = req.body || {};
    const caller = await resolveRequestUser(req).catch(() => null);
    const office = await resolveOfficeForEmployee({
      ...body,
      user: body.user || caller || undefined,
      userId: body.userId || caller?.id,
    });
    const result = evaluateGeofenceAttendance({
      employeeLatitude: Number(body.latitude),
      employeeLongitude: Number(body.longitude),
      gpsAccuracyMeters:
        body.accuracy !== undefined && body.accuracy !== null ? Number(body.accuracy) : undefined,
      officeLatitude: office.officeLatitude,
      officeLongitude: office.officeLongitude,
      allowedRadiusMeters: office.allowedRadiusMeters,
      locationStatus: office.locationStatus,
      maxGpsAccuracyMeters: Number(body.maxGpsAccuracyMeters) || DEFAULT_MAX_GPS_ACCURACY_METERS,
    });
    res.json({
      ...result,
      office,
    });
  });

  // --------------------------------------------------------------------------
  // Authoritative Attendance Check-In (Authenticated ERP User + Geofence Validation)
  // --------------------------------------------------------------------------
  app.post('/api/attendance/check-in', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        accepted: false,
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required. Please sign in to Ensec ERP before marking attendance.',
      });
    }

    const resolvedEmployee = await resolveEmployeeProfileForCaller(caller);
    if (!resolvedEmployee) {
      return res.status(403).json({
        accepted: false,
        errorCode: 'EMPLOYEE_UNRESOLVED',
        reason: 'Unable to resolve an active employee profile for this ERP user.',
      });
    }

    const body = req.body || {};
    const isMobileSource =
      req.headers['x-mobile-portal'] === 'true' || body.source === 'mobile-field';

    if (isMobileSource || !['Super Admin', 'HR', 'Admin'].includes(String(caller.role || ''))) {
      const identityCheck = verifyTransactionIdentityMatchesUser(
        {
          userId: body.userId,
          employeeId: body.employeeId,
          fieldForceId: body.fieldForceId,
          employeeCode: body.employeeCode,
          salespersonId: body.salespersonId,
          assignedSalespersonId: body.assignedSalespersonId,
          repId: body.repId,
          ffCode: body.ffCode,
          employee: body.employee && typeof body.employee === 'object' ? body.employee : undefined,
        },
        resolvedEmployee
      );
      if (!identityCheck.valid) {
        return res.status(403).json({
          accepted: false,
          errorCode: 'IDENTITY_MISMATCH',
          reason: identityCheck.reason,
        });
      }
    }

    const employeeId = isMobileSource
      ? resolvedEmployee.employeeId
      : String(body.employeeId || resolvedEmployee.employeeId).trim();
    const employeeCode = isMobileSource
      ? resolvedEmployee.employeeCode
      : String(body.employeeCode || resolvedEmployee.employeeCode).trim();
    const employeeName = isMobileSource
      ? resolvedEmployee.name
      : String(body.employeeName || resolvedEmployee.name).trim();
    if (!employeeId || !employeeName) {
      return res.status(400).json({
        accepted: false,
        reason: 'Employee ID and Employee Name are required.',
      });
    }

    const bodyForOffice = {
      ...body,
      user: caller,
      userId: caller.id,
      employeeId,
      employeeCode,
      employeeName,
      assignedOfficeId: body.assignedOfficeId || caller.assignedOfficeId || resolvedEmployee.assignedOfficeId,
    };

    const attendanceDate = String(body.date || getTodayDateString()).slice(0, 10);
    const checkInTime = String(body.checkInTime || getCurrentTimeHHmm());
    const attemptTime = getCurrentTimeHHmmss();
    const key = `${employeeId}_${attendanceDate}`;

    // Check duplicate check-in on server store (and optional client existing record marker)
    const existing = attendanceRecordsStore.get(key);
    if ((existing && (existing.checkInTime || existing.inTime) && existing.gpsValidationStatus === 'Accepted') || body.hasExistingCheckIn) {
      return res.status(409).json({
        accepted: false,
        errorCode: 'DUPLICATE_CHECK_IN',
        reason: `Duplicate Check-In blocked: ${employeeName} has already checked in for ${attendanceDate}.`,
      });
    }

    const office = await resolveOfficeForEmployee(bodyForOffice);
    const empLat = Number(body.latitude);
    const empLng = Number(body.longitude);
    const gpsAccuracy =
      body.accuracy !== undefined && body.accuracy !== null ? Number(body.accuracy) : undefined;
    const prevPing = lastEmployeeGpsPing.get(employeeId);

    const validation = evaluateGeofenceAttendance({
      employeeLatitude: empLat,
      employeeLongitude: empLng,
      gpsAccuracyMeters: gpsAccuracy,
      officeLatitude: office.officeLatitude,
      officeLongitude: office.officeLongitude,
      allowedRadiusMeters: office.allowedRadiusMeters,
      locationStatus: office.locationStatus,
      maxGpsAccuracyMeters: Number(body.maxGpsAccuracyMeters) || DEFAULT_MAX_GPS_ACCURACY_METERS,
      previousCheckPoint: prevPing,
      currentTimestampMs: Date.now(),
    });

    if (!validation.accepted) {
      const rejectedAttempt: RejectedAttendanceAttempt = {
        id: `att-rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId,
        employeeCode: body.employeeCode ? String(body.employeeCode) : undefined,
        employeeName,
        department: body.department ? String(body.department) : undefined,
        designation: body.designation ? String(body.designation) : undefined,
        assignedOfficeId: office.assignedOfficeId,
        assignedOfficeName: office.assignedOfficeName,
        officeLatitude: isValidCoordinatePair(office.officeLatitude, office.officeLongitude)
          ? office.officeLatitude
          : undefined,
        officeLongitude: isValidCoordinatePair(office.officeLatitude, office.officeLongitude)
          ? office.officeLongitude
          : undefined,
        allowedRadiusMeters: validation.allowedRadiusMeters,
        attemptType: 'Check In',
        attendanceDate,
        attemptTime,
        latitude: Number.isFinite(empLat) ? empLat : undefined,
        longitude: Number.isFinite(empLng) ? empLng : undefined,
        distanceMeters: validation.distanceMeters,
        gpsAccuracyMeters: gpsAccuracy,
        gpsValidationStatus: 'Rejected',
        rejectionReason: validation.reason,
        deviceInfo: body.deviceInfo ? String(body.deviceInfo) : req.headers['user-agent'],
        createdAt: new Date().toISOString(),
      };
      await persistRejectedAttempt(rejectedAttempt);
      return res.status(403).json({
        accepted: false,
        errorCode: validation.errorCode,
        distanceMeters: validation.distanceMeters,
        allowedRadiusMeters: validation.allowedRadiusMeters,
        gpsValidationStatus: 'Rejected',
        reason: validation.reason,
        rejectedAttempt,
      });
    }

    lastEmployeeGpsPing.set(employeeId, {
      latitude: empLat,
      longitude: empLng,
      timestampMs: Date.now(),
    });

    const resolvedShiftStart =
      (isMobileSource
        ? caller.shiftStartTime || resolvedEmployee.shiftStartTime || body.shiftStartTime
        : body.shiftStartTime || caller.shiftStartTime || resolvedEmployee.shiftStartTime) ||
      payrollSettingsStore.shiftStartTime ||
      DEFAULT_SHIFT_START_TIME;
    const resolvedGraceMinutes =
      isMobileSource
        ? caller.gracePeriodMinutes ??
          resolvedEmployee.gracePeriodMinutes ??
          (body.gracePeriodMinutes !== undefined ? Number(body.gracePeriodMinutes) : undefined) ??
          payrollSettingsStore.lateGracePeriodMinutes ??
          DEFAULT_GRACE_PERIOD_MINUTES
        : body.gracePeriodMinutes !== undefined
        ? Number(body.gracePeriodMinutes)
        : caller.gracePeriodMinutes ??
          resolvedEmployee.gracePeriodMinutes ??
          payrollSettingsStore.lateGracePeriodMinutes ??
          DEFAULT_GRACE_PERIOD_MINUTES;

    const shiftCalc = calculateShiftAttendanceStatus({
      checkInTime,
      shiftStartTime: resolvedShiftStart,
      gracePeriodMinutes: resolvedGraceMinutes,
      standardDailyHours: Number(body.standardDailyHours) || 8,
    });

    const nowIso = new Date().toISOString();
    const record: AttendanceRecord = {
      id: `att-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
      userId: caller.id,
      fieldForceId: employeeId,
      employeeId,
      employeeCode: employeeCode || undefined,
      employeeName,
      employeeCategory: body.employeeCategory,
      department: body.department ? String(body.department) : resolvedEmployee.department || 'Operations',
      designation: body.designation ? String(body.designation) : resolvedEmployee.designation,
      date: attendanceDate,
      status: shiftCalc.status,
      inTime: checkInTime,
      checkInTime,
      isLate: shiftCalc.isLate,
      lateMinutes: shiftCalc.lateDurationMinutes,
      lateDurationMinutes: shiftCalc.lateDurationMinutes,
      workHours: 0,
      overtimeHours: 0,
      assignedOfficeId: office.assignedOfficeId,
      assignedOfficeName: office.assignedOfficeName,
      officeLatitude: office.officeLatitude,
      officeLongitude: office.officeLongitude,
      allowedRadiusMeters: validation.allowedRadiusMeters,
      checkInLatitude: empLat,
      checkInLongitude: empLng,
      checkInDistanceMeters: validation.distanceMeters,
      checkInGpsAccuracyMeters: gpsAccuracy,
      checkInLocationText: `${empLat.toFixed(6)}, ${empLng.toFixed(6)}`,
      gpsValidationStatus: 'Accepted',
      validationReason: validation.reason,
      remarks: `GPS Check-In Accepted (${validation.distanceMeters}m from ${office.assignedOfficeName})`,
      recordedBy: caller.name || 'Mobile GPS Geofence',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const dbResult = await persistAcceptedAttendance(record);

    return res.status(200).json({
      accepted: true,
      distanceMeters: validation.distanceMeters,
      allowedRadiusMeters: validation.allowedRadiusMeters,
      gpsValidationStatus: 'Accepted',
      reason: validation.reason,
      record,
      dbSynced: dbResult.dbSynced,
      dbError: dbResult.dbError,
      dbCode: dbResult.dbCode,
    });
  });

  // --------------------------------------------------------------------------
  // Authoritative Attendance Check-Out (Authenticated ERP User + GPS Validation)
  // --------------------------------------------------------------------------
  app.post('/api/attendance/check-out', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        accepted: false,
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required. Please sign in to Ensec ERP before checking out.',
      });
    }

    const resolvedEmployee = await resolveEmployeeProfileForCaller(caller);
    if (!resolvedEmployee) {
      return res.status(403).json({
        accepted: false,
        errorCode: 'EMPLOYEE_UNRESOLVED',
        reason: 'Unable to resolve an active employee profile for this ERP user.',
      });
    }

    const body = req.body || {};
    const isMobileSource =
      req.headers['x-mobile-portal'] === 'true' || body.source === 'mobile-field';

    if (isMobileSource || !['Super Admin', 'HR', 'Admin'].includes(String(caller.role || ''))) {
      const identityCheck = verifyTransactionIdentityMatchesUser(
        {
          userId: body.userId,
          employeeId: body.employeeId,
          fieldForceId: body.fieldForceId,
          employeeCode: body.employeeCode,
          salespersonId: body.salespersonId,
          assignedSalespersonId: body.assignedSalespersonId,
          repId: body.repId,
          ffCode: body.ffCode,
          employee: body.employee && typeof body.employee === 'object' ? body.employee : undefined,
        },
        resolvedEmployee
      );
      if (!identityCheck.valid) {
        return res.status(403).json({
          accepted: false,
          errorCode: 'IDENTITY_MISMATCH',
          reason: identityCheck.reason,
        });
      }
    }

    const employeeId = isMobileSource
      ? resolvedEmployee.employeeId
      : String(body.employeeId || resolvedEmployee.employeeId).trim();
    const employeeCode = isMobileSource
      ? resolvedEmployee.employeeCode
      : String(body.employeeCode || resolvedEmployee.employeeCode).trim();
    const employeeName = isMobileSource
      ? resolvedEmployee.name
      : String(body.employeeName || resolvedEmployee.name).trim();
    if (!employeeId || !employeeName) {
      return res.status(400).json({
        accepted: false,
        reason: 'Employee ID and Employee Name are required.',
      });
    }

    const attendanceDate = String(body.date || getTodayDateString()).slice(0, 10);
    const checkOutTime = String(body.checkOutTime || getCurrentTimeHHmm());
    const attemptTime = getCurrentTimeHHmmss();
    const key = `${employeeId}_${attendanceDate}`;

    // Reconcile existing check-in from server store or client-synced existingRecord
    const existing: AttendanceRecord | undefined =
      attendanceRecordsStore.get(key) ||
      (body.existingRecord && body.existingRecord.date === attendanceDate
        ? (body.existingRecord as AttendanceRecord)
        : undefined);

    if (!existing || !(existing.checkInTime || existing.inTime) || existing.status === 'Absent') {
      return res.status(400).json({
        accepted: false,
        errorCode: 'NO_CHECK_IN',
        reason: `Cannot Check Out: No valid Check-In record found for ${employeeName} on ${attendanceDate}.`,
      });
    }

    if (existing.checkOutTime || existing.outTime) {
      return res.status(409).json({
        accepted: false,
        errorCode: 'DUPLICATE_CHECK_OUT',
        reason: `Duplicate Check-Out blocked: ${employeeName} has already checked out on ${attendanceDate} at ${existing.checkOutTime || existing.outTime}.`,
      });
    }

    const office = await resolveOfficeForEmployee({
      ...body,
      user: caller,
      userId: caller.id,
      employeeId,
      employeeCode,
      employeeName,
      assignedOfficeId: body.assignedOfficeId || caller.assignedOfficeId || resolvedEmployee.assignedOfficeId,
    });
    const empLat = Number(body.latitude);
    const empLng = Number(body.longitude);
    const gpsAccuracy =
      body.accuracy !== undefined && body.accuracy !== null ? Number(body.accuracy) : undefined;
    const prevPing = lastEmployeeGpsPing.get(employeeId);

    const validation = evaluateGeofenceAttendance({
      employeeLatitude: empLat,
      employeeLongitude: empLng,
      gpsAccuracyMeters: gpsAccuracy,
      officeLatitude: office.officeLatitude,
      officeLongitude: office.officeLongitude,
      allowedRadiusMeters: office.allowedRadiusMeters,
      locationStatus: office.locationStatus,
      maxGpsAccuracyMeters: Number(body.maxGpsAccuracyMeters) || DEFAULT_MAX_GPS_ACCURACY_METERS,
      previousCheckPoint: prevPing,
      currentTimestampMs: Date.now(),
    });

    if (!validation.accepted) {
      const rejectedAttempt: RejectedAttendanceAttempt = {
        id: `att-rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId,
        employeeCode: body.employeeCode ? String(body.employeeCode) : existing.employeeCode,
        employeeName,
        department: body.department ? String(body.department) : existing.department,
        designation: body.designation ? String(body.designation) : existing.designation,
        assignedOfficeId: office.assignedOfficeId,
        assignedOfficeName: office.assignedOfficeName,
        officeLatitude: isValidCoordinatePair(office.officeLatitude, office.officeLongitude)
          ? office.officeLatitude
          : undefined,
        officeLongitude: isValidCoordinatePair(office.officeLatitude, office.officeLongitude)
          ? office.officeLongitude
          : undefined,
        allowedRadiusMeters: validation.allowedRadiusMeters,
        attemptType: 'Check Out',
        attendanceDate,
        attemptTime,
        latitude: Number.isFinite(empLat) ? empLat : undefined,
        longitude: Number.isFinite(empLng) ? empLng : undefined,
        distanceMeters: validation.distanceMeters,
        gpsAccuracyMeters: gpsAccuracy,
        gpsValidationStatus: 'Rejected',
        rejectionReason: validation.reason,
        deviceInfo: body.deviceInfo ? String(body.deviceInfo) : req.headers['user-agent'],
        createdAt: new Date().toISOString(),
      };
      await persistRejectedAttempt(rejectedAttempt);
      return res.status(403).json({
        accepted: false,
        errorCode: validation.errorCode,
        distanceMeters: validation.distanceMeters,
        allowedRadiusMeters: validation.allowedRadiusMeters,
        gpsValidationStatus: 'Rejected',
        reason: validation.reason,
        rejectedAttempt,
      });
    }

    lastEmployeeGpsPing.set(employeeId, {
      latitude: empLat,
      longitude: empLng,
      timestampMs: Date.now(),
    });

    const checkInTimeStr = existing.checkInTime || existing.inTime || '09:00';
    const resolvedShiftStartOut =
      (isMobileSource
        ? caller.shiftStartTime || resolvedEmployee.shiftStartTime || body.shiftStartTime
        : body.shiftStartTime || caller.shiftStartTime || resolvedEmployee.shiftStartTime) ||
      payrollSettingsStore.shiftStartTime ||
      DEFAULT_SHIFT_START_TIME;
    const resolvedGraceOut =
      isMobileSource
        ? caller.gracePeriodMinutes ??
          resolvedEmployee.gracePeriodMinutes ??
          (body.gracePeriodMinutes !== undefined ? Number(body.gracePeriodMinutes) : undefined) ??
          payrollSettingsStore.lateGracePeriodMinutes ??
          DEFAULT_GRACE_PERIOD_MINUTES
        : body.gracePeriodMinutes !== undefined
        ? Number(body.gracePeriodMinutes)
        : caller.gracePeriodMinutes ??
          resolvedEmployee.gracePeriodMinutes ??
          payrollSettingsStore.lateGracePeriodMinutes ??
          DEFAULT_GRACE_PERIOD_MINUTES;

    const shiftCalc = calculateShiftAttendanceStatus({
      checkInTime: checkInTimeStr,
      checkOutTime,
      shiftStartTime: resolvedShiftStartOut,
      gracePeriodMinutes: resolvedGraceOut,
      standardDailyHours: Number(body.standardDailyHours) || 8,
    });

    const updatedRecord: AttendanceRecord = {
      ...existing,
      outTime: checkOutTime,
      checkOutTime,
      workHours: shiftCalc.totalWorkingHours,
      overtimeHours: shiftCalc.overtimeHours,
      status: shiftCalc.status,
      isLate: existing.isLate ?? shiftCalc.isLate,
      lateMinutes: existing.lateMinutes ?? shiftCalc.lateDurationMinutes,
      lateDurationMinutes: existing.lateDurationMinutes ?? shiftCalc.lateDurationMinutes,
      checkOutLatitude: empLat,
      checkOutLongitude: empLng,
      checkOutDistanceMeters: validation.distanceMeters,
      checkOutGpsAccuracyMeters: gpsAccuracy,
      checkOutLocationText: `${empLat.toFixed(6)}, ${empLng.toFixed(6)}`,
      gpsValidationStatus: 'Accepted',
      validationReason: validation.reason,
      remarks: `${existing.remarks || ''} | Check-Out Accepted (${validation.distanceMeters}m)`.replace(/^\s*\|\s*/, ''),
      updatedAt: new Date().toISOString(),
    };

    const beforeOtSnapshot = await snapshotOtForEmployeeDate(employeeId, attendanceDate);
    const dbResult = await persistAcceptedAttendance(updatedRecord);
    let overtimeSync: any = null;
    try {
      overtimeSync = await syncAttendanceToOvertimeServer({
        attendanceRecord: updatedRecord,
        employeeRecord: {
          ...resolvedEmployee,
          id: employeeId,
          code: employeeCode,
          name: employeeName,
          department: existing.department,
          designation: existing.designation,
        },
        sourceMode: 'GPS',
        actorName: caller.name || employeeName,
        actorRole: caller.role || 'Staff',
        beforeOtSnapshot,
      });
    } catch (otErr) {
      console.warn('[GPS Check-Out Overtime Sync] Warning:', otErr);
    }

    return res.status(200).json({
      accepted: true,
      distanceMeters: validation.distanceMeters,
      allowedRadiusMeters: validation.allowedRadiusMeters,
      gpsValidationStatus: 'Accepted',
      reason: validation.reason,
      record: updatedRecord,
      overtimeSync,
      dbSynced: dbResult.dbSynced,
      dbError: dbResult.dbError,
      dbCode: dbResult.dbCode,
    });
  });

  app.post('/api/attendance/manual-upsert', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        success: false,
        errorCode: 'UNAUTHORIZED',
        error: 'Authentication required. Please sign in before updating attendance.',
      });
    }

    const roleStr = String(caller.role || '');
    const payrollPerm = caller.permissions?.pagePermissions?.payroll;
    const hasExplicitCreatePayroll = Boolean(payrollPerm?.actions?.create_payroll);
    const canManageAttendance =
      roleStr === 'Super Admin' ||
      hasExplicitCreatePayroll ||
      (!payrollPerm?.actions && ['Admin', 'HR', 'Manager', 'Accountant'].includes(roleStr));
    if (!canManageAttendance) {
      return res.status(403).json({
        success: false,
        errorCode: 'ATTENDANCE_FORBIDDEN',
        error: 'Permission denied: Process Monthly Payroll permission required.',
      });
    }

    const body = req.body || {};
    if (Array.isArray(body.employeesSnapshot)) {
      for (const rep of body.employeesSnapshot) {
        indexFieldForceRepInCache(rep);
      }
    }
    if (body.payrollSettings && typeof body.payrollSettings === 'object') {
      payrollSettingsStore = { ...payrollSettingsStore, ...body.payrollSettings };
    }

    const inputRecords: AttendanceRecord[] = Array.isArray(body.records)
      ? body.records
      : body.record
      ? [body.record]
      : [];

    if (inputRecords.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one attendance record is required.',
      });
    }

    const savedRecords: AttendanceRecord[] = [];
    const overtimeSyncResults: any[] = [];
    let allDbSynced = true;
    let firstDbError: string | undefined;
    let firstDbCode: string | undefined;

    for (const rawRec of inputRecords) {
      if (!rawRec || !rawRec.employeeId || !rawRec.date) continue;
      const empId = String(rawRec.employeeId).trim();
      const attDate = String(rawRec.date).slice(0, 10);
      const lockKey = `${empId}_${attDate}`;

      const synced = await withAttendanceLock(lockKey, async () => {
        const existing = attendanceRecordsStore.get(lockKey);
        const nowIso = new Date().toISOString();
        const inVal = rawRec.inTime ?? rawRec.checkInTime ?? '';
        const outVal = rawRec.outTime ?? rawRec.checkOutTime ?? '';

        const nextRecord: AttendanceRecord = {
          ...(existing || {}),
          ...rawRec,
          id:
            rawRec.id ||
            existing?.id ||
            `att-${empId}-${attDate}-${Date.now().toString().slice(-4)}`,
          fieldForceId: rawRec.fieldForceId || empId,
          employeeId: empId,
          date: attDate,
          inTime: inVal || undefined,
          checkInTime: inVal || undefined,
          outTime: outVal || undefined,
          checkOutTime: outVal || undefined,
          gpsValidationStatus:
            rawRec.gpsValidationStatus || existing?.gpsValidationStatus || 'Manual',
          createdAt: existing?.createdAt || rawRec.createdAt || nowIso,
          updatedAt: nowIso,
        };

        const empCached = fieldForceRepsCache.get(empId);
        const beforeOtSnapshot = await snapshotOtForEmployeeDate(
          empId,
          attDate,
          nextRecord.employeeCode || empCached?.code
        );

        const dbResult = await persistAcceptedAttendance(nextRecord);
        if (!dbResult.dbSynced) {
          allDbSynced = false;
          if (!firstDbError && dbResult.dbError) firstDbError = dbResult.dbError;
          if (!firstDbCode && dbResult.dbCode) firstDbCode = dbResult.dbCode;
        }

        let otSync: any = null;
        try {
          otSync = await syncAttendanceToOvertimeServer({
            attendanceRecord: nextRecord,
            employeeRecord: empCached || {
              id: empId,
              code: nextRecord.employeeCode,
              name: nextRecord.employeeName,
              department: nextRecord.department,
              designation: nextRecord.designation,
              employeeCategory: nextRecord.employeeCategory,
            },
            sourceMode: 'MANUAL',
            actorName: caller.name || 'Payroll Admin',
            actorRole: caller.role || 'Admin',
            beforeOtSnapshot,
          });
        } catch (otErr) {
          console.warn('[Manual Attendance Overtime Sync] Warning:', otErr);
        }

        return { nextRecord, otSync };
      });

      savedRecords.push(synced.nextRecord);
      if (synced.otSync) {
        overtimeSyncResults.push({
          employeeId: synced.nextRecord.employeeId,
          date: synced.nextRecord.date,
          ...synced.otSync,
        });
      }
    }

    return res.status(200).json({
      success: true,
      records: savedRecords,
      overtimeSyncResults,
      dbSynced: allDbSynced,
      dbError: firstDbError,
      dbCode: firstDbCode,
    });
  });

  app.get('/api/attendance/records', (_req, res) => {
    res.json({
      records: Array.from(attendanceRecordsStore.values()),
      rejectedAttempts: rejectedAttemptsStore,
    });
  });

  app.post('/api/attendance/sync', (req, res) => {
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    for (const r of records) {
      if (r && r.employeeId && r.date) {
        attendanceRecordsStore.set(`${r.employeeId}_${r.date}`, r);
      }
    }
    res.json({ synced: attendanceRecordsStore.size });
  });

  // ============================================================================
  // ERP AUTH SESSION, EMPLOYEE RESOLUTION & MANUFACTURING / MOBILE APIs
  // ============================================================================
  const ERP_SESSION_SECRET =
    process.env.ERP_SESSION_SECRET ||
    crypto.createHash('sha256').update(`${SUPABASE_URL}:ensec-erp-session-key`).digest('hex');
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  const erpActiveSessions = new Map<string, { user: any; createdAt: number; expiresAt: number }>();
  const revokedSessionTokens = new Set<string>();

  const mfgOrdersCache = new Map<string, any>();
  const mfgIssuesCache = new Map<string, any>();
  const mfgRawMaterialsCache = new Map<string, any>();
  const mfgBatchesCache = new Map<string, any>();
  const overtimeRequestsCache = new Map<string, any>();
  const overtimeRequisitionLocks = new Map<string, Promise<void>>();
  const overtimeAttendancesCache = new Map<string, any>();
  const overtimePoliciesCache = new Map<string, any>();

  const withRequisitionLock = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    const prev = overtimeRequisitionLocks.get(id) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => next);
    overtimeRequisitionLocks.set(id, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (overtimeRequisitionLocks.get(id) === chained) {
        overtimeRequisitionLocks.delete(id);
      }
    }
  };

  const snapshotOtForEmployeeDate = async (
    employeeId: string,
    attendanceDate: string,
    employeeCode?: string | null
  ): Promise<OvertimeRequest | null> => {
    try {
      const list = await loadAuthoritativeOvertimeRequests();
      const active = findDuplicateOvertimeRequest(
        list as OvertimeRequest[],
        employeeId,
        employeeCode,
        attendanceDate
      );
      if (active) return { ...active };
      const cancelled = findCancelledOvertimeRequest(
        list as OvertimeRequest[],
        employeeId,
        employeeCode,
        attendanceDate
      );
      return cancelled ? { ...cancelled } : null;
    } catch {
      return null;
    }
  };

  const persistOvertimeAuditLogServer = async (entry: {
    recordId: string;
    action: string;
    actorName: string;
    actorRole: string;
    details: string;
    previousState?: string;
    newState?: string;
  }) => {
    if (!serverSupabase) return;
    try {
      await serverSupabase.from('overtime_audit_logs').insert({
        id: `ota-srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        record_id: entry.recordId,
        record_type: 'REQUEST',
        action: entry.action,
        actor_name: entry.actorName,
        actor_role: entry.actorRole,
        timestamp: new Date().toISOString(),
        details: entry.details,
        previous_state: entry.previousState || null,
        new_state: entry.newState || null,
      });
    } catch {
      // Non-fatal audit log write failure
    }
  };

  const syncAttendanceToOvertimeServer = async (params: {
    attendanceRecord: AttendanceRecord;
    employeeRecord?: any;
    sourceMode: AttendanceOvertimeSourceMode;
    actorName?: string;
    actorRole?: string;
    beforeOtSnapshot?: OvertimeRequest | null;
  }): Promise<{
    action: QrOvertimeSyncResult['action'];
    eligibility: QrOvertimeSyncResult['eligibility'];
    request?: OvertimeRequest;
    message: string;
  }> => {
    const {
      attendanceRecord,
      employeeRecord,
      sourceMode,
      actorName = 'Attendance Synchronization',
      actorRole = 'System',
      beforeOtSnapshot = null,
    } = params;

    const nowIso = new Date().toISOString();

    if (serverSupabase) {
      try {
        const { data: psRow } = await serverSupabase
          .from('payroll_settings')
          .select('shift_start_time, shift_end_time, deduction_rules')
          .eq('id', 'default')
          .maybeSingle();
        if (psRow) {
          payrollSettingsStore = {
            ...payrollSettingsStore,
            shiftStartTime:
              payrollSettingsStore.shiftStartTime ||
              psRow.shift_start_time ||
              psRow.deduction_rules?.shiftStartTime,
            shiftEndTime:
              payrollSettingsStore.shiftEndTime ||
              psRow.shift_end_time ||
              psRow.deduction_rules?.shiftEndTime,
          };
        }
      } catch {
        // Use current payrollSettingsStore fallback
      }
    }

    const existingReqsList = await loadAuthoritativeOvertimeRequests();
    for (const er of existingReqsList) {
      if (er?.id) overtimeRequestsCache.set(String(er.id), er);
    }

    const empId = String(attendanceRecord.employeeId || employeeRecord?.id || '').trim();
    const empCode = employeeRecord?.code || attendanceRecord.employeeCode || 'EMP-000';
    const attDate = String(attendanceRecord.date || '').slice(0, 10);

    let resolvedEmp: any = employeeRecord || fieldForceRepsCache.get(empId);
    if (!resolvedEmp && serverSupabase && empId) {
      try {
        const { data: empRow } = await serverSupabase
          .from('field_force_reps')
          .select('*')
          .eq('id', empId)
          .maybeSingle();
        if (empRow) resolvedEmp = empRow;
      } catch {
        // Fallback to attendance fields
      }
    }

    let salaryBasic =
      Number(resolvedEmp?.basicSalaryBDT ?? resolvedEmp?.basic_salary_bdt) || 0;
    let salaryGross = salaryBasic > 0 ? Math.round(salaryBasic * 1.6) : 0;
    if (serverSupabase && empId) {
      try {
        const { data: salRow } = await serverSupabase
          .from('employee_salary_structures')
          .select('basic_salary_bdt, gross_salary_bdt')
          .eq('employee_id', empId)
          .maybeSingle();
        if (salRow) {
          salaryBasic = Number(salRow.basic_salary_bdt) || salaryBasic;
          salaryGross = Number(salRow.gross_salary_bdt) || salaryGross;
        }
      } catch {
        // Keep fallback
      }
    }
    if (!salaryBasic) salaryBasic = 25000;
    if (!salaryGross) salaryGross = Math.round(salaryBasic * 1.6);

    const empOtPolicy: Partial<EmployeeOvertimePolicy> = {
      id: `pol-${empId}`,
      employeeId: empId,
      isEligible:
        resolvedEmp?.isOvertimeEligible !== false &&
        resolvedEmp?.is_overtime_eligible !== false,
      calculationBasis:
        resolvedEmp?.overtimeCalculationBasis ||
        resolvedEmp?.overtime_calculation_basis ||
        'Basic Salary',
      standardMonthlyWorkingHours:
        Number(
          resolvedEmp?.overtimeStandardMonthlyHours ||
            resolvedEmp?.overtime_standard_hours
        ) || 208,
      overtimeMultiplier:
        resolvedEmp?.overtimeMultiplier !== undefined &&
        resolvedEmp?.overtimeMultiplier !== null
          ? Number(resolvedEmp.overtimeMultiplier)
          : resolvedEmp?.overtime_multiplier !== undefined &&
            resolvedEmp?.overtime_multiplier !== null
          ? Number(resolvedEmp.overtime_multiplier)
          : 2.0,
      fixedHourlyRateBDT:
        Number(
          resolvedEmp?.overtimeFixedHourlyRateBDT ||
            resolvedEmp?.overtime_fixed_rate ||
            resolvedEmp?.overtime_fixed_hourly_rate_bdt
        ) || 0,
      status:
        resolvedEmp?.overtimePolicyStatus ||
        resolvedEmp?.overtime_policy_status ||
        'Active',
    };

    // Check if DB trigger already created/updated/cancelled the row during employee_attendances upsert
    const afterActive = findDuplicateOvertimeRequest(
      existingReqsList as OvertimeRequest[],
      empId,
      empCode,
      attDate
    );
    const afterCancelled = !afterActive
      ? findCancelledOvertimeRequest(
          existingReqsList as OvertimeRequest[],
          empId,
          empCode,
          attDate
        )
      : undefined;
    const afterRow = afterActive || afterCancelled || null;

    const triggerAlreadyHandled = Boolean(
      afterRow &&
        ((!beforeOtSnapshot && afterRow.status !== 'Cancelled') ||
          (beforeOtSnapshot &&
            beforeOtSnapshot.id === afterRow.id &&
            (beforeOtSnapshot.status !== afterRow.status ||
              beforeOtSnapshot.expectedHours !== afterRow.expectedHours ||
              beforeOtSnapshot.expectedEndTime !== afterRow.expectedEndTime ||
              beforeOtSnapshot.expectedStartTime !== afterRow.expectedStartTime)))
    );

    const otResult = reconcileAttendanceOvertimeRequest({
      existingRequests: existingReqsList as OvertimeRequest[],
      attendanceRecord,
      employee: {
        id: empId,
        code: empCode,
        name: resolvedEmp?.name || attendanceRecord.employeeName || 'Staff Member',
        department: resolvedEmp?.department || attendanceRecord.department || 'Operations',
        designation: resolvedEmp?.designation || attendanceRecord.designation || 'Staff',
        employeeCategory:
          resolvedEmp?.employeeCategory ||
          resolvedEmp?.employee_category ||
          attendanceRecord.employeeCategory,
        basicSalaryBDT: salaryBasic,
      },
      salaryBasicBDT: salaryBasic,
      salaryGrossBDT: salaryGross,
      policy: empOtPolicy,
      defaultShiftEndTime: payrollSettingsStore?.shiftEndTime || DEFAULT_SHIFT_END_TIME,
      defaultShiftStartTime: payrollSettingsStore?.shiftStartTime || DEFAULT_SHIFT_START_TIME,
      nowIso,
      sourceMode,
      actorName,
    });

    if (triggerAlreadyHandled && afterRow) {
      overtimeRequestsCache.set(String(afterRow.id), afterRow);
      const inferredAction: QrOvertimeSyncResult['action'] =
        !beforeOtSnapshot
          ? 'CREATED'
          : afterRow.status === 'Cancelled' && beforeOtSnapshot.status !== 'Cancelled'
          ? 'CANCELLED'
          : 'UPDATED';
      const inferredMsg =
        inferredAction === 'CREATED'
          ? `Auto-generated Overtime Request ${afterRow.requestNumber} (${afterRow.expectedHours}h OT on ${attDate}).`
          : inferredAction === 'CANCELLED'
          ? `Cancelled Pending Overtime Request ${afterRow.requestNumber}: ${afterRow.cancellationReason || 'Attendance OUT Time Updated – No Overtime'}.`
          : `Updated pending Overtime Request ${afterRow.requestNumber} to ${afterRow.expectedHours}h.`;

      return {
        action: inferredAction,
        eligibility: otResult.eligibility,
        request: afterRow,
        message: inferredMsg,
      };
    }

    if (
      (otResult.action === 'CREATED' ||
        otResult.action === 'UPDATED' ||
        otResult.action === 'CANCELLED') &&
      otResult.request
    ) {
      const otReq = otResult.request;
      overtimeRequestsCache.set(String(otReq.id), otReq);

      if (serverSupabase) {
        if (otResult.action === 'CANCELLED') {
          const cancelFields: Record<string, any> = {
            status: 'Cancelled',
            attendance_id: otReq.attendanceId || null,
            actual_overtime_hours: 0,
            cancellation_reason: otReq.cancellationReason || 'Attendance OUT Time Updated – No Overtime',
            cancelled_by: otReq.cancelledBy || actorName,
            cancelled_at: otReq.cancelledAt || nowIso,
            rejection_reason: otReq.cancellationReason || 'Attendance OUT Time Updated – No Overtime',
            updated_at: otReq.updatedAt || nowIso,
          };
          for (let attempt = 0; attempt < 6; attempt++) {
            const { error: cancelErr } = await serverSupabase
              .from('overtime_requests')
              .update(cancelFields)
              .eq('id', otReq.id);
            if (!cancelErr) break;
            const msg = String(cancelErr.message || '');
            const missingCol =
              cancelErr.code === 'PGRST204' || msg.includes('schema cache')
                ? msg.match(/Could not find the '([^']+)' column/i)?.[1]
                : cancelErr.code === '42703' || msg.toLowerCase().includes('does not exist')
                ? msg.match(/column\s+"([^"]+)"/i)?.[1] ||
                  msg.match(/column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i)?.[1]
                : null;
            if (missingCol && Object.prototype.hasOwnProperty.call(cancelFields, missingCol)) {
              delete cancelFields[missingCol];
              continue;
            }
            break;
          }
        } else if (otResult.action === 'UPDATED') {
          const updateFields: Record<string, any> = {
            expected_start_time: otReq.expectedStartTime,
            expected_end_time: otReq.expectedEndTime,
            expected_hours: otReq.expectedHours,
            actual_overtime_hours: otReq.actualOvertimeHours ?? otReq.expectedHours,
            attendance_id: otReq.attendanceId || null,
            basic_salary_bdt: otReq.basicSalaryBDT || 0,
            hourly_rate_bdt: otReq.hourlyRateBDT || 0,
            overtime_multiplier: otReq.overtimeMultiplier ?? 2.0,
            calculated_overtime_amount_bdt: otReq.calculatedOvertimeAmountBDT || 0,
            overtime_reason: otReq.overtimeReason,
            updated_at: otReq.updatedAt || nowIso,
          };
          await serverSupabase
            .from('overtime_requests')
            .update(updateFields)
            .eq('id', otReq.id);
        } else {
          const workingInsert: Record<string, any> = {
            id: otReq.id,
            request_number: otReq.requestNumber,
            employee_id: otReq.employeeId,
            employee_code: otReq.employeeCode,
            employee_name: otReq.employeeName,
            department: otReq.department,
            designation: otReq.designation,
            employee_category: otReq.employeeCategory || 'Factory Employee',
            overtime_date: otReq.overtimeDate,
            purpose_category: otReq.purposeCategory,
            project_purpose: otReq.projectPurpose ?? '',
            source_type: otReq.sourceType || 'ATTENDANCE_AUTO',
            expected_start_time: otReq.expectedStartTime,
            expected_end_time: otReq.expectedEndTime,
            expected_hours: otReq.expectedHours,
            overtime_reason: otReq.overtimeReason,
            requested_by: otReq.requestedBy,
            requested_at: otReq.requestedAt,
            status: otReq.status,
            attendance_id: otReq.attendanceId || null,
            actual_overtime_hours: otReq.actualOvertimeHours ?? otReq.expectedHours,
            basic_salary_bdt: otReq.basicSalaryBDT || 0,
            hourly_rate_bdt: otReq.hourlyRateBDT || 0,
            overtime_multiplier: otReq.overtimeMultiplier ?? 2.0,
            calculated_overtime_amount_bdt: otReq.calculatedOvertimeAmountBDT || 0,
            is_payroll_processed: false,
            is_costing_allocated: false,
            created_at: otReq.createdAt,
            updated_at: otReq.updatedAt || nowIso,
          };
          for (let attempt = 0; attempt < 8; attempt++) {
            const { error: otErr } = await serverSupabase
              .from('overtime_requests')
              .upsert(workingInsert, { onConflict: 'id' });
            if (!otErr) break;
            const msg = String(otErr.message || '');
            let missingCol: string | null = null;
            if (otErr.code === 'PGRST204' || msg.includes('schema cache')) {
              missingCol = msg.match(/Could not find the '([^']+)' column/i)?.[1] || null;
            } else if (otErr.code === '42703' || msg.toLowerCase().includes('does not exist')) {
              missingCol =
                msg.match(/column\s+"([^"]+)"/i)?.[1] ||
                msg.match(/column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i)?.[1] ||
                null;
            }
            if (missingCol && Object.prototype.hasOwnProperty.call(workingInsert, missingCol)) {
              delete workingInsert[missingCol];
              continue;
            }
            if (otErr.code === '23505' && msg.includes('request_number')) {
              const fallbackSeq = generateNextOvertimeRequestNumber([
                ...existingReqsList,
                otReq,
              ]);
              otReq.requestNumber = `${fallbackSeq}-${Date.now().toString().slice(-3)}`;
              workingInsert.request_number = otReq.requestNumber;
              continue;
            }
            break;
          }
        }
      }

      if (otResult.auditDetails) {
        await persistOvertimeAuditLogServer({
          recordId: otReq.id,
          action: `ATTENDANCE_AUTO_${otResult.action}`,
          actorName,
          actorRole,
          details: otResult.auditDetails,
          previousState: otResult.previousStatus,
          newState: otReq.status,
        });
      }
    } else if (
      (otResult.action === 'LOCKED_APPROVED' ||
        otResult.action === 'LOCKED_REJECTED' ||
        otResult.action === 'LOCKED_CANCELLED') &&
      otResult.request &&
      otResult.auditDetails
    ) {
      await persistOvertimeAuditLogServer({
        recordId: otResult.request.id,
        action: `ATTENDANCE_SYNC_${otResult.action}`,
        actorName,
        actorRole,
        details: otResult.auditDetails,
        previousState: otResult.request.status,
        newState: otResult.request.status,
      });
    }

    return {
      action: otResult.action,
      eligibility: otResult.eligibility,
      request: otResult.request,
      message: otResult.message,
    };
  };
  const mobileTransactionsStore = {
    orders: [] as any[],
    customers: [] as any[],
    tada: [] as any[],
    warranty: [] as any[],
    visits: [] as any[],
    leaves: [] as any[],
    crmLeads: [] as any[],
  };

  const signErpSessionToken = (user: any): string => {
    const payload = {
      uid: String(user.id),
      code: String(user.userId || ''),
      email: String(user.email || ''),
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS,
      nonce: crypto.randomBytes(8).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', ERP_SESSION_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  };

  const verifyErpSessionToken = (token?: string | null): { uid: string; code: string; email: string; exp: number } | null => {
    if (!token || revokedSessionTokens.has(token)) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', ERP_SESSION_SECRET).update(encoded).digest('base64url');
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expectedSig);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (!parsed || !parsed.uid || (parsed.exp && Date.now() > Number(parsed.exp))) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const ERP_QR_SECRET =
    process.env.ERP_QR_SECRET ||
    crypto.createHash('sha256').update(`${SUPABASE_URL}:ensec-employee-qr-v1`).digest('hex');

  const signEmployeeQrToken = (employeeId: string, employeeCode: string): string => {
    const cleanId = String(employeeId || '').trim();
    const cleanCode = String(employeeCode || cleanId).trim();
    const idB64 = Buffer.from(cleanId, 'utf8').toString('base64url');
    const codeB64 = Buffer.from(cleanCode, 'utf8').toString('base64url');
    const body = `ENS1.${idB64}.${codeB64}`;
    const sig = crypto
      .createHmac('sha256', ERP_QR_SECRET)
      .update(body)
      .digest('base64url')
      .slice(0, 16);
    return `${body}.${sig}`;
  };

  const verifyEmployeeQrToken = (
    rawPayload: string
  ): { valid: boolean; employeeId?: string; employeeCode?: string; reason?: string } => {
    const trimmed = String(rawPayload || '').trim();
    if (!trimmed) {
      return { valid: false, reason: 'Empty QR code payload.' };
    }
    const parts = trimmed.split('.');
    if (parts.length !== 4 || parts[0] !== 'ENS1') {
      return {
        valid: false,
        reason: 'Invalid employee QR code format. Only official Ensec Employee QR badges are accepted.',
      };
    }
    const [prefix, idB64, codeB64, sig] = parts;
    const body = `${prefix}.${idB64}.${codeB64}`;
    const expectedSig = crypto
      .createHmac('sha256', ERP_QR_SECRET)
      .update(body)
      .digest('base64url')
      .slice(0, 16);
    try {
      const a = Buffer.from(sig, 'utf8');
      const b = Buffer.from(expectedSig, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: 'QR code security signature verification failed.' };
      }
      const employeeId = Buffer.from(idB64, 'base64url').toString('utf8').trim();
      const employeeCode = Buffer.from(codeB64, 'base64url').toString('utf8').trim();
      if (!employeeId) {
        return { valid: false, reason: 'QR code does not contain a valid employee ID.' };
      }
      return { valid: true, employeeId, employeeCode };
    } catch {
      return { valid: false, reason: 'Unable to decode employee QR code payload.' };
    }
  };

  const indexFieldForceRepInCache = (rep: any) => {
    if (!rep || typeof rep !== 'object' || !rep.id) return;
    fieldForceRepsCache.set(String(rep.id), rep as FieldForceRep);
  };

  const mapSupabaseFieldForceRow = (row: any): FieldForceRep => ({
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    code: row.code || '',
    pin: row.pin || undefined,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || undefined,
    designation: row.designation || 'Territory Sales Officer',
    fieldForceType: row.field_force_type || undefined,
    department: row.department || undefined,
    region: row.region || '',
    area: row.area || '',
    territory: row.territory || '',
    branchWorkplace: row.branch_workplace || undefined,
    tadaApproverId: row.tada_approver_id || undefined,
    tadaApproverName: row.tada_approver_name || undefined,
    monthlyTargetBDT: Number(row.monthly_target_bdt) || 0,
    monthlyAchievedBDT: Number(row.monthly_achieved_bdt) || 0,
    isActive: row.is_active !== false,
    status: row.is_active === false ? 'Inactive' : 'Active',
  });

  const lookupAuthoritativeUser = async (
    hdrId: string,
    hdrCode: string,
    hdrEmail: string
  ): Promise<any | null> => {
    // 1. Prefer authoritative Supabase users table when available
    if (serverSupabase) {
      try {
        if (hdrEmail) {
          const { data } = await serverSupabase
            .from('users')
            .select('*')
            .ilike('email', hdrEmail)
            .limit(1)
            .maybeSingle();
          if (data) {
            const mapped = mapSupabaseUserRow(data);
            indexUserInMfgCache(mapped);
            return mapped;
          }
        }
        const lookupUid = hdrCode || hdrId;
        if (lookupUid) {
          const { data } = await serverSupabase
            .from('users')
            .select('*')
            .eq('uid', lookupUid)
            .limit(1)
            .maybeSingle();
          if (data) {
            const mapped = mapSupabaseUserRow(data);
            indexUserInMfgCache(mapped);
            return mapped;
          }
        }
        if (/^u-sb-(\d+)$/i.test(hdrId)) {
          const numId = Number(hdrId.replace(/^u-sb-/i, ''));
          const { data } = await serverSupabase
            .from('users')
            .select('*')
            .eq('id', numId)
            .limit(1)
            .maybeSingle();
          if (data) {
            const mapped = mapSupabaseUserRow(data);
            indexUserInMfgCache(mapped);
            return mapped;
          }
        }
      } catch {
        // Fall back to server in-memory store below
      }
    }

    // 2. Fallback to synchronized server user cache
    const candidates = [hdrId, hdrCode, hdrEmail]
      .map((s) => s.toLowerCase())
      .filter(Boolean);
    for (const key of candidates) {
      const hit = mfgUsersCache.get(key);
      if (hit) return hit;
    }

    return null;
  };

  const resolveRequestUser = async (req: express.Request): Promise<any | null> => {
    const authHeader = String(req.headers['authorization'] || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const sessionToken = String(req.headers['x-erp-session-token'] || bearerToken || '').trim();

    if (sessionToken) {
      if (revokedSessionTokens.has(sessionToken)) {
        return null;
      }
      const tokenClaims = verifyErpSessionToken(sessionToken);
      if (!tokenClaims) {
        return null;
      }
      const storedSession = erpActiveSessions.get(sessionToken);
      if (storedSession && Date.now() > storedSession.expiresAt) {
        erpActiveSessions.delete(sessionToken);
        return null;
      }
      const freshUser =
        (await lookupAuthoritativeUser(tokenClaims.uid, tokenClaims.code, tokenClaims.email)) ||
        storedSession?.user;
      if (!freshUser || freshUser.status === 'Blocked' || freshUser.status === 'Inactive') {
        return null;
      }
      return freshUser;
    }

    const hdrId = String(req.headers['x-user-id'] || req.query.userId || '').trim();
    const hdrCode = String(req.headers['x-user-code'] || '').trim();
    const hdrEmail = String(req.headers['x-user-email'] || req.query.userEmail || '').trim();

    if (!hdrId && !hdrCode && !hdrEmail) {
      return null;
    }

    const resolved = await lookupAuthoritativeUser(hdrId, hdrCode, hdrEmail);
    if (!resolved || resolved.status === 'Blocked' || resolved.status === 'Inactive') {
      return null;
    }
    return resolved;
  };

  const resolveEmployeeProfileForCaller = async (
    caller: any
  ): Promise<ResolvedMobileEmployeeProfile | null> => {
    if (!caller) return null;
    const mergedMap = new Map<string, FieldForceRep>(fieldForceRepsCache);

    if (serverSupabase) {
      try {
        const { data } = await serverSupabase
          .from('field_force_reps')
          .select('*')
          .order('id', { ascending: true });
        if (Array.isArray(data)) {
          for (const row of data) {
            const mapped = mapSupabaseFieldForceRow(row);
            const cached = mergedMap.get(mapped.id);
            // Prefer cached richer client fields (like unsynced userId if column not yet migrated)
            mergedMap.set(mapped.id, {
              ...mapped,
              ...(cached?.userId && !mapped.userId ? { userId: cached.userId } : {}),
            });
          }
        }
      } catch {
        // Use in-memory cache fallback
      }
    }

    return resolveEmployeeForERPUser(
      caller,
      Array.from(mergedMap.values()),
      Array.from(officeLocationsStore.values())
    );
  };

  const handleSyncContext = (req: express.Request, res: express.Response) => {
    const body = req.body || {};
    if (Array.isArray(body.users)) {
      for (const u of body.users) {
        indexUserInMfgCache(u);
      }
    }
    if (Array.isArray(body.fieldForceReps)) {
      for (const rep of body.fieldForceReps) {
        indexFieldForceRepInCache(rep);
      }
    }
    if (Array.isArray(body.productionOrders)) {
      for (const po of body.productionOrders) {
        if (po && (po.id || po.orderNumber)) {
          mfgOrdersCache.set(String(po.id || po.orderNumber), po);
        }
      }
    }
    if (Array.isArray(body.materialIssues)) {
      for (const mi of body.materialIssues) {
        if (mi && (mi.id || mi.productionOrderId)) {
          mfgIssuesCache.set(String(mi.id || mi.productionOrderId), mi);
        }
      }
    }
    if (Array.isArray(body.rawMaterials)) {
      for (const rm of body.rawMaterials) {
        if (rm && (rm.id || rm.code)) {
          mfgRawMaterialsCache.set(String(rm.id || rm.code), rm);
        }
      }
    }
    if (Array.isArray(body.inventoryBatches)) {
      for (const b of body.inventoryBatches) {
        if (b && (b.id || b.batchNumber)) {
          mfgBatchesCache.set(String(b.id || b.batchNumber), b);
        }
      }
    }
    if (Array.isArray(body.overtimeRequests)) {
      for (const reqItem of body.overtimeRequests) {
        if (reqItem && (reqItem.id || reqItem.requestNumber)) {
          overtimeRequestsCache.set(String(reqItem.id || reqItem.requestNumber), reqItem);
        }
      }
    }
    if (Array.isArray(body.overtimeAttendances)) {
      for (const att of body.overtimeAttendances) {
        if (att && att.id) {
          overtimeAttendancesCache.set(String(att.id), att);
        }
      }
    }
    if (Array.isArray(body.overtimePolicies)) {
      for (const pol of body.overtimePolicies) {
        if (pol && pol.id) {
          overtimePoliciesCache.set(String(pol.id), pol);
        }
      }
    }
    if (Array.isArray(body.attendanceRecords)) {
      for (const attRec of body.attendanceRecords) {
        if (attRec && attRec.employeeId && attRec.date) {
          const k = `${attRec.employeeId}_${attRec.date}`;
          if (!attendanceRecordsStore.has(k)) {
            attendanceRecordsStore.set(k, attRec);
          }
        }
      }
    }
    if (body.payrollSettings && typeof body.payrollSettings === 'object') {
      payrollSettingsStore = { ...payrollSettingsStore, ...body.payrollSettings };
    }
    res.json({ ok: true });
  };

  app.post('/api/manufacturing/sync-state', handleSyncContext);
  app.post('/api/erp/sync-context', handleSyncContext);

  // --------------------------------------------------------------------------
  // Employee QR Code Token Issuance & Automatic QR Attendance Scanning
  // --------------------------------------------------------------------------
  app.post('/api/employees/qr-tokens', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        error: 'Authentication required to generate employee QR codes.',
      });
    }

    const reqEmployees = Array.isArray(req.body?.employees) ? req.body.employees : [];
    const tokens: Record<string, string> = {};
    const tokenByCode: Record<string, string> = {};

    for (const item of reqEmployees) {
      if (!item || !item.id) continue;
      const empId = String(item.id).trim();
      const cachedRep = fieldForceRepsCache.get(empId);
      const empCode = String(item.code || cachedRep?.code || empId).trim();
      const token = signEmployeeQrToken(empId, empCode);
      tokens[empId] = token;
      if (empCode) {
        tokenByCode[empCode] = token;
      }
    }

    if (reqEmployees.length === 0) {
      for (const rep of fieldForceRepsCache.values()) {
        if (!rep?.id) continue;
        const empCode = String(rep.code || rep.id).trim();
        const token = signEmployeeQrToken(rep.id, empCode);
        tokens[rep.id] = token;
        if (empCode) tokenByCode[empCode] = token;
      }
    }

    return res.status(200).json({ tokens, tokenByCode });
  });

  app.post('/api/attendance/qr-scan', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        success: false,
        duplicateBlocked: false,
        errorCode: 'UNAUTHORIZED',
        error: 'Authentication required. Please sign in to Ensec ERP to scan attendance.',
      });
    }

    const roleStr = String(caller.role || '');
    const isAdminOrHr = ['Super Admin', 'Admin', 'HR', 'Manager', 'Accountant'].includes(roleStr);
    const pagePerms = caller.permissions?.pagePermissions;
    const payrollTabs = caller.permissions?.payrollTabs;
    if (
      !isAdminOrHr &&
      ((pagePerms?.payroll && pagePerms.payroll.view === false) ||
        (payrollTabs && payrollTabs.attendance === false))
    ) {
      return res.status(403).json({
        success: false,
        duplicateBlocked: false,
        errorCode: 'ATTENDANCE_SCAN_FORBIDDEN',
        error: 'You do not have permission to record attendance on this page.',
      });
    }

    const body = req.body || {};
    const qrPayload = String(body.qrPayload || body.qrToken || body.token || '').trim();
    const verified = verifyEmployeeQrToken(qrPayload);
    if (!verified.valid || !verified.employeeId) {
      return res.status(400).json({
        success: false,
        duplicateBlocked: false,
        errorCode: 'INVALID_QR_CODE',
        error: verified.reason || 'Invalid employee QR code.',
      });
    }

    if (Array.isArray(body.employeesSnapshot)) {
      for (const rep of body.employeesSnapshot) {
        indexFieldForceRepInCache(rep);
      }
    }
    if (body.payrollSettings && typeof body.payrollSettings === 'object') {
      payrollSettingsStore = { ...payrollSettingsStore, ...body.payrollSettings };
    }

    // Resolve authoritative employee record from cache or Supabase
    let resolvedRep: FieldForceRep | undefined = fieldForceRepsCache.get(verified.employeeId);
    if (!resolvedRep && verified.employeeCode) {
      for (const rep of fieldForceRepsCache.values()) {
        if (
          rep.code &&
          rep.code.toLowerCase() === verified.employeeCode.toLowerCase() &&
          String(rep.id) === String(verified.employeeId)
        ) {
          resolvedRep = rep;
          break;
        }
      }
    }
    if (!resolvedRep && serverSupabase) {
      try {
        const { data: row } = await serverSupabase
          .from('field_force_reps')
          .select('*')
          .eq('id', verified.employeeId)
          .maybeSingle();
        if (row) {
          resolvedRep = {
            ...(row as any),
            id: String(row.id),
            code: row.code || verified.employeeCode || String(row.id),
            name: row.name || 'Employee',
            department: row.department || 'Operations',
            designation: row.designation || 'Executive',
            employeeCategory: row.employee_category || row.employeeCategory,
            status: row.status || 'Active',
            isActive: row.is_active !== false,
            branchWorkplace: row.branch_workplace || row.branchWorkplace,
            userId: row.user_id ? String(row.user_id) : undefined,
          } as FieldForceRep;
          indexFieldForceRepInCache(resolvedRep);
        }
      } catch {
        // Ignore and fall back to not found if missing
      }
    }

    if (!resolvedRep) {
      return res.status(404).json({
        success: false,
        duplicateBlocked: false,
        errorCode: 'EMPLOYEE_NOT_FOUND',
        error: `No matching employee record found for ID ${verified.employeeCode || verified.employeeId}.`,
      });
    }

    const isEmpInactive =
      resolvedRep.status === 'Inactive' ||
      resolvedRep.isActive === false ||
      resolvedRep.employmentStatus === 'Inactive' ||
      resolvedRep.employmentStatus === 'Terminated';
    if (isEmpInactive) {
      return res.status(403).json({
        success: false,
        duplicateBlocked: false,
        errorCode: 'EMPLOYEE_INACTIVE',
        error: `${resolvedRep.name} (${resolvedRep.code}) is currently Inactive and cannot record attendance.`,
        employee: {
          id: resolvedRep.id,
          code: resolvedRep.code,
          name: resolvedRep.name,
          department: resolvedRep.department,
          designation: resolvedRep.designation,
          employeeCategory: resolvedRep.employeeCategory,
        },
      });
    }

    const serverClock = getServerAttendanceDateTime(new Date());
    const attendanceDate = serverClock.date;
    const scanTime24 = serverClock.time24;
    const lockKey = `${resolvedRep.id}_${attendanceDate}`;
    const cooldownOverrideMs = Number(body._testCooldownMs);
    const effectiveCooldownMs =
      Number.isFinite(cooldownOverrideMs) && cooldownOverrideMs >= 0
        ? cooldownOverrideMs
        : QR_SCAN_COOLDOWN_MS;

    return await withAttendanceLock(lockKey, async () => {
      const nowMs = Date.now();
      const prevScanMs = lastQrScanCooldownMap.get(resolvedRep!.id);
      if (prevScanMs && nowMs - prevScanMs < effectiveCooldownMs) {
        const remainingMs = effectiveCooldownMs - (nowMs - prevScanMs);
        const existingRec = attendanceRecordsStore.get(lockKey);
        return res.status(429).json({
          success: false,
          duplicateBlocked: true,
          errorCode: 'DUPLICATE_SCAN_COOLDOWN',
          cooldownRemainingMs: remainingMs,
          error: `Please wait ${Math.ceil(remainingMs / 1000)}s before scanning ${resolvedRep!.name} again.`,
          employee: {
            id: resolvedRep!.id,
            code: resolvedRep!.code,
            name: resolvedRep!.name,
            department: resolvedRep!.department,
            designation: resolvedRep!.designation,
            employeeCategory: resolvedRep!.employeeCategory,
          },
          date: attendanceDate,
          record: existingRec,
        });
      }

      // Reconcile existing attendance record from memory store, Supabase DB, or client snapshot fallback
      let existing = attendanceRecordsStore.get(lockKey);
      if (!existing && serverSupabase) {
        try {
          const { data: dbRow } = await serverSupabase
            .from('employee_attendances')
            .select('*')
            .eq('employee_id', resolvedRep!.id)
            .eq('date', attendanceDate)
            .maybeSingle();
          if (dbRow) {
            existing = {
              id: String(dbRow.id),
              fieldForceId: String(dbRow.employee_id),
              employeeId: String(dbRow.employee_id),
              employeeCode: dbRow.employee_code || resolvedRep!.code,
              employeeName: dbRow.employee_name || resolvedRep!.name,
              department: dbRow.department || resolvedRep!.department,
              designation: dbRow.designation || resolvedRep!.designation,
              date: String(dbRow.date),
              status: dbRow.status || 'Present',
              inTime: dbRow.in_time || undefined,
              checkInTime: dbRow.in_time || undefined,
              outTime: dbRow.out_time || undefined,
              checkOutTime: dbRow.out_time || undefined,
              workHours: Number(dbRow.work_hours) || 0,
              overtimeHours: Number(dbRow.overtime_hours) || 0,
              lateDurationMinutes: Number(dbRow.late_duration_minutes) || 0,
              lateMinutes: Number(dbRow.late_duration_minutes) || 0,
              gpsValidationStatus: (dbRow.gps_validation_status || 'Manual') as AttendanceRecord['gpsValidationStatus'],
              remarks: dbRow.remarks || undefined,
              createdAt: dbRow.created_at || undefined,
              updatedAt: dbRow.updated_at || undefined,
            };
            attendanceRecordsStore.set(lockKey, existing);
          }
        } catch {
          // Ignore DB lookup fallback errors
        }
      }
      if (!existing && body.existingRecord && body.existingRecord.date === attendanceDate) {
        const snap = body.existingRecord as AttendanceRecord;
        if (
          String(snap.employeeId || snap.fieldForceId || '') === String(resolvedRep!.id) ||
          (resolvedRep!.code && snap.employeeCode === resolvedRep!.code)
        ) {
          existing = snap;
          attendanceRecordsStore.set(lockKey, existing);
        }
      }

      let linkedQrUser = findLinkedUserForEmployee(
        resolvedRep!,
        Array.from(mfgUsersCache.values())
      );
      if (!linkedQrUser && serverSupabase) {
        try {
          const { data: userRows } = await serverSupabase.from('users').select('*');
          if (Array.isArray(userRows)) {
            const mappedUsers = userRows.map(mapSupabaseUserRow);
            for (const mu of mappedUsers) {
              indexUserInMfgCache(mu);
            }
            linkedQrUser = findLinkedUserForEmployee(resolvedRep!, mappedUsers);
          }
        } catch {
          // Use cached user/settings fallback
        }
      }
      const qrGeoCfg = resolveGeofenceConfigFromUser(
        linkedQrUser,
        Array.from(officeLocationsStore.values()),
        payrollSettingsStore,
        resolvedRep!.branchWorkplace
      );

      const shiftStartTime = qrGeoCfg.shiftStartTime;
      const gracePeriodMinutes = qrGeoCfg.gracePeriodMinutes;
      const standardDailyHours = qrGeoCfg.standardDailyHours;

      const existingIn = String(existing?.inTime || existing?.checkInTime || '').trim();
      const existingOut = String(existing?.outTime || existing?.checkOutTime || '').trim();
      const nowIso = serverClock.iso;

      let action: 'IN' | 'OUT' | 'OUT_UPDATE';
      let statusMessage: string;
      let nextRecord: AttendanceRecord;

      if (!existing || !existingIn || existing.status === 'Absent') {
        // 1st Scan — Record IN Time
        action = 'IN';
        statusMessage = 'IN Recorded Successfully';
        const shiftCalc = calculateShiftAttendanceStatus({
          checkInTime: scanTime24,
          shiftStartTime,
          gracePeriodMinutes,
          standardDailyHours,
        });

        nextRecord = {
          id: existing?.id || `att-qr-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
          userId: linkedQrUser?.id || caller.id,
          fieldForceId: resolvedRep!.id,
          employeeId: resolvedRep!.id,
          employeeCode: resolvedRep!.code || undefined,
          employeeName: resolvedRep!.name,
          employeeCategory: resolvedRep!.employeeCategory as AttendanceRecord['employeeCategory'],
          department: resolvedRep!.department || 'Operations',
          designation: resolvedRep!.designation,
          assignedOfficeId: qrGeoCfg.assignedOfficeId,
          assignedOfficeName: qrGeoCfg.assignedOfficeName,
          date: attendanceDate,
          status: shiftCalc.status,
          inTime: scanTime24,
          checkInTime: scanTime24,
          outTime: undefined,
          checkOutTime: undefined,
          workHours: 0,
          overtimeHours: 0,
          isLate: shiftCalc.isLate,
          lateMinutes: shiftCalc.lateDurationMinutes,
          lateDurationMinutes: shiftCalc.lateDurationMinutes,
          gpsValidationStatus: 'QR Scan',
          scanMethod: 'QR',
          scanCount: 1,
          lastScanAt: nowIso,
          validationReason: `QR Scan IN at ${serverClock.time12} (${serverClock.date})`,
          remarks: `QR Scan IN at ${serverClock.time12}`,
          recordedBy: caller.name || 'QR Attendance Scanner',
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
        };
      } else if (!existingOut) {
        // 2nd Scan — Record OUT Time (preserve original IN Time untouched!)
        action = 'OUT';
        statusMessage = 'OUT Recorded Successfully';
        const shiftCalc = calculateShiftAttendanceStatus({
          checkInTime: existingIn,
          checkOutTime: scanTime24,
          shiftStartTime,
          gracePeriodMinutes,
          standardDailyHours,
        });

        nextRecord = {
          ...existing,
          inTime: existingIn,
          checkInTime: existingIn,
          outTime: scanTime24,
          checkOutTime: scanTime24,
          workHours: shiftCalc.totalWorkingHours,
          overtimeHours: shiftCalc.overtimeHours,
          status: existing.isLate || existing.status === 'Late' ? 'Late' : shiftCalc.status,
          isLate: existing.isLate ?? shiftCalc.isLate,
          lateMinutes: existing.lateMinutes ?? existing.lateDurationMinutes ?? shiftCalc.lateDurationMinutes,
          lateDurationMinutes:
            existing.lateDurationMinutes ?? existing.lateMinutes ?? shiftCalc.lateDurationMinutes,
          gpsValidationStatus: existing.gpsValidationStatus === 'Accepted' ? 'Accepted' : 'QR Scan',
          scanMethod: 'QR',
          scanCount: Math.max(2, (existing.scanCount || 1) + 1),
          lastScanAt: nowIso,
          validationReason: `QR Scan OUT at ${serverClock.time12}`,
          remarks: `${existing.remarks || `IN ${formatTime12Hour(existingIn) || existingIn}`} | QR Scan OUT at ${serverClock.time12}`,
          updatedAt: nowIso,
        };
      } else {
        // 3rd+ Scan — Update ONLY OUT Time (NEVER overwrite first IN Time!)
        action = 'OUT_UPDATE';
        statusMessage = 'OUT Updated Successfully';
        const shiftCalc = calculateShiftAttendanceStatus({
          checkInTime: existingIn,
          checkOutTime: scanTime24,
          shiftStartTime,
          gracePeriodMinutes,
          standardDailyHours,
        });

        const baseRemarks = String(existing.remarks || `IN ${formatTime12Hour(existingIn) || existingIn}`)
          .split('|')[0]
          .trim();

        nextRecord = {
          ...existing,
          inTime: existingIn,
          checkInTime: existingIn,
          outTime: scanTime24,
          checkOutTime: scanTime24,
          workHours: shiftCalc.totalWorkingHours,
          overtimeHours: shiftCalc.overtimeHours,
          status: existing.isLate || existing.status === 'Late' ? 'Late' : shiftCalc.status,
          isLate: existing.isLate ?? shiftCalc.isLate,
          lateMinutes: existing.lateMinutes ?? existing.lateDurationMinutes ?? shiftCalc.lateDurationMinutes,
          lateDurationMinutes:
            existing.lateDurationMinutes ?? existing.lateMinutes ?? shiftCalc.lateDurationMinutes,
          gpsValidationStatus: existing.gpsValidationStatus === 'Accepted' ? 'Accepted' : 'QR Scan',
          scanMethod: 'QR',
          scanCount: Math.max(3, (existing.scanCount || 2) + 1),
          lastScanAt: nowIso,
          validationReason: `QR Scan OUT updated at ${serverClock.time12}`,
          remarks: `${baseRemarks} | QR Scan OUT updated at ${serverClock.time12}`,
          updatedAt: nowIso,
        };
      }

      lastQrScanCooldownMap.set(resolvedRep!.id, Date.now());
      const beforeOtSnapshot =
        action === 'OUT' || action === 'OUT_UPDATE'
          ? await snapshotOtForEmployeeDate(
              resolvedRep!.id,
              attendanceDate,
              resolvedRep!.code
            )
          : null;
      const dbResult = await persistAcceptedAttendance(nextRecord);

      let overtimeSync: any = null;
      if (action === 'OUT' || action === 'OUT_UPDATE') {
        try {
          overtimeSync = await syncAttendanceToOvertimeServer({
            attendanceRecord: nextRecord,
            employeeRecord: resolvedRep!,
            sourceMode: 'QR',
            actorName: caller.name || 'QR Attendance Automation',
            actorRole: caller.role || 'System',
            beforeOtSnapshot,
          });
        } catch (otErr) {
          console.warn('[QR Overtime Automation] Server reconciliation warning:', otErr);
        }
      }

      return res.status(200).json({
        success: true,
        duplicateBlocked: false,
        action,
        statusLabel: action === 'IN' ? 'IN' : 'OUT',
        statusMessage,
        date: attendanceDate,
        recordedTime24: scanTime24,
        recordedTime12: serverClock.time12,
        inTime: nextRecord.inTime || nextRecord.checkInTime,
        outTime: nextRecord.outTime || nextRecord.checkOutTime,
        employee: {
          id: resolvedRep!.id,
          code: resolvedRep!.code,
          name: resolvedRep!.name,
          department: resolvedRep!.department,
          designation: resolvedRep!.designation,
          employeeCategory: resolvedRep!.employeeCategory,
        },
        record: nextRecord,
        overtimeSync,
        dbSynced: dbResult.dbSynced,
        dbError: dbResult.dbError,
        dbCode: dbResult.dbCode,
      });
    });
  });

  app.post('/api/auth/session', async (req, res) => {
    const body = req.body || {};
    const suppliedUser = body.user;
    if (!suppliedUser || !suppliedUser.id || suppliedUser.id === 'guest') {
      return res.status(401).json({
        authenticated: false,
        error: 'Valid authenticated ERP user is required to establish a session.',
      });
    }

    // Index supplied user snapshot into server cache, then verify against authoritative record if available
    const sanitizedUser = {
      ...suppliedUser,
      password: '',
    };
    const dbUser = await lookupAuthoritativeUser(
      String(suppliedUser.id || ''),
      String(suppliedUser.userId || suppliedUser.salesmanCode || ''),
      String(suppliedUser.email || '')
    );

    const authoritativeUser = dbUser
      ? {
          ...sanitizedUser,
          ...dbUser,
          password: '',
        }
      : sanitizedUser;

    if (
      suppliedUser.status === 'Blocked' ||
      suppliedUser.status === 'Inactive' ||
      authoritativeUser.status === 'Blocked' ||
      authoritativeUser.status === 'Inactive'
    ) {
      return res.status(403).json({
        authenticated: false,
        error: `Account is currently ${
          suppliedUser.status === 'Blocked' || suppliedUser.status === 'Inactive'
            ? suppliedUser.status
            : authoritativeUser.status
        }.`,
      });
    }

    indexUserInMfgCache(authoritativeUser);
    if (Array.isArray(body.fieldForceReps)) {
      for (const rep of body.fieldForceReps) {
        indexFieldForceRepInCache(rep);
      }
    }
    if (Array.isArray(body.officeLocations)) {
      for (const loc of body.officeLocations) {
        if (loc && loc.id && loc.name) {
          officeLocationsStore.set(String(loc.id), {
            id: String(loc.id),
            code: loc.code,
            name: String(loc.name),
            address: String(loc.address || ''),
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            allowedRadiusMeters: Number(loc.allowedRadiusMeters) || DEFAULT_ALLOWED_RADIUS_METERS,
            status: loc.status === 'Inactive' ? 'Inactive' : 'Active',
          });
        }
      }
    }
    const token = signErpSessionToken(authoritativeUser);
    const now = Date.now();
    erpActiveSessions.set(token, {
      user: authoritativeUser,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });

    const employee = await resolveEmployeeProfileForCaller(authoritativeUser);
    return res.status(200).json({
      authenticated: true,
      token,
      user: authoritativeUser,
      employee,
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        authenticated: false,
        error: 'Session expired or not authenticated.',
      });
    }
    const employee = await resolveEmployeeProfileForCaller(caller);
    return res.status(200).json({
      authenticated: true,
      user: { ...caller, password: '' },
      employee,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = String(req.headers['authorization'] || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const token = String(req.headers['x-erp-session-token'] || bearerToken || req.body?.token || '').trim();
    if (token) {
      erpActiveSessions.delete(token);
      revokedSessionTokens.add(token);
    }
    res.json({ ok: true, loggedOut: true });
  });

  app.get('/api/mobile-field/me', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        authenticated: false,
        error: 'Session expired or not authenticated. Please log into Ensec ERP.',
      });
    }
    const employee = await resolveEmployeeProfileForCaller(caller);
    if (!employee) {
      return res.status(403).json({
        authenticated: false,
        error: 'No active employee profile could be resolved for this user.',
      });
    }
    return res.status(200).json({
      authenticated: true,
      user: {
        id: caller.id,
        userId: caller.userId,
        name: caller.name,
        email: caller.email,
        phone: caller.phone,
        role: caller.role,
        designation: caller.designation,
        department: caller.department,
        status: caller.status,
      },
      employee,
    });
  });

  const reverseGeocodeCache = new Map<string, { address: string; displayName: string; cachedAt: number }>();

  app.get('/api/geocode/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!isValidCoordinatePair(lat, lng)) {
      return res.status(400).json({ ok: false, error: 'Invalid latitude or longitude.' });
    }

    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = reverseGeocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 24 * 60 * 60 * 1000) {
      return res.json({
        ok: true,
        lat,
        lng,
        address: cached.address,
        displayName: cached.displayName,
        cached: true,
      });
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat.toFixed(6)
      )}&lon=${encodeURIComponent(lng.toFixed(6))}&zoom=18&addressdetails=1`;
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'EnsecERP/1.0 (https://ensecbd.com)',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!upstream.ok) {
        return res.status(502).json({ ok: false, error: `Geocoder HTTP ${upstream.status}` });
      }

      const data: any = await upstream.json();
      const addr = data?.address || {};
      const streetPart = [addr.house_number, addr.road].filter(Boolean).join(' ').trim();
      const areaPart =
        addr.quarter ||
        addr.neighbourhood ||
        addr.suburb ||
        addr.village ||
        addr.town ||
        '';
      const cityPart = addr.city || addr.state_district || addr.county || '';
      const postcodePart = addr.postcode ? `${cityPart ? '-' : ''}${addr.postcode}` : '';
      const parts = [
        streetPart,
        areaPart,
        cityPart ? `${cityPart}${postcodePart}` : addr.postcode || '',
      ].filter((p, idx, arr) => Boolean(p) && arr.indexOf(p) === idx);

      const formattedAddress =
        parts.join(', ').trim() || String(data?.display_name || '').trim();
      const displayName = String(data?.display_name || formattedAddress).trim();

      if (formattedAddress) {
        reverseGeocodeCache.set(cacheKey, {
          address: formattedAddress,
          displayName,
          cachedAt: Date.now(),
        });
      }

      return res.json({
        ok: true,
        lat,
        lng,
        address: formattedAddress,
        displayName,
      });
    } catch (err: any) {
      return res.status(502).json({
        ok: false,
        error: err?.message || 'Reverse geocoding failed.',
      });
    }
  });

  app.get('/api/manufacturing/permissions', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const permissions = resolveManufacturingCostPermissions(caller);
    res.json({ authenticated: Boolean(caller), permissions });
  });

  app.get('/api/manufacturing/production-orders', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const permissions = resolveManufacturingCostPermissions(caller);

    let orders: any[] = Array.from(mfgOrdersCache.values());
    if (serverSupabase) {
      try {
        const { data } = await serverSupabase
          .from('production_orders')
          .select('*')
          .order('id', { ascending: false });
        if (Array.isArray(data) && data.length > 0) {
          orders = data.map((row: any) => ({
            id: String(row.id),
            orderNumber: row.order_number || row.orderNumber || `PO-${row.id}`,
            batchNumber: row.batch_number || row.batchNumber || '',
            productId: row.product_id || row.productId || '',
            productName: row.product_name || row.productName || '',
            model: row.model || '',
            plannedQty: Number(row.planned_qty ?? row.plannedQty ?? 0),
            completedQty: Number(row.completed_qty ?? row.completedQty ?? 0),
            rawMaterialCostBDT: Number(row.raw_material_cost_bdt ?? row.rawMaterialCostBDT ?? 0),
            conversionCostBDT: Number(row.conversion_cost_bdt ?? row.conversionCostBDT ?? 0),
            optimumLaborCostBDT: Number(row.optimum_labor_cost_bdt ?? row.optimumLaborCostBDT ?? 0),
            factoryOverheadBDT: Number(row.factory_overhead_bdt ?? row.factoryOverheadBDT ?? 0),
            costPerUnitBDT: Number(row.cost_per_unit_bdt ?? row.costPerUnitBDT ?? 0),
            totalProductionCostBDT: Number(row.total_production_cost_bdt ?? row.totalProductionCostBDT ?? 0),
            wastagePercent: Number(row.wastage_percent ?? row.wastagePercent ?? 0),
            scrapKg: Number(row.scrap_kg ?? row.scrapKg ?? 0),
            status: row.status || 'In Production',
            date: row.date || row.start_date || '',
            fgReceivingStatus: row.fg_receiving_status || row.fgReceivingStatus,
            receivedFgQty: row.received_fg_qty ?? row.receivedFgQty,
          }));
        }
      } catch {
        // Use in-memory cache fallback
      }
    }

    const sanitizedOrders = orders.map((order) => sanitizeProductionOrderForUser(order, caller));
    res.json({ permissions, orders: sanitizedOrders });
  });

  app.get('/api/manufacturing/cost-sheet/:orderId', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeCostSheetForUser(caller);
    if (!auth.allowed) {
      return res.status(403).json({
        allowed: false,
        code: 'COST_SHEET_FORBIDDEN',
        error: auth.reason || 'Forbidden: View Cost Sheet permission is disabled.',
      });
    }

    const rawOrderId = String(req.params.orderId || '').trim();
    const targetLower = rawOrderId.toLowerCase();

    let order = Array.from(mfgOrdersCache.values()).find(
      (po) =>
        String(po.id || '').toLowerCase() === targetLower ||
        String(po.orderNumber || '').toLowerCase() === targetLower ||
        String(po.batchNumber || '').toLowerCase() === targetLower
    );

    if (!order && serverSupabase) {
      try {
        const { data } = await serverSupabase.from('production_orders').select('*');
        if (Array.isArray(data)) {
          const hit = data.find(
            (row: any) =>
              String(row.id || '').toLowerCase() === targetLower ||
              String(row.order_number || '').toLowerCase() === targetLower ||
              String(row.batch_number || '').toLowerCase() === targetLower
          );
          if (hit) {
            order = {
              id: String(hit.id),
              orderNumber: hit.order_number || `PO-${hit.id}`,
              batchNumber: hit.batch_number || '',
              productId: hit.product_id || '',
              productName: hit.product_name || '',
              model: hit.model || '',
              plannedQty: Number(hit.planned_qty ?? 0),
              completedQty: Number(hit.completed_qty ?? 0),
              rawMaterialCostBDT: Number(hit.raw_material_cost_bdt ?? 0),
              conversionCostBDT: Number(hit.conversion_cost_bdt ?? 0),
              optimumLaborCostBDT: Number(hit.optimum_labor_cost_bdt ?? 0),
              factoryOverheadBDT: Number(hit.factory_overhead_bdt ?? 0),
              costPerUnitBDT: Number(hit.cost_per_unit_bdt ?? 0),
              totalProductionCostBDT: Number(hit.total_production_cost_bdt ?? 0),
              status: hit.status || 'In Production',
              date: hit.date || hit.start_date || '',
            };
          }
        }
      } catch {
        // Ignore if table unavailable
      }
    }

    if (!order) {
      return res.status(404).json({
        allowed: true,
        error: `Production order or batch "${rawOrderId}" not found.`,
      });
    }

    return res.status(200).json({
      allowed: true,
      order,
    });
  });

  app.get('/api/manufacturing/material-issue-context/:orderId', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const rawOrderId = String(req.params.orderId || '').trim();
    const targetLower = rawOrderId.toLowerCase();

    const orders = Array.from(mfgOrdersCache.values());
    const order =
      orders.find(
        (po) =>
          String(po.id || '').toLowerCase() === targetLower ||
          String(po.orderNumber || '').toLowerCase() === targetLower ||
          String(po.batchNumber || '').toLowerCase() === targetLower
      ) || { id: rawOrderId, orderNumber: rawOrderId };

    const issues = Array.from(mfgIssuesCache.values());
    const existingIssue =
      issues.find(
        (mi) =>
          String(mi.productionOrderId || '').toLowerCase() === String(order.id || targetLower).toLowerCase() ||
          String(mi.productionOrderNumber || '').toLowerCase() === String(order.orderNumber || targetLower).toLowerCase()
      ) || null;

    let rawMaterials = Array.from(mfgRawMaterialsCache.values());
    let batches = Array.from(mfgBatchesCache.values());

    if (serverSupabase && rawMaterials.length === 0) {
      try {
        const { data: rmRows } = await serverSupabase.from('raw_materials').select('*');
        if (Array.isArray(rmRows)) {
          rawMaterials = rmRows.map((r: any) => ({
            id: String(r.id),
            code: r.code,
            name: r.name,
            unit: r.unit,
            category: r.category,
            stockKushtia: Number(r.stock_kushtia ?? r.stock ?? 0),
            lastPurchaseUnitCostBDT: Number(r.last_purchase_unit_cost_bdt ?? r.unit_cost ?? 0),
            standardCostBDT: Number(r.standard_cost_bdt ?? 0),
          }));
        }
      } catch {
        // Ignore if unavailable
      }
    }

    if (serverSupabase && batches.length === 0) {
      try {
        const { data: batchRows } = await serverSupabase.from('inventory_batches').select('*');
        if (Array.isArray(batchRows)) {
          batches = batchRows.map((b: any) => ({
            id: String(b.id),
            batchNumber: b.batch_number || b.batchNumber,
            batchBarcode: b.batch_barcode || b.batchBarcode,
            materialId: String(b.material_id || b.materialId || ''),
            materialCode: b.material_code || b.materialCode || '',
            materialName: b.material_name || b.materialName || '',
            unitPurchaseRate: Number(b.unit_purchase_rate ?? b.unitPurchaseRate ?? 0),
            availableQty: Number(b.available_qty ?? b.availableQty ?? 0),
            receivedQty: Number(b.received_qty ?? b.receivedQty ?? 0),
            issuedQty: Number(b.issued_qty ?? b.issuedQty ?? 0),
            status: b.status || 'Active',
          }));
        }
      } catch {
        // Ignore if unavailable
      }
    }

    const itemsSource = existingIssue?.items || [];
    const totalVal = itemsSource.reduce(
      (sum: number, it: any) => sum + (Number(it.totalMaterialCostBDT) || (Number(it.issuedQty || it.quantity || 0) * Number(it.unitCostBDT || it.unitCost || 0))),
      0
    );

    const sanitized = sanitizeMaterialIssueContextForUser(
      {
        order,
        existingIssue,
        items: itemsSource,
        batches,
        rawMaterials,
        totalMaterialIssueValue: existingIssue?.totalMaterialCostBDT ?? totalVal,
      },
      caller
    );

    return res.status(200).json(sanitized);
  });

  app.post('/api/manufacturing/material-issues', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const batches = Array.from(mfgBatchesCache.values());
    const rawMaterials = Array.from(mfgRawMaterialsCache.values());

    // Authoritative server-side costing resolution (works even when user lacks View Batch Rate permission)
    let totalCost = 0;
    let totalQty = 0;
    const processedItems = items.map((item: any, idx: number) => {
      const qty = Math.max(0, Number(item.quantity) || 0);
      const batch = batches.find(
        (b) =>
          (item.batchId && String(b.id) === String(item.batchId)) ||
          (item.batchNumber && String(b.batchNumber) === String(item.batchNumber))
      );
      const rm = rawMaterials.find(
        (r) =>
          String(r.id) === String(item.materialId) ||
          (item.materialCode && String(r.code) === String(item.materialCode))
      );
      const authoritativeRate =
        Number(batch?.unitPurchaseRate) ||
        Number(rm?.lastPurchaseUnitCostBDT) ||
        Number(rm?.standardCostBDT) ||
        Number(item.unitCostBDT) ||
        0;
      const lineCost = qty * authoritativeRate;
      totalCost += lineCost;
      totalQty += qty;

      if (batch) {
        const nextAvail = Math.max(0, Number(batch.availableQty || 0) - qty);
        const nextIssued = Number(batch.issuedQty || 0) + qty;
        mfgBatchesCache.set(String(batch.id || batch.batchNumber), {
          ...batch,
          availableQty: nextAvail,
          issuedQty: nextIssued,
          status: nextAvail === 0 ? 'Depleted' : 'Active',
        });
      }

      return {
        id: `mii-srv-${Date.now()}-${idx}`,
        materialId: String(item.materialId || rm?.id || ''),
        materialCode: item.materialCode || rm?.code || '',
        materialName: item.materialName || rm?.name || '',
        batchNumber: item.batchNumber || batch?.batchNumber || '',
        batchBarcode: item.batchBarcode || batch?.batchBarcode || '',
        issuedQty: qty,
        unitCostBDT: authoritativeRate,
        totalMaterialCostBDT: lineCost,
      };
    });

    const issueRecord = {
      id: body.issueId || `mi-srv-${Date.now()}`,
      issueNumber: body.issueNumber || `MI-SRV-${Date.now().toString().slice(-4)}`,
      productionOrderId: String(body.productionOrderId || ''),
      productionOrderNumber: String(body.productionOrderNumber || ''),
      issuedBy: String(body.issuedBy || caller?.name || 'Production Supervisor'),
      issueDate: new Date().toISOString().slice(0, 10),
      totalIssuedQty: totalQty,
      totalMaterialCostBDT: totalCost,
      items: processedItems,
      status: 'Issued',
    };

    mfgIssuesCache.set(String(issueRecord.id), issueRecord);

    // Strip restricted financial fields from API response based on caller's permissions
    const sanitizedIssue = sanitizeMaterialIssueRecordForUser(issueRecord, caller);
    return res.status(200).json({
      success: true,
      issue: sanitizedIssue,
    });
  });

  // ============================================================================
  // OVERTIME MANAGEMENT HUB — PAGE-WISE AUTHORIZATION & API ROUTES
  // ============================================================================
  const loadAuthoritativeOvertimeRequests = async (): Promise<any[]> => {
    let list: any[] = Array.from(overtimeRequestsCache.values());
    if (serverSupabase) {
      try {
        const [{ data: reqRows }, { data: allocRows }] = await Promise.all([
          serverSupabase.from('overtime_requests').select('*').order('created_at', { ascending: false }),
          serverSupabase.from('overtime_batch_allocations').select('*').order('created_at', { ascending: true }),
        ]);
        if (Array.isArray(reqRows) && reqRows.length > 0) {
          const allocByReq = new Map<string, any[]>();
          if (Array.isArray(allocRows)) {
            for (const a of allocRows) {
              const arr = allocByReq.get(String(a.request_id)) || [];
              arr.push({
                id: String(a.id),
                productionOrderId: a.production_order_id || '',
                productionOrderNumber: a.production_order_number || '',
                productionBatchNumber: a.production_batch_number || '',
                productId: a.product_id || undefined,
                productName: a.product_name || '',
                processType: a.process_type || 'Spot Welding & Busbar',
                allocatedHours: Number(a.allocated_hours) || 0,
                hourlyRateBDT: Number(a.hourly_rate_bdt) || 0,
                allocatedCostBDT: Number(a.allocated_cost_bdt) || 0,
                isOverhead: Boolean(a.is_overhead),
                notes: a.notes || undefined,
              });
              allocByReq.set(String(a.request_id), arr);
            }
          }
          list = reqRows.map((r: any) => ({
            id: String(r.id),
            requestNumber: r.request_number,
            employeeId: String(r.employee_id),
            employeeCode: r.employee_code || '',
            employeeName: r.employee_name || '',
            department: r.department || '',
            designation: r.designation || '',
            employeeCategory: r.employee_category || undefined,
            overtimeDate: String(r.overtime_date),
            purposeCategory: r.purpose_category || 'Direct Production',
            productionOrderId: r.production_order_id || undefined,
            productionOrderNumber: r.production_order_number || undefined,
            productionBatchNumber: r.production_batch_number || undefined,
            productName: r.product_name || undefined,
            projectPurpose: r.project_purpose || '',
            sourceType: r.source_type || 'MANUAL',
            requisitionId: r.requisition_id || undefined,
            requisitionNumber: r.requisition_number || undefined,
            purposeId: r.purpose_id || undefined,
            purposeSelectedBy: r.purpose_selected_by || undefined,
            purposeSelectedAt: r.purpose_selected_at || undefined,
            expectedStartTime: r.expected_start_time || '18:00',
            expectedEndTime: r.expected_end_time || '22:00',
            expectedHours: Number(r.expected_hours) || 0,
            actualOvertimeHours: r.actual_overtime_hours !== null && r.actual_overtime_hours !== undefined ? Number(r.actual_overtime_hours) : undefined,
            overtimeReason: r.overtime_reason || '',
            requestedBy: r.requested_by || '',
            requestedAt: r.requested_at || r.created_at || new Date().toISOString(),
            status: r.status || 'Pending Supervisor',
            rejectionReason: r.rejection_reason || undefined,
            rejectedBy: r.rejected_by || undefined,
            rejectedAt: r.rejected_at || undefined,
            cancellationReason: r.cancellation_reason || undefined,
            cancelledBy: r.cancelled_by || undefined,
            cancelledAt: r.cancelled_at || undefined,
            attendanceId: r.attendance_id || undefined,
            basicSalaryBDT: Number(r.basic_salary_bdt) || 0,
            hourlyRateBDT: Number(r.hourly_rate_bdt) || 0,
            overtimeMultiplier: r.overtime_multiplier !== null && r.overtime_multiplier !== undefined ? Number(r.overtime_multiplier) : 2.0,
            calculatedOvertimeAmountBDT: Number(r.calculated_overtime_amount_bdt) || 0,
            batchAllocations: allocByReq.get(String(r.id)) || [],
            isPayrollProcessed: Boolean(r.is_payroll_processed),
            isCostingAllocated: Boolean(r.is_costing_allocated),
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || undefined,
          }));
        }
      } catch {
        // Fallback to in-memory cache
      }
    }
    return list;
  };

  app.get('/api/overtime/permissions', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const permissions = resolveOvertimePermissions(caller);
    res.json({ authenticated: Boolean(caller), permissions });
  });

  app.get('/api/overtime/requests', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'requests');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_REQUESTS_FORBIDDEN', error: auth.reason });
    }
    const requests = (await loadAuthoritativeOvertimeRequests()).map((r) => sanitizeOvertimeRecordForUser(r, caller));
    res.json({ allowed: true, requests });
  });

  app.post('/api/overtime/requests', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'requests');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_REQUESTS_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.createRequest) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_CREATE_FORBIDDEN', error: 'Forbidden: Create OT Request permission required.' });
    }
    const record = { ...(req.body || {}), id: req.body?.id || `otr-srv-${Date.now()}` };
    overtimeRequestsCache.set(String(record.id), record);
    return res.status(200).json({ allowed: true, request: sanitizeOvertimeRecordForUser(record, caller) });
  });

  app.put('/api/overtime/requests/:id', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'requests');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_REQUESTS_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.editRequest) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_EDIT_FORBIDDEN', error: 'Forbidden: Edit OT Request permission required.' });
    }
    const id = String(req.params.id || '');
    const existing = overtimeRequestsCache.get(id) || {};
    const updated = { ...existing, ...(req.body || {}), id, updatedAt: new Date().toISOString() };
    overtimeRequestsCache.set(id, updated);
    return res.status(200).json({ allowed: true, request: sanitizeOvertimeRecordForUser(updated, caller) });
  });

  app.delete('/api/overtime/requests/:id', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'requests');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_REQUESTS_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.editRequest && !perms.approveFinal) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_DELETE_FORBIDDEN', error: 'Forbidden: Edit or Final Approval clearance required to delete OT requests.' });
    }
    const id = String(req.params.id || '');
    overtimeRequestsCache.delete(id);
    if (serverSupabase) {
      try {
        await serverSupabase.from('overtime_requests').delete().eq('id', id);
      } catch {
        // Ignore if unavailable
      }
    }
    return res.status(200).json({ allowed: true, deletedId: id });
  });

  app.post('/api/overtime/requests/:id/workflow', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'requests');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_REQUESTS_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    const step = String(req.body?.step || '').toUpperCase();
    const stepOk =
      (step === 'SUPERVISOR' && (perms.approveSupervisor || perms.approveFinal)) ||
      (step === 'PRODUCTION' && (perms.approveProduction || perms.approveFinal)) ||
      (step === 'HR' && (perms.verifyHrAccounts || perms.approveFinal)) ||
      (step === 'FINAL' && perms.approveFinal);
    if (!stepOk) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_WORKFLOW_FORBIDDEN', error: `Forbidden: Missing approval clearance for step ${step || 'UNKNOWN'}.` });
    }
    const id = String(req.params.id || '');
    const existing = overtimeRequestsCache.get(id) || { id };
    return res.status(200).json({ allowed: true, request: sanitizeOvertimeRecordForUser(existing, caller) });
  });

  // ============================================================================
  // OVERTIME REQUISITION MODULE APIs (Factory Submission + Head Office Approval)
  // ============================================================================
  const OVERTIME_REQUISITIONS_SETTINGS_ID = 'overtime_requisitions';
  const OVERTIME_REQUISITIONS_STORE_LOCK = '__overtime_requisitions_store__';

  const isMissingSupabaseTableError = (err: any): boolean => {
    if (!err) return false;
    const code = String(err.code || '').toUpperCase();
    const msg = String(err.message || err.details || err.hint || '').toLowerCase();
    return (
      code === 'PGRST205' ||
      code === '42P01' ||
      msg.includes('could not find the table') ||
      msg.includes('schema cache') ||
      (msg.includes('relation') && msg.includes('does not exist'))
    );
  };

  const normalizeStoredOvertimeRequisition = (raw: any): OvertimeRequisition | null => {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const purposes = Array.isArray(raw.purposes)
      ? normalizeRequisitionPurposes(raw.purposes, id)
      : Array.isArray(raw.purposes_json)
      ? normalizeRequisitionPurposes(raw.purposes_json, id)
      : [];
    const approvalHistory: OvertimeRequisitionApprovalHistoryEntry[] = Array.isArray(raw.approvalHistory)
      ? raw.approvalHistory
          .filter((h: any) => h && typeof h === 'object')
          .map((h: any, idx: number) => ({
            id: String(h.id || `otrh-${id}-${idx}`),
            requisitionId: String(h.requisitionId || id),
            action: (h.action || 'SUBMITTED') as OvertimeRequisitionApprovalHistoryEntry['action'],
            actorId: h.actorId ? String(h.actorId) : undefined,
            actorName: String(h.actorName || 'System'),
            actorRole: h.actorRole ? String(h.actorRole) : undefined,
            remarks: h.remarks ? String(h.remarks) : undefined,
            previousStatus: h.previousStatus || undefined,
            newStatus: (h.newStatus || raw.status || 'Pending Approval') as OvertimeRequisition['status'],
            actionAt: String(h.actionAt || raw.submittedAt || raw.createdAt || new Date().toISOString()),
          }))
      : [];
    const submittedAt = String(raw.submittedAt || raw.submitted_at || raw.createdAt || raw.created_at || new Date().toISOString());
    return {
      id,
      requisitionNumber: String(raw.requisitionNumber || raw.requisition_number || id),
      requisitionDate: String(raw.requisitionDate || raw.requisition_date || submittedAt).slice(0, 10),
      overtimeDate: String(raw.overtimeDate || raw.overtime_date || '').slice(0, 10),
      requiredWorkers: Number(raw.requiredWorkers ?? raw.required_workers) || 0,
      requestedHours: Number(raw.requestedHours ?? raw.requested_hours) || 0,
      purpose:
        String(raw.purpose || '').trim() ||
        purposes.map((p) => p.purposeName).join(', '),
      purposes,
      remarks: raw.remarks ? String(raw.remarks) : undefined,
      requestedById: String(raw.requestedById || raw.requested_by_id || ''),
      requestedByName: String(raw.requestedByName || raw.requested_by_name || raw.requestedBy || raw.requested_by || ''),
      requestedBy: String(raw.requestedBy || raw.requested_by || raw.requestedByName || raw.requested_by_name || ''),
      requestedByRole: raw.requestedByRole || raw.requested_by_role || undefined,
      requestedByDepartment: raw.requestedByDepartment || raw.requested_by_department || undefined,
      submittedAt,
      status: (raw.status || 'Pending Approval') as OvertimeRequisition['status'],
      overtimeGranted: Boolean(raw.overtimeGranted ?? raw.overtime_granted),
      grantedAt: raw.grantedAt || raw.granted_at || undefined,
      approvedById: raw.approvedById || raw.approved_by_id || undefined,
      approvedByName: raw.approvedByName || raw.approved_by_name || undefined,
      approvedBy: raw.approvedBy || raw.approved_by || raw.approvedByName || raw.approved_by_name || undefined,
      approvedAt: raw.approvedAt || raw.approved_at || undefined,
      approvalRemarks: raw.approvalRemarks || raw.approval_remarks || undefined,
      returnedCount: Number(raw.returnedCount ?? raw.returned_count) || 0,
      lastResubmittedAt: raw.lastResubmittedAt || raw.last_resubmitted_at || undefined,
      approvalHistory,
      createdAt: String(raw.createdAt || raw.created_at || submittedAt),
      updatedAt: raw.updatedAt || raw.updated_at || undefined,
    };
  };

  const sortOvertimeRequisitionsDesc = (records: OvertimeRequisition[]): OvertimeRequisition[] =>
    [...records].sort((a, b) =>
      String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt))
    );

  const loadRequisitionsFromSystemSettings = async (): Promise<{
    records: OvertimeRequisition[];
    error?: string;
  }> => {
    if (!serverSupabase) {
      return { records: [], error: 'Supabase client is not configured on the server.' };
    }
    const { data, error } = await serverSupabase
      .from('system_settings')
      .select('id, settings_json, updated_at')
      .eq('id', OVERTIME_REQUISITIONS_SETTINGS_ID)
      .maybeSingle();

    if (error) {
      return { records: [], error: error.message || 'Failed to read overtime requisitions from Supabase.' };
    }

    const rawRecords = Array.isArray((data as any)?.settings_json?.records)
      ? (data as any).settings_json.records
      : [];
    const byId = new Map<string, OvertimeRequisition>();
    for (const item of rawRecords) {
      const normalized = normalizeStoredOvertimeRequisition(item);
      if (normalized) {
        byId.set(normalized.id, normalized);
      }
    }
    return { records: sortOvertimeRequisitionsDesc(Array.from(byId.values())) };
  };

  const saveRequisitionsToSystemSettings = async (
    records: OvertimeRequisition[],
    updatedBy: string,
    verifyRecord?: { id: string; expectedStatus?: OvertimeRequisition['status']; expectedUpdatedAt?: string }
  ): Promise<{ ok: boolean; records?: OvertimeRequisition[]; error?: string }> => {
    if (!serverSupabase) {
      return { ok: false, error: 'Supabase client is not configured on the server.' };
    }
    const byId = new Map<string, OvertimeRequisition>();
    for (const rec of records) {
      const normalized = normalizeStoredOvertimeRequisition(rec);
      if (normalized) {
        byId.set(normalized.id, normalized);
      }
    }
    const deduped = sortOvertimeRequisitionsDesc(Array.from(byId.values()));
    const nowIso = new Date().toISOString();

    const { error: upsertErr } = await serverSupabase
      .from('system_settings')
      .upsert(
        {
          id: OVERTIME_REQUISITIONS_SETTINGS_ID,
          software_name: 'Overtime Requisitions',
          logo_data_url: null,
          branding_json: { type: 'overtime_requisitions', version: 1 },
          settings_json: { records: deduped },
          updated_by: updatedBy || 'System',
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      );

    if (upsertErr) {
      return { ok: false, error: upsertErr.message || 'Failed to save overtime requisition to Supabase.' };
    }

    // Read-back verification from Supabase to guarantee the write was committed and not blocked by RLS
    const verified = await loadRequisitionsFromSystemSettings();
    if (verified.error) {
      return {
        ok: false,
        error: `Supabase save verification failed: ${verified.error}`,
      };
    }

    if (verifyRecord) {
      const found = verified.records.find((r) => r.id === verifyRecord.id);
      if (!found) {
        return {
          ok: false,
          error: 'Supabase write could not be confirmed: saved requisition was not found on read-back.',
        };
      }
      if (verifyRecord.expectedStatus && found.status !== verifyRecord.expectedStatus) {
        return {
          ok: false,
          error: 'Supabase write could not be confirmed: requisition status mismatch on read-back.',
        };
      }
      if (verifyRecord.expectedUpdatedAt && found.updatedAt !== verifyRecord.expectedUpdatedAt) {
        return {
          ok: false,
          error: 'Supabase write could not be confirmed: requisition update timestamp mismatch on read-back.',
        };
      }
    }

    return { ok: true, records: verified.records };
  };

  const insertSingleRequisitionIntoPrimaryTables = async (
    reqRecord: OvertimeRequisition,
    options?: { allowLegacyStatusBackfill?: boolean }
  ): Promise<{ ok: boolean; missingTable?: boolean; error?: string }> => {
    if (!serverSupabase) {
      return { ok: false, error: 'Supabase client is not configured on the server.' };
    }
    const needsTwoStepBackfill =
      Boolean(options?.allowLegacyStatusBackfill) && reqRecord.status !== 'Pending Approval';

    const { data: insertedRow, error: reqErr } = await serverSupabase
      .from('overtime_requisitions')
      .insert({
        id: reqRecord.id,
        requisition_number: reqRecord.requisitionNumber,
        requisition_date: reqRecord.requisitionDate,
        overtime_date: reqRecord.overtimeDate,
        required_workers: reqRecord.requiredWorkers,
        requested_hours: reqRecord.requestedHours,
        purpose: reqRecord.purpose,
        purposes_json: reqRecord.purposes,
        remarks: reqRecord.remarks || null,
        requested_by_id: reqRecord.requestedById,
        requested_by_name: reqRecord.requestedByName,
        requested_by: reqRecord.requestedBy,
        requested_by_role: reqRecord.requestedByRole || null,
        requested_by_department: reqRecord.requestedByDepartment || null,
        submitted_at: reqRecord.submittedAt,
        status: needsTwoStepBackfill ? 'Pending Approval' : reqRecord.status,
        overtime_granted: needsTwoStepBackfill ? false : Boolean(reqRecord.overtimeGranted),
        granted_at: needsTwoStepBackfill ? null : reqRecord.grantedAt || null,
        approved_by_id: needsTwoStepBackfill ? null : reqRecord.approvedById || null,
        approved_by_name: needsTwoStepBackfill ? null : reqRecord.approvedByName || null,
        approved_by: needsTwoStepBackfill ? null : reqRecord.approvedBy || null,
        approved_at: needsTwoStepBackfill ? null : reqRecord.approvedAt || null,
        approval_remarks: needsTwoStepBackfill ? null : reqRecord.approvalRemarks || null,
        returned_count: needsTwoStepBackfill ? 0 : Number(reqRecord.returnedCount) || 0,
        last_resubmitted_at: reqRecord.lastResubmittedAt || null,
        created_at: reqRecord.createdAt,
        updated_at: reqRecord.updatedAt || reqRecord.createdAt,
      })
      .select('id')
      .maybeSingle();

    if (reqErr) {
      return {
        ok: false,
        missingTable: isMissingSupabaseTableError(reqErr),
        error: reqErr.message || 'Failed to insert overtime requisition into Supabase.',
      };
    }

    if (!insertedRow?.id) {
      return {
        ok: false,
        error: 'Supabase insert completed without returning a persisted requisition record (check RLS policies).',
      };
    }

    if (needsTwoStepBackfill) {
      const { error: backfillStatusErr } = await serverSupabase
        .from('overtime_requisitions')
        .update({
          status: reqRecord.status,
          overtime_granted: Boolean(reqRecord.overtimeGranted),
          granted_at: reqRecord.grantedAt || null,
          approved_by_id: reqRecord.approvedById || reqRecord.requestedById || 'system',
          approved_by_name: reqRecord.approvedByName || reqRecord.approvedBy || 'System',
          approved_by: reqRecord.approvedBy || reqRecord.approvedByName || 'System',
          approved_at: reqRecord.approvedAt || reqRecord.updatedAt || new Date().toISOString(),
          approval_remarks: reqRecord.approvalRemarks || null,
          returned_count: Number(reqRecord.returnedCount) || 0,
          updated_at: reqRecord.updatedAt || new Date().toISOString(),
        })
        .eq('id', reqRecord.id);
      if (backfillStatusErr) {
        console.warn('[OvertimeRequisition] Warning backfilling final status:', backfillStatusErr.message);
      }
    }

    if (reqRecord.purposes.length > 0) {
      const { error: purposeErr } = await serverSupabase
        .from('overtime_requisition_purposes')
        .upsert(
          reqRecord.purposes.map((p) => ({
            id: p.id,
            requisition_id: reqRecord.id,
            payroll_purpose_id: p.payrollPurposeId || null,
            purpose_name: p.purposeName,
            is_custom: Boolean(p.isCustom),
            created_at: p.createdAt || reqRecord.createdAt,
          })),
          { onConflict: 'id' }
        );
      if (purposeErr && !isMissingSupabaseTableError(purposeErr)) {
        return {
          ok: false,
          error: `Failed to save overtime_requisition_purposes: ${purposeErr.message}`,
        };
      }
    }

    if (reqRecord.approvalHistory.length > 0) {
      // Use ignoreDuplicates: true (ON CONFLICT DO NOTHING) because anon has SELECT+INSERT only (no UPDATE) on immutable approval history
      const { error: histErr } = await serverSupabase
        .from('overtime_requisition_approval_history')
        .upsert(
          reqRecord.approvalHistory.map((h) => ({
            id: h.id,
            requisition_id: reqRecord.id,
            action: h.action,
            actor_id: h.actorId || null,
            actor_name: h.actorName,
            actor_role: h.actorRole || null,
            remarks: h.remarks || null,
            previous_status: h.previousStatus || null,
            new_status: h.newStatus,
            action_at: h.actionAt,
          })),
          { onConflict: 'id', ignoreDuplicates: true }
        );
      if (histErr && !isMissingSupabaseTableError(histErr)) {
        return {
          ok: false,
          error: `Failed to save overtime_requisition_approval_history: ${histErr.message}`,
        };
      }
    }

    return { ok: true };
  };

  const loadAuthoritativeOvertimeRequisitions = async (): Promise<{
    requisitions: OvertimeRequisition[];
    primaryTableAvailable: boolean;
    storage: 'overtime_requisitions' | 'system_settings' | 'none';
    error?: string;
  }> => {
    if (!serverSupabase) {
      return {
        requisitions: [],
        primaryTableAvailable: false,
        storage: 'none',
        error: 'Supabase client is not configured on the server.',
      };
    }

    const mergedMap = new Map<string, OvertimeRequisition>();
    let primaryTableAvailable = false;

    const [
      { data: reqRows, error: reqErr },
      { data: purposeRows },
      { data: histRows },
    ] = await Promise.all([
      serverSupabase
        .from('overtime_requisitions')
        .select('*')
        .order('submitted_at', { ascending: false }),
      serverSupabase
        .from('overtime_requisition_purposes')
        .select('*')
        .order('created_at', { ascending: true }),
      serverSupabase
        .from('overtime_requisition_approval_history')
        .select('*')
        .order('action_at', { ascending: false }),
    ]);

    if (!reqErr && Array.isArray(reqRows)) {
      primaryTableAvailable = true;
      const purposesByReq = new Map<string, OvertimeRequisitionPurposeItem[]>();
      if (Array.isArray(purposeRows)) {
        for (const p of purposeRows) {
          const reqId = String(p.requisition_id || '');
          const arr = purposesByReq.get(reqId) || [];
          arr.push({
            id: String(p.id),
            requisitionId: reqId,
            payrollPurposeId: p.payroll_purpose_id ? String(p.payroll_purpose_id) : undefined,
            purposeName: String(p.purpose_name || ''),
            isCustom: Boolean(p.is_custom),
            createdAt: p.created_at || undefined,
          });
          purposesByReq.set(reqId, arr);
        }
      }

      const historyByReq = new Map<string, OvertimeRequisitionApprovalHistoryEntry[]>();
      if (Array.isArray(histRows)) {
        for (const h of histRows) {
          const reqId = String(h.requisition_id || '');
          const arr = historyByReq.get(reqId) || [];
          arr.push({
            id: String(h.id),
            requisitionId: reqId,
            action: (h.action || 'SUBMITTED') as OvertimeRequisitionApprovalHistoryEntry['action'],
            actorId: h.actor_id ? String(h.actor_id) : undefined,
            actorName: String(h.actor_name || 'System'),
            actorRole: h.actor_role ? String(h.actor_role) : undefined,
            remarks: h.remarks ? String(h.remarks) : undefined,
            previousStatus: h.previous_status || undefined,
            newStatus: (h.new_status || 'Pending Approval') as OvertimeRequisition['status'],
            actionAt: h.action_at || new Date().toISOString(),
          });
          historyByReq.set(reqId, arr);
        }
      }

      for (const r of reqRows) {
        const id = String(r.id);
        const fallbackPurposes = Array.isArray(r.purposes_json)
          ? normalizeRequisitionPurposes(r.purposes_json, id)
          : [];
        const purposes = purposesByReq.get(id) || fallbackPurposes;
        const mapped: OvertimeRequisition = {
          id,
          requisitionNumber: String(r.requisition_number || id),
          requisitionDate: String(r.requisition_date || '').slice(0, 10),
          overtimeDate: String(r.overtime_date || '').slice(0, 10),
          requiredWorkers: Number(r.required_workers) || 0,
          requestedHours: Number(r.requested_hours) || 0,
          purpose:
            String(r.purpose || '').trim() ||
            purposes.map((p) => p.purposeName).join(', '),
          purposes,
          remarks: r.remarks || undefined,
          requestedById: String(r.requested_by_id || ''),
          requestedByName: String(r.requested_by_name || r.requested_by || ''),
          requestedBy: String(r.requested_by || r.requested_by_name || ''),
          requestedByRole: r.requested_by_role || undefined,
          requestedByDepartment: r.requested_by_department || undefined,
          submittedAt: r.submitted_at || r.created_at || new Date().toISOString(),
          status: (r.status || 'Pending Approval') as OvertimeRequisition['status'],
          overtimeGranted: Boolean(r.overtime_granted),
          grantedAt: r.granted_at || undefined,
          approvedById: r.approved_by_id || undefined,
          approvedByName: r.approved_by_name || undefined,
          approvedBy: r.approved_by || r.approved_by_name || undefined,
          approvedAt: r.approved_at || undefined,
          approvalRemarks: r.approval_remarks || undefined,
          returnedCount: Number(r.returned_count) || 0,
          lastResubmittedAt: r.last_resubmitted_at || undefined,
          approvalHistory: historyByReq.get(id) || [],
          createdAt: r.created_at || r.submitted_at || new Date().toISOString(),
          updatedAt: r.updated_at || undefined,
        };
        mergedMap.set(id, mapped);
      }
    } else if (isMissingSupabaseTableError(reqErr)) {
      const settingsRes = await loadRequisitionsFromSystemSettings();
      if (settingsRes.error) {
        return {
          requisitions: [],
          primaryTableAvailable: false,
          storage: 'none',
          error: `Unable to load overtime requisitions from Supabase: ${settingsRes.error}`,
        };
      }
      for (const rec of settingsRes.records) {
        mergedMap.set(rec.id, rec);
      }
    } else {
      return {
        requisitions: [],
        primaryTableAvailable: false,
        storage: 'none',
        error: `Supabase query failed for overtime_requisitions: ${reqErr?.message || 'Unknown database error'}`,
      };
    }

    const sorted = sortOvertimeRequisitionsDesc(Array.from(mergedMap.values()));

    return {
      requisitions: sorted,
      primaryTableAvailable,
      storage: primaryTableAvailable ? 'overtime_requisitions' : 'system_settings',
    };
  };

  app.get('/api/overtime/requisitions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_UNAUTHORIZED',
        error: 'Authentication required to access Overtime Requisitions.',
      });
    }

    const grantedOnly = String(req.query?.grantedOnly || '') === '1';
    const perms = resolveOvertimePermissions(caller);

    if (grantedOnly) {
      if (!perms.viewRequests && !perms.createRequest && !perms.editRequest && !perms.viewRequisition && !perms.approveRequisition) {
        return res.status(403).json({
          allowed: false,
          code: 'OVERTIME_REQUISITION_FORBIDDEN',
          error: 'Access Restricted: Overtime Management permission is required.',
        });
      }
      const loaded = await loadAuthoritativeOvertimeRequisitions();
      if (loaded.error) {
        return res.status(500).json({
          allowed: true,
          success: false,
          error: loaded.error,
          requisitions: [],
        });
      }
      const granted = loaded.requisitions.filter((r) => r.status === 'Approved' && r.overtimeGranted);
      return res.status(200).json({
        allowed: true,
        success: true,
        storage: loaded.storage,
        requisitions: granted,
      });
    }

    const auth = authorizeOvertimeSubPage(caller, 'requisition');
    if (!auth.allowed) {
      return res.status(403).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_FORBIDDEN',
        error: auth.reason,
      });
    }

    const loaded = await loadAuthoritativeOvertimeRequisitions();
    if (loaded.error) {
      return res.status(500).json({
        allowed: true,
        success: false,
        error: loaded.error,
        requisitions: [],
      });
    }

    const canApprove = canUserApproveRequisition(caller);
    const scoped = canApprove
      ? loaded.requisitions
      : loaded.requisitions.filter((r) => doesActorMatchRequester(r, caller));

    return res.status(200).json({
      allowed: true,
      success: true,
      storage: loaded.storage,
      canApprove,
      canSubmit: perms.viewRequisition || caller.role === 'Super Admin',
      requisitions: scoped,
    });
  });

  app.post('/api/overtime/requisitions', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_UNAUTHORIZED',
        error: 'Authentication required to submit an Overtime Requisition.',
      });
    }

    const perms = resolveOvertimePermissions(caller);
    if (!perms.view || (!perms.viewRequisition && caller.role !== 'Super Admin')) {
      return res.status(403).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_SUBMIT_FORBIDDEN',
        error: 'Forbidden: "Overtime Requisition" permission is required to submit a requisition.',
      });
    }

    const validation = validateOvertimeRequisitionPayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        allowed: true,
        success: false,
        dbSynced: false,
        error: validation.error,
      });
    }

    if (!serverSupabase) {
      return res.status(503).json({
        allowed: true,
        success: false,
        dbSynced: false,
        error: 'Supabase database connection is not configured on the server.',
      });
    }

    return withRequisitionLock(OVERTIME_REQUISITIONS_STORE_LOCK, async () => {
      const loaded = await loadAuthoritativeOvertimeRequisitions();
      if (loaded.error) {
        return res.status(500).json({
          allowed: true,
          success: false,
          dbSynced: false,
          error: loaded.error,
        });
      }

      const created = buildCreatedRequisition({
        existingRequisitions: loaded.requisitions,
        overtimeDate: validation.overtimeDate!,
        requiredWorkers: validation.requiredWorkers!,
        requestedHours: validation.requestedHours!,
        purposes: validation.purposes!,
        remarks: validation.remarks,
        actor: caller,
      });

      const actorLabel = String(caller.name || caller.email || caller.id || 'System');
      let persistedStorage: 'overtime_requisitions' | 'system_settings' = 'overtime_requisitions';

      if (loaded.primaryTableAvailable) {
        const primaryRes = await insertSingleRequisitionIntoPrimaryTables(created);
        if (!primaryRes.ok) {
          if (primaryRes.missingTable) {
            const fallbackRes = await saveRequisitionsToSystemSettings(
              [created, ...loaded.requisitions.filter((r) => r.id !== created.id)],
              actorLabel,
              { id: created.id, expectedStatus: created.status }
            );
            if (!fallbackRes.ok) {
              return res.status(500).json({
                allowed: true,
                success: false,
                dbSynced: false,
                error: fallbackRes.error || 'Failed to persist overtime requisition in Supabase.',
              });
            }
            persistedStorage = 'system_settings';
          } else {
            return res.status(500).json({
              allowed: true,
              success: false,
              dbSynced: false,
              error: primaryRes.error || 'Failed to insert overtime requisition into Supabase.',
            });
          }
        }
      } else {
        const fallbackRes = await saveRequisitionsToSystemSettings(
          [created, ...loaded.requisitions.filter((r) => r.id !== created.id)],
          actorLabel,
          { id: created.id, expectedStatus: created.status }
        );
        if (!fallbackRes.ok) {
          return res.status(500).json({
            allowed: true,
            success: false,
            dbSynced: false,
            error: fallbackRes.error || 'Failed to persist overtime requisition in Supabase.',
          });
        }
        persistedStorage = 'system_settings';
      }

      return res.status(201).json({
        allowed: true,
        success: true,
        dbSynced: true,
        storage: persistedStorage,
        requisition: created,
      });
    });
  });

  app.put('/api/overtime/requisitions/:id', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_UNAUTHORIZED',
        error: 'Authentication required.',
      });
    }

    const perms = resolveOvertimePermissions(caller);
    if (!perms.view || (!perms.viewRequisition && caller.role !== 'Super Admin')) {
      return res.status(403).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_EDIT_FORBIDDEN',
        error: 'Forbidden: "Overtime Requisition" permission is required to edit returned requisitions.',
      });
    }

    const id = String(req.params.id || '').trim();
    const validation = validateOvertimeRequisitionPayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        allowed: true,
        success: false,
        dbSynced: false,
        error: validation.error,
      });
    }

    if (!serverSupabase) {
      return res.status(503).json({
        allowed: true,
        success: false,
        dbSynced: false,
        error: 'Supabase database connection is not configured on the server.',
      });
    }

    return withRequisitionLock(OVERTIME_REQUISITIONS_STORE_LOCK, async () => {
      const loaded = await loadAuthoritativeOvertimeRequisitions();
      if (loaded.error) {
        return res.status(500).json({
          allowed: true,
          success: false,
          dbSynced: false,
          error: loaded.error,
        });
      }

      const existing = loaded.requisitions.find((r) => r.id === id);
      if (!existing) {
        return res.status(404).json({
          allowed: true,
          success: false,
          dbSynced: false,
          error: `Overtime Requisition "${id}" not found.`,
        });
      }

      const result = applyRequisitionResubmission(
        existing,
        {
          overtimeDate: validation.overtimeDate!,
          requiredWorkers: validation.requiredWorkers!,
          requestedHours: validation.requestedHours!,
          purposes: validation.purposes!,
          remarks: validation.remarks,
        },
        caller
      );

      if ('error' in result) {
        return res.status(result.code).json({
          allowed: result.code !== 403,
          success: false,
          dbSynced: false,
          error: result.error,
        });
      }

      const actorLabel = String(caller.name || caller.email || caller.id || 'System');
      let persistedStorage: 'overtime_requisitions' | 'system_settings' = 'overtime_requisitions';

      if (loaded.primaryTableAvailable) {
        const { data: updatedRow, error: updErr } = await serverSupabase
          .from('overtime_requisitions')
          .update({
            overtime_date: result.requisition.overtimeDate,
            required_workers: result.requisition.requiredWorkers,
            requested_hours: result.requisition.requestedHours,
            purpose: result.requisition.purpose,
            purposes_json: result.requisition.purposes,
            remarks: result.requisition.remarks || null,
            status: result.requisition.status,
            overtime_granted: false,
            granted_at: null,
            last_resubmitted_at: result.requisition.lastResubmittedAt || result.requisition.updatedAt,
            updated_at: result.requisition.updatedAt,
          })
          .eq('id', id)
          .select('id')
          .maybeSingle();

        if (updErr) {
          if (isMissingSupabaseTableError(updErr)) {
            const fallbackRes = await saveRequisitionsToSystemSettings(
              loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
              actorLabel,
              { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
            );
            if (!fallbackRes.ok) {
              return res.status(500).json({
                allowed: true,
                success: false,
                dbSynced: false,
                error: fallbackRes.error || 'Failed to save resubmitted requisition to Supabase.',
              });
            }
            persistedStorage = 'system_settings';
          } else {
            return res.status(500).json({
              allowed: true,
              success: false,
              dbSynced: false,
              error: updErr.message || 'Failed to update overtime requisition in Supabase.',
            });
          }
        } else if (!updatedRow?.id) {
          return res.status(500).json({
            allowed: true,
            success: false,
            dbSynced: false,
            error: 'Supabase update did not modify any requisition row (check RLS policies or concurrent edits).',
          });
        } else {
          const { error: delPurpErr } = await serverSupabase
            .from('overtime_requisition_purposes')
            .delete()
            .eq('requisition_id', id);
          if (delPurpErr && !isMissingSupabaseTableError(delPurpErr)) {
            return res.status(500).json({
              allowed: true,
              success: false,
              dbSynced: false,
              error: `Failed to refresh overtime_requisition_purposes: ${delPurpErr.message}`,
            });
          }

          if (result.requisition.purposes.length > 0) {
            const { error: insPurpErr } = await serverSupabase
              .from('overtime_requisition_purposes')
              .insert(
                result.requisition.purposes.map((p) => ({
                  id: p.id,
                  requisition_id: id,
                  payroll_purpose_id: p.payrollPurposeId || null,
                  purpose_name: p.purposeName,
                  is_custom: Boolean(p.isCustom),
                  created_at: p.createdAt || new Date().toISOString(),
                }))
              );
            if (insPurpErr && !isMissingSupabaseTableError(insPurpErr)) {
              return res.status(500).json({
                allowed: true,
                success: false,
                dbSynced: false,
                error: `Failed to insert overtime_requisition_purposes: ${insPurpErr.message}`,
              });
            }
          }

          const { error: insHistErr } = await serverSupabase
            .from('overtime_requisition_approval_history')
            .insert({
              id: result.historyEntry.id,
              requisition_id: id,
              action: result.historyEntry.action,
              actor_id: result.historyEntry.actorId || null,
              actor_name: result.historyEntry.actorName,
              actor_role: result.historyEntry.actorRole || null,
              remarks: result.historyEntry.remarks || null,
              previous_status: result.historyEntry.previousStatus || null,
              new_status: result.historyEntry.newStatus,
              action_at: result.historyEntry.actionAt,
            });
          if (insHistErr && !isMissingSupabaseTableError(insHistErr)) {
            return res.status(500).json({
              allowed: true,
              success: false,
              dbSynced: false,
              error: `Failed to insert overtime_requisition_approval_history: ${insHistErr.message}`,
            });
          }
        }
      } else {
        const fallbackRes = await saveRequisitionsToSystemSettings(
          loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
          actorLabel,
          { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
        );
        if (!fallbackRes.ok) {
          return res.status(500).json({
            allowed: true,
            success: false,
            dbSynced: false,
            error: fallbackRes.error || 'Failed to save resubmitted requisition to Supabase.',
          });
        }
        persistedStorage = 'system_settings';
      }

      return res.status(200).json({
        allowed: true,
        success: true,
        dbSynced: true,
        storage: persistedStorage,
        requisition: result.requisition,
      });
    });
  });

  app.post('/api/overtime/requisitions/:id/decision', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_UNAUTHORIZED',
        error: 'Authentication required to review Overtime Requisitions.',
      });
    }

    if (!canUserApproveRequisition(caller)) {
      return res.status(403).json({
        allowed: false,
        code: 'OVERTIME_REQUISITION_APPROVAL_FORBIDDEN',
        error: 'Forbidden: "Overtime Requisition Approval" permission is required for Head Office approval decisions.',
      });
    }

    const id = String(req.params.id || '').trim();
    const rawDecision = String(req.body?.decision || '').trim().toUpperCase();
    if (!['APPROVE', 'REJECT', 'RETURN'].includes(rawDecision)) {
      return res.status(400).json({
        allowed: true,
        success: false,
        dbSynced: false,
        error: 'Invalid decision action. Expected APPROVE, REJECT, or RETURN.',
      });
    }
    const decision = rawDecision as RequisitionDecisionAction;
    const remarks = String(req.body?.remarks || '');

    if (!serverSupabase) {
      return res.status(503).json({
        allowed: true,
        success: false,
        dbSynced: false,
        error: 'Supabase database connection is not configured on the server.',
      });
    }

    return withRequisitionLock(OVERTIME_REQUISITIONS_STORE_LOCK, async () => {
      const loaded = await loadAuthoritativeOvertimeRequisitions();
      if (loaded.error) {
        return res.status(500).json({
          allowed: true,
          success: false,
          dbSynced: false,
          error: loaded.error,
        });
      }

      const existing = loaded.requisitions.find((r) => r.id === id);
      if (!existing) {
        return res.status(404).json({
          allowed: true,
          success: false,
          dbSynced: false,
          error: `Overtime Requisition "${id}" not found.`,
        });
      }

      const result = applyRequisitionDecision(existing, decision, caller, remarks);
      if ('error' in result) {
        return res.status(result.code).json({
          allowed: result.code !== 403,
          success: false,
          dbSynced: false,
          error: result.error,
        });
      }

      const actorLabel = String(caller.name || caller.email || caller.id || 'System');
      let persistedStorage: 'overtime_requisitions' | 'system_settings' = 'overtime_requisitions';

      if (loaded.primaryTableAvailable) {
        const { data: updatedRow, error: updErr } = await serverSupabase
          .from('overtime_requisitions')
          .update({
            status: result.requisition.status,
            overtime_granted: result.requisition.overtimeGranted,
            granted_at: result.requisition.grantedAt || null,
            approved_by_id: result.requisition.approvedById || null,
            approved_by_name: result.requisition.approvedByName || null,
            approved_by: result.requisition.approvedBy || null,
            approved_at: result.requisition.approvedAt || null,
            approval_remarks: result.requisition.approvalRemarks || null,
            returned_count: result.requisition.returnedCount || 0,
            updated_at: result.requisition.updatedAt,
          })
          .eq('id', id)
          .eq('status', 'Pending Approval')
          .select('id')
          .maybeSingle();

        if (updErr) {
          if (isMissingSupabaseTableError(updErr)) {
            const fallbackRes = await saveRequisitionsToSystemSettings(
              loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
              actorLabel,
              { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
            );
            if (!fallbackRes.ok) {
              return res.status(500).json({
                allowed: true,
                success: false,
                dbSynced: false,
                error: fallbackRes.error || 'Failed to save Head Office decision in Supabase.',
              });
            }
            persistedStorage = 'system_settings';
          } else {
            return res.status(500).json({
              allowed: true,
              success: false,
              dbSynced: false,
              error: updErr.message || 'Failed to update Head Office decision in Supabase.',
            });
          }
        } else if (!updatedRow?.id) {
          return res.status(409).json({
            allowed: true,
            success: false,
            dbSynced: false,
            error: 'Decision could not be persisted because the requisition status changed or RLS blocked the update.',
          });
        } else {
          const { error: histErr } = await serverSupabase
            .from('overtime_requisition_approval_history')
            .insert({
              id: result.historyEntry.id,
              requisition_id: id,
              action: result.historyEntry.action,
              actor_id: result.historyEntry.actorId || null,
              actor_name: result.historyEntry.actorName,
              actor_role: result.historyEntry.actorRole || null,
              remarks: result.historyEntry.remarks || null,
              previous_status: result.historyEntry.previousStatus || null,
              new_status: result.historyEntry.newStatus,
              action_at: result.historyEntry.actionAt,
            });
          if (histErr && !isMissingSupabaseTableError(histErr)) {
            return res.status(500).json({
              allowed: true,
              success: false,
              dbSynced: false,
              error: `Failed to insert overtime_requisition_approval_history: ${histErr.message}`,
            });
          }
        }
      } else {
        const fallbackRes = await saveRequisitionsToSystemSettings(
          loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
          actorLabel,
          { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
        );
        if (!fallbackRes.ok) {
          return res.status(500).json({
            allowed: true,
            success: false,
            dbSynced: false,
            error: fallbackRes.error || 'Failed to save Head Office decision in Supabase.',
          });
        }
        persistedStorage = 'system_settings';
      }

      return res.status(200).json({
        allowed: true,
        success: true,
        dbSynced: true,
        storage: persistedStorage,
        requisition: result.requisition,
      });
    });
  });

  app.get('/api/overtime/attendances', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'attendance');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_ATTENDANCE_FORBIDDEN', error: auth.reason });
    }
    let attendances: any[] = Array.from(overtimeAttendancesCache.values());
    if (serverSupabase) {
      try {
        const { data } = await serverSupabase.from('overtime_attendances').select('*').order('date', { ascending: false });
        if (Array.isArray(data) && data.length > 0) {
          attendances = data.map((a: any) => ({
            id: String(a.id),
            requestId: a.request_id || undefined,
            requestNumber: a.request_number || undefined,
            employeeId: String(a.employee_id),
            employeeCode: a.employee_code || '',
            employeeName: a.employee_name || '',
            department: a.department || '',
            designation: a.designation || '',
            date: String(a.date),
            overtimeCheckInTime: a.overtime_check_in_time || '',
            overtimeCheckOutTime: a.overtime_check_out_time || '',
            isOvernight: Boolean(a.is_overnight),
            actualOvertimeHours: Number(a.actual_overtime_hours) || 0,
            isVerified: Boolean(a.is_verified),
            verifiedBy: a.verified_by || undefined,
            syncSource: a.sync_source || 'Manual',
          }));
        }
      } catch {
        // Fallback to cache
      }
    }
    res.json({ allowed: true, attendances });
  });

  app.post('/api/overtime/attendances', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'attendance');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_ATTENDANCE_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.recordAttendance) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_RECORD_ATTENDANCE_FORBIDDEN', error: 'Forbidden: Record OT Attendance permission required.' });
    }
    const record = { ...(req.body || {}), id: req.body?.id || `ot-att-srv-${Date.now()}` };
    overtimeAttendancesCache.set(String(record.id), record);
    return res.status(200).json({ allowed: true, attendance: record });
  });

  app.post('/api/overtime/attendances/:id/verify', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'attendance');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_ATTENDANCE_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.verifyAttendance) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_VERIFY_ATTENDANCE_FORBIDDEN', error: 'Forbidden: Verify Biometric OT Punch permission required.' });
    }
    const id = String(req.params.id || '');
    const existing = overtimeAttendancesCache.get(id) || { id };
    const updated = { ...existing, isVerified: true, verifiedBy: caller?.name || 'Supervisor', verificationDate: new Date().toISOString() };
    overtimeAttendancesCache.set(id, updated);
    return res.status(200).json({ allowed: true, attendance: updated });
  });

  app.get('/api/overtime/batch-allocations', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'batch_allocation');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_BATCH_ALLOCATION_FORBIDDEN', error: auth.reason });
    }
    const requests = (await loadAuthoritativeOvertimeRequests()).map((r) => sanitizeOvertimeRecordForUser(r, caller));
    res.json({ allowed: true, requests });
  });

  app.put('/api/overtime/batch-allocations/:requestId', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'batch_allocation');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_BATCH_ALLOCATION_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.allocateBatch) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_ALLOCATE_BATCH_FORBIDDEN', error: 'Forbidden: Allocate Overtime to Batches permission required.' });
    }
    const requestId = String(req.params.requestId || '');
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const existing = overtimeRequestsCache.get(requestId) || { id: requestId };
    const updated = { ...existing, batchAllocations: allocations, isCostingAllocated: allocations.length > 0, updatedAt: new Date().toISOString() };
    overtimeRequestsCache.set(requestId, updated);
    return res.status(200).json({ allowed: true, request: sanitizeOvertimeRecordForUser(updated, caller) });
  });

  app.get('/api/overtime/payroll-sync', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'payroll_costing_sync');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_PAYROLL_SYNC_FORBIDDEN', error: auth.reason });
    }
    const requests = (await loadAuthoritativeOvertimeRequests())
      .filter((r) => r.status === 'Final Approved')
      .map((r) => sanitizeOvertimeRecordForUser(r, caller));
    res.json({ allowed: true, requests });
  });

  app.get('/api/overtime/policies', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'policies');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_POLICIES_FORBIDDEN', error: auth.reason });
    }
    let policies: any[] = Array.from(overtimePoliciesCache.values());
    if (serverSupabase && policies.length === 0) {
      try {
        const { data } = await serverSupabase.from('overtime_policies').select('*').order('created_at', { ascending: true });
        if (Array.isArray(data)) policies = data;
      } catch {
        // Fallback to cache
      }
    }
    res.json({ allowed: true, policies });
  });

  app.put('/api/overtime/policies/:id', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const auth = authorizeOvertimeSubPage(caller, 'policies');
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_POLICIES_FORBIDDEN', error: auth.reason });
    }
    const perms = resolveOvertimePermissions(caller);
    if (!perms.configurePolicy) {
      return res.status(403).json({ allowed: false, code: 'OVERTIME_CONFIGURE_POLICY_FORBIDDEN', error: 'Forbidden: Configure OT Policy permission required.' });
    }
    const id = String(req.params.id || '');
    const existing = overtimePoliciesCache.get(id) || {};
    const updated = { ...existing, ...(req.body || {}), id, updatedAt: new Date().toISOString(), updatedBy: caller?.name };
    overtimePoliciesCache.set(id, updated);
    return res.status(200).json({ allowed: true, policy: updated });
  });

  app.get('/api/overtime/reports', async (req, res) => {
    const caller = await resolveRequestUser(req);
    const requestedReport = req.query?.reportKey || req.query?.reportId;
    const auth = authorizeOvertimeReport(
      caller,
      typeof requestedReport === 'string' ? requestedReport : undefined
    );
    if (!auth.allowed) {
      return res.status(caller ? 403 : 401).json({ allowed: false, code: 'OVERTIME_REPORTS_FORBIDDEN', error: auth.reason });
    }
    const permissions = resolveOvertimePermissions(caller);
    const requests = (await loadAuthoritativeOvertimeRequests()).map((r) => sanitizeOvertimeRecordForUser(r, caller));
    res.json({ allowed: true, permissions, requests });
  });

  // Authenticated Mobile Field Force Transaction Endpoints (Enforces active ERP User <-> Employee Identity)
  const authorizeMobileTransaction = async (req: express.Request, res: express.Response) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      res.status(401).json({
        ok: false,
        errorCode: 'UNAUTHORIZED',
        error: 'Authentication required. Please log in to Ensec ERP.',
      });
      return null;
    }
    const employee = await resolveEmployeeProfileForCaller(caller);
    if (!employee) {
      res.status(403).json({
        ok: false,
        errorCode: 'EMPLOYEE_UNRESOLVED',
        error: 'No active employee profile found for authenticated ERP user.',
      });
      return null;
    }
    const body = req.body || {};
    const identityCheck = verifyTransactionIdentityMatchesUser(
      {
        userId: body.userId,
        employeeId: body.employeeId,
        fieldForceId: body.fieldForceId,
        employeeCode: body.employeeCode,
        salespersonId: body.salespersonId,
        assignedSalespersonId: body.assignedSalespersonId,
        repId: body.repId,
        ffCode: body.ffCode,
        employee: body.employee && typeof body.employee === 'object' ? body.employee : undefined,
      },
      employee
    );
    if (!identityCheck.valid) {
      res.status(403).json({
        ok: false,
        errorCode: 'IDENTITY_MISMATCH',
        error: identityCheck.reason,
      });
      return null;
    }
    return { caller, employee, body };
  };

  app.post('/api/orders', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `so-srv-${Date.now()}`,
      userId: caller.id,
      userLoginId: caller.userId || employee.userLoginId,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      salespersonId: employee.employeeId,
      salespersonName: employee.name,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.orders.unshift(record);
    return res.status(200).json({ ok: true, order: record });
  });

  app.post('/api/customers', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `cust-srv-${Date.now()}`,
      userId: caller.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      assignedSalespersonId: employee.employeeId,
      assignedSalespersonName: employee.name,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.customers.unshift(record);
    return res.status(200).json({ ok: true, customer: record });
  });

  app.post('/api/tada', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `tada-srv-${Date.now()}`,
      userId: caller.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      ffCode: employee.employeeCode,
      ffName: employee.name,
      repId: employee.employeeId,
      repName: employee.name,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.tada.unshift(record);
    return res.status(200).json({ ok: true, tada: record });
  });

  app.post('/api/warranty', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `war-srv-${Date.now()}`,
      userId: caller.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      complaintReceivedBy: employee.name,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.warranty.unshift(record);
    return res.status(200).json({ ok: true, ticket: record });
  });

  app.post('/api/visits', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `visit-srv-${Date.now()}`,
      userId: caller.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      repId: employee.employeeId,
      repName: employee.name,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.visits.unshift(record);
    return res.status(200).json({ ok: true, visit: record });
  });

  app.post('/api/leaves', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `leave-srv-${Date.now()}`,
      userId: caller.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      department: employee.department,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.leaves.unshift(record);
    return res.status(200).json({ ok: true, leave: record });
  });

  app.post('/api/crm-leads', async (req, res) => {
    const auth = await authorizeMobileTransaction(req, res);
    if (!auth) return;
    const { caller, employee, body } = auth;
    const record = {
      ...body,
      id: body.id || `crm-srv-${Date.now()}`,
      userId: caller.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      salespersonId: employee.employeeId,
      salespersonName: employee.name,
      assignedRepName: employee.name,
      recordedAt: new Date().toISOString(),
    };
    mobileTransactionsStore.crmLeads.unshift(record);
    return res.status(200).json({ ok: true, lead: record });
  });

  // ============================================================================
  // SYSTEM SETTINGS & BRANDING CONFIGURATION API (Persistent + Admin-Protected)
  // ============================================================================
  const SYSTEM_SETTINGS_DIR = path.join(__dirname, 'data');
  const SYSTEM_SETTINGS_FILE = path.join(SYSTEM_SETTINGS_DIR, 'system-settings.json');

  const readSystemSettingsFromDisk = (): SystemSettingsConfig | null => {
    try {
      if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) return null;
      const raw = fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf8');
      if (!raw.trim()) return null;
      return normalizeSystemSettings(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  const writeSystemSettingsToDisk = (settings: SystemSettingsConfig) => {
    try {
      fs.mkdirSync(SYSTEM_SETTINGS_DIR, { recursive: true });
      const tmpFile = `${SYSTEM_SETTINGS_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(settings, null, 2), 'utf8');
      fs.renameSync(tmpFile, SYSTEM_SETTINGS_FILE);
    } catch (err) {
      console.warn('[SystemSettings] Failed to write disk store:', err);
    }
  };

  let systemSettingsCache: SystemSettingsConfig =
    readSystemSettingsFromDisk() || {
      ...DEFAULT_SYSTEM_SETTINGS,
      branding: { ...DEFAULT_SYSTEM_SETTINGS.branding },
    };

  const classifySystemSettingsDbError = (err: any): SystemSettingsDbStatus => {
    const code = String(err?.code || '').trim();
    const message = String(err?.message || '').trim();
    const lower = message.toLowerCase();

    if (
      code === 'PGRST205' ||
      code === '42P01' ||
      lower.includes('could not find the table') ||
      lower.includes('does not exist')
    ) {
      return {
        synced: false,
        status: 'table_missing',
        error: 'Supabase table "public.system_settings" does not exist yet.',
        sqlFix: SYSTEM_SETTINGS_TABLE_SQL,
      };
    }

    if (
      code === '42501' ||
      lower.includes('row-level security') ||
      lower.includes('permission denied')
    ) {
      return {
        synced: false,
        status: 'rls_blocked',
        error: `Supabase Row-Level Security blocked access to "public.system_settings": ${message}`,
        sqlFix: SYSTEM_SETTINGS_TABLE_SQL,
      };
    }

    return {
      synced: false,
      status: 'error',
      error: message || 'Failed to communicate with Supabase system_settings table.',
      sqlFix: SYSTEM_SETTINGS_TABLE_SQL,
    };
  };

  let lastSystemSettingsDbStatus: SystemSettingsDbStatus = serverSupabase
    ? { synced: false, status: 'unknown', error: null, sqlFix: null }
    : {
        synced: false,
        status: 'not_configured',
        error: 'Supabase server client is not configured.',
        sqlFix: null,
      };

  const upsertSystemSettingsToSupabase = async (
    settings: SystemSettingsConfig
  ): Promise<SystemSettingsDbStatus> => {
    if (!serverSupabase) {
      lastSystemSettingsDbStatus = {
        synced: false,
        status: 'not_configured',
        error: 'Supabase server client is not configured.',
        sqlFix: null,
      };
      return lastSystemSettingsDbStatus;
    }

    try {
      const { error } = await serverSupabase.from('system_settings').upsert(
        {
          id: 'default',
          software_name: settings.branding.softwareName,
          logo_data_url: settings.branding.logoDataUrl,
          branding_json: settings.branding,
          settings_json: { branding: settings.branding },
          updated_by: settings.updatedBy || settings.branding.updatedBy || null,
          updated_at: settings.updatedAt || settings.branding.updatedAt || new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.error('[SystemSettings] Supabase upsert error:', error);
        lastSystemSettingsDbStatus = classifySystemSettingsDbError(error);
        return lastSystemSettingsDbStatus;
      }

      lastSystemSettingsDbStatus = { synced: true, status: 'synced', error: null, sqlFix: null };
      return lastSystemSettingsDbStatus;
    } catch (err: any) {
      console.error('[SystemSettings] Supabase upsert exception:', err);
      lastSystemSettingsDbStatus = classifySystemSettingsDbError(err);
      return lastSystemSettingsDbStatus;
    }
  };

  const hydrateSystemSettingsFromSupabase = async (): Promise<{
    settings: SystemSettingsConfig;
    dbStatus: SystemSettingsDbStatus;
  }> => {
    const diskSnapshot = readSystemSettingsFromDisk();
    if (diskSnapshot) {
      systemSettingsCache = diskSnapshot;
    }
    if (serverSupabase) {
      try {
        const { data, error } = await serverSupabase
          .from('system_settings')
          .select('*')
          .eq('id', 'default')
          .maybeSingle();

        if (error) {
          lastSystemSettingsDbStatus = classifySystemSettingsDbError(error);
          return { settings: systemSettingsCache, dbStatus: lastSystemSettingsDbStatus };
        }

        lastSystemSettingsDbStatus = { synced: true, status: 'synced', error: null, sqlFix: null };

        if (data) {
          const remoteRaw: Partial<SystemSettingsConfig> = {
            id: String(data.id || 'default'),
            updatedAt: data.updated_at || null,
            updatedBy: data.updated_by || null,
            branding: {
              ...(typeof data.branding_json === 'object' && data.branding_json ? data.branding_json : {}),
              softwareName: data.software_name || data.branding_json?.softwareName,
              logoDataUrl:
                data.logo_data_url || data.branding_json?.logoDataUrl || null,
              updatedAt: data.updated_at || data.branding_json?.updatedAt || null,
              updatedBy: data.updated_by || data.branding_json?.updatedBy || null,
            },
          };
          const normalizedRemote = normalizeSystemSettings(remoteRaw);
          const remoteTime = normalizedRemote.updatedAt ? Date.parse(normalizedRemote.updatedAt) : 0;
          const localTime = systemSettingsCache.updatedAt ? Date.parse(systemSettingsCache.updatedAt) : 0;
          const remoteIsUneditedSeed = !data.updated_by && !normalizedRemote.branding.logoDataUrl && normalizedRemote.branding.softwareName === 'Ensec';
          const diskHasAdminEdits = Boolean(diskSnapshot?.updatedBy);

          if (remoteIsUneditedSeed && diskHasAdminEdits && diskSnapshot) {
            // Migrate saved server settings into freshly created Supabase table instead of overwriting with default seed
            lastSystemSettingsDbStatus = await upsertSystemSettingsToSupabase(diskSnapshot);
          } else if (!diskSnapshot || (remoteTime > 0 && remoteTime >= localTime)) {
            systemSettingsCache = normalizedRemote;
            writeSystemSettingsToDisk(systemSettingsCache);
          }
        } else if (diskSnapshot?.updatedBy) {
          lastSystemSettingsDbStatus = await upsertSystemSettingsToSupabase(diskSnapshot);
        }
      } catch (err: any) {
        lastSystemSettingsDbStatus = classifySystemSettingsDbError(err);
      }
    }
    return { settings: systemSettingsCache, dbStatus: lastSystemSettingsDbStatus };
  };

  app.get('/api/system-settings', async (_req, res) => {
    const { settings, dbStatus } = await hydrateSystemSettingsFromSupabase();
    res.json({ settings, dbStatus });
  });

  app.get('/api/system-settings/branding', async (_req, res) => {
    const { settings, dbStatus } = await hydrateSystemSettingsFromSupabase();
    res.json({ branding: settings.branding, settings, dbStatus });
  });

  const handleUpdateSystemBranding = async (req: express.Request, res: express.Response) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        error: 'Authentication required to modify System Branding.',
      });
    }

    if (!canModifySystemBranding(caller)) {
      return res.status(403).json({
        error: 'Forbidden: Only authorized Admin users can modify System Branding.',
      });
    }

    const body = req.body || {};
    const rawName = typeof body.softwareName === 'string' ? body.softwareName.trim() : '';
    if (!rawName) {
      return res.status(400).json({ error: 'Software Name is required.' });
    }
    if (rawName.length > 80) {
      return res.status(400).json({ error: 'Software Name must be 80 characters or fewer.' });
    }

    let nextLogoDataUrl: string | null = systemSettingsCache.branding.logoDataUrl ?? null;
    let nextLogoFileName: string | null = systemSettingsCache.branding.logoFileName ?? null;
    let nextLogoMimeType: string | null = systemSettingsCache.branding.logoMimeType ?? null;

    if (body.logoDataUrl === null || body.logoDataUrl === '') {
      nextLogoDataUrl = null;
      nextLogoFileName = null;
      nextLogoMimeType = null;
    } else if (body.logoDataUrl !== undefined) {
      const cleanedLogo = cleanBrandingLogoDataUrl(body.logoDataUrl);
      if (!cleanedLogo || !isValidBrandingLogoDataUrl(cleanedLogo)) {
        return res.status(400).json({
          error: 'Invalid logo format or file exceeds size limit (max 3 MB PNG/JPG/WEBP/SVG/ICO).',
        });
      }
      nextLogoDataUrl = cleanedLogo;
      nextLogoFileName =
        typeof body.logoFileName === 'string' && body.logoFileName.trim()
          ? body.logoFileName.trim().slice(0, 160)
          : null;
      nextLogoMimeType =
        typeof body.logoMimeType === 'string' && body.logoMimeType.trim()
          ? body.logoMimeType.trim().slice(0, 80)
          : null;
    }

    const nowIso = new Date().toISOString();
    const actorName = String(caller.name || caller.userId || caller.email || 'Admin');

    const updatedBranding: SystemBrandingConfig = {
      softwareName: rawName,
      logoDataUrl: nextLogoDataUrl,
      logoFileName: nextLogoFileName,
      logoMimeType: nextLogoMimeType,
      updatedAt: nowIso,
      updatedBy: actorName,
    };

    const updatedSettings: SystemSettingsConfig = {
      id: 'default',
      branding: updatedBranding,
      updatedAt: nowIso,
      updatedBy: actorName,
    };

    systemSettingsCache = updatedSettings;
    writeSystemSettingsToDisk(updatedSettings);

    const dbStatus = await upsertSystemSettingsToSupabase(updatedSettings);

    if (serverSupabase) {
      try {
        await serverSupabase.from('audit_logs').insert({
          user_id: String(caller.userId || caller.id || 'ADMIN'),
          user_name: actorName,
          action: 'SYSTEM_BRANDING_UPDATED',
          module: 'System Settings',
          details: `Updated global Software Name to "${updatedBranding.softwareName}"${
            updatedBranding.logoDataUrl ? ' with custom brand logo' : ' (default logo)'
          }`,
        });
      } catch {
        // Ignore non-fatal audit insert issues
      }
    }

    return res.status(200).json({
      ok: true,
      branding: updatedBranding,
      settings: updatedSettings,
      dbSynced: dbStatus.synced,
      dbStatus,
    });
  };

  app.put('/api/system-settings/branding', handleUpdateSystemBranding);
  app.post('/api/system-settings/branding', handleUpdateSystemBranding);

  app.post('/api/system-settings/sync', async (req, res) => {
    const caller = await resolveRequestUser(req);
    if (!caller) {
      return res.status(401).json({
        error: 'Authentication required to sync System Branding.',
      });
    }
    if (!canModifySystemBranding(caller)) {
      return res.status(403).json({
        error: 'Forbidden: Only authorized Admin users can sync System Branding.',
      });
    }

    const diskSnapshot = readSystemSettingsFromDisk();
    if (diskSnapshot) {
      systemSettingsCache = diskSnapshot;
    }
    const dbStatus = await upsertSystemSettingsToSupabase(systemSettingsCache);
    return res.status(200).json({
      ok: dbStatus.synced,
      dbSynced: dbStatus.synced,
      dbStatus,
      settings: systemSettingsCache,
      branding: systemSettingsCache.branding,
    });
  });

  return app;
}

async function startServer() {
  const app = createAppServer();
  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: isHmrDisabled ? false : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Ensec ERP Server running on http://0.0.0.0:${PORT}`);
  });
}

// Start server only when executed directly (allows unit testing createAppServer cleanly)
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start Ensec ERP Server:', err);
    process.exit(1);
  });
}
