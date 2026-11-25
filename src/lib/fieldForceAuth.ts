import type { FieldForceRep, User } from '../types/erp.ts';
import type { OfficeLocation } from '../types/payroll.ts';
import {
  DEFAULT_ALLOWED_RADIUS_METERS,
  DEFAULT_GRACE_PERIOD_MINUTES,
  DEFAULT_MAX_GPS_ACCURACY_METERS,
  DEFAULT_OFFICE_LOCATIONS,
  DEFAULT_SHIFT_END_TIME,
  DEFAULT_SHIFT_START_TIME,
  calculateHaversineDistanceMeters,
  isValidCoordinatePair,
} from './geofence.ts';

export interface ResolvedMobileEmployeeProfile {
  userId: string;
  userLoginId: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  designation: string;
  assignedRole: string;
  erpRole: string;
  department: string;
  phone: string;
  email: string;
  region: string;
  area: string;
  territory: string;
  branchWorkplace: string;
  officeAddress: string;
  assignedOfficeId: string;
  assignedOfficeName: string;
  officeLatitude: number;
  officeLongitude: number;
  allowedRadiusMeters: number;
  locationStatus: 'Active' | 'Inactive';
  shiftStartTime: string;
  shiftEndTime: string;
  gracePeriodMinutes: number;
  monthlyTargetBDT: number;
  monthlyAchievedBDT: number;
  tadaApproverId?: string;
  tadaApproverName?: string;
  hasEmployeeRecord: boolean;
  matchedRep?: FieldForceRep;
}

export function normalizeCode(val?: string | null): string {
  return String(val || '').trim().toLowerCase();
}

export function normalizePhoneDigits(phone?: string | null): string {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  // Reject placeholder all-zero phone numbers such as +880 1700-000000 or 000000
  if (/^0+$/.test(digits) || digits.endsWith('0000000')) {
    return '';
  }
  // Compare last 10 digits for BD numbers (+8801XXXXXXXXX vs 01XXXXXXXXX)
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function getInitials(name?: string | null): string {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'U';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function deriveAssignedRoleLabel(
  user: Partial<User> | null | undefined,
  rep?: Partial<FieldForceRep> | null
): string {
  const designation = String(rep?.designation || user?.designation || '').trim();
  // Detect standard short field roles (SR, SP, SPO, ASE, ASM, TSO, RSM, DSM) in designation/code
  const parenMatch = designation.match(/\((SR|SP|SPO|ASE|ASM|TSO|RSM|DSM|HOS)\)/i);
  if (parenMatch && parenMatch[1]) {
    return parenMatch[1].toUpperCase();
  }
  const exactTokenMatch = designation.match(/\b(SR|SP|SPO|ASE|ASM|TSO|RSM|DSM)\b/);
  if (exactTokenMatch && exactTokenMatch[1]) {
    return exactTokenMatch[1].toUpperCase();
  }
  if (rep?.fieldForceType && String(rep.fieldForceType).trim()) {
    return String(rep.fieldForceType).trim();
  }
  if (rep?.role && String(rep.role).trim()) {
    return String(rep.role).trim();
  }
  if (user?.role && String(user.role).trim()) {
    return String(user.role).trim();
  }
  return 'Employee';
}

function isMockOrTestEmployeeRecord(rep: Partial<FieldForceRep> | null | undefined): boolean {
  if (!rep) return true;
  const id = String(rep.id || '');
  const code = String(rep.code || '').toUpperCase().trim();
  const name = String(rep.name || '').toLowerCase().trim();
  if (
    ['ff-1', 'ff-2', 'ff-3', 'ff-4', 'ff-5', 'ff-6', 'ff-7', 'ff-8', 'ff-9'].includes(id) ||
    id.startsWith('mock-') ||
    id.startsWith('test-')
  ) {
    return true;
  }
  if (
    [
      'EMP-MGT-001',
      'EMP-HR-002',
      'EMP-FIN-003',
      'EMP-FAC-004',
      'EMP-FAC-005',
      'EMP-WH-006',
      'EMP-FLD-007',
      'EMP-FLD-008',
      'EMP-IT-009',
    ].includes(code)
  ) {
    return true;
  }
  if (name.includes('test rep') || name.includes('dummy officer') || name.includes('sample employee')) {
    return true;
  }
  return false;
}

/**
 * Deterministically finds the linked User record for an Employee (FieldForceRep).
 * Returns undefined if no user relationship exists.
 */
export function findLinkedUserForEmployee(
  employee: Partial<FieldForceRep> | null | undefined,
  users: Partial<User>[] = []
): Partial<User> | undefined {
  if (!employee || !Array.isArray(users) || users.length === 0) return undefined;

  const repUserIdNorm = normalizeCode(employee.userId);
  const repIdNorm = normalizeCode(employee.id);
  const repCodeNorm = normalizeCode(employee.code);
  const repEmpIdNorm = normalizeCode(employee.employeeId);
  const repEmailNorm = normalizeCode(employee.email);
  const repPhoneNorm = normalizePhoneDigits(employee.phone);
  const repNameNorm = normalizeCode(employee.name);

  if (repUserIdNorm) {
    const byUserId = users.find((u) => {
      const uid = normalizeCode(u.id);
      const uLogin = normalizeCode(u.userId);
      const uSalesman = normalizeCode(u.salesmanCode);
      return uid === repUserIdNorm || uLogin === repUserIdNorm || (uSalesman && uSalesman === repUserIdNorm);
    });
    if (byUserId) return byUserId;
  }

  const byCodeOrEmpId = users.find((u) => {
    const uEmpId = normalizeCode((u as any).employeeId);
    const uSalesman = normalizeCode(u.salesmanCode);
    const uLogin = normalizeCode(u.userId);
    const uId = normalizeCode(u.id);
    if (uEmpId && (uEmpId === repIdNorm || (repCodeNorm && uEmpId === repCodeNorm) || (repEmpIdNorm && uEmpId === repEmpIdNorm))) {
      return true;
    }
    if (uSalesman && repCodeNorm && uSalesman === repCodeNorm) return true;
    if (uLogin && repCodeNorm && uLogin === repCodeNorm) return true;
    if (uId && repIdNorm && uId === repIdNorm) return true;
    return false;
  });
  if (byCodeOrEmpId) return byCodeOrEmpId;

  if (repEmailNorm) {
    const byEmail = users.find((u) => u.email && normalizeCode(u.email) === repEmailNorm);
    if (byEmail) return byEmail;
  }

  if (repPhoneNorm && repPhoneNorm.length >= 8) {
    const byPhone = users.find((u) => {
      const up = normalizePhoneDigits(u.phone);
      return up && up.length >= 8 && up === repPhoneNorm;
    });
    if (byPhone) return byPhone;
  }

  if (repNameNorm) {
    const byName = users.find((u) => u.name && normalizeCode(u.name) === repNameNorm);
    if (byName) return byName;
  }

  return undefined;
}

/**
 * Resolves GPS Location & Shift Geofence settings strictly from User-owned configuration
 * (with fallback to OfficeLocation master and system defaults).
 */
export function resolveGeofenceConfigFromUser(
  user: Partial<User> | null | undefined,
  officeLocations: OfficeLocation[] = [],
  payrollSettings?: {
    shiftStartTime?: string;
    shiftEndTime?: string;
    lateGracePeriodMinutes?: number;
    standardDailyHours?: number;
    standardWorkHoursPerDay?: number;
    maxGpsAccuracyMeters?: number;
  },
  fallbackBranchName?: string
) {
  const activeOffices = (Array.isArray(officeLocations) ? officeLocations : []).filter(
    (o) => o && o.status !== 'Inactive'
  );
  const fallbackOffice = activeOffices[0] || officeLocations[0] || DEFAULT_OFFICE_LOCATIONS[0];
  const matchedOffice =
    user?.assignedOfficeId && user.assignedOfficeId !== 'custom'
      ? officeLocations.find((o) => o.id === user.assignedOfficeId) || fallbackOffice
      : fallbackOffice;

  const hasValidUserCoords =
    user &&
    typeof user.officeLatitude === 'number' &&
    typeof user.officeLongitude === 'number' &&
    isValidCoordinatePair(user.officeLatitude, user.officeLongitude);

  const officeLatitude = hasValidUserCoords
    ? Number(user!.officeLatitude)
    : matchedOffice.latitude;
  const officeLongitude = hasValidUserCoords
    ? Number(user!.officeLongitude)
    : matchedOffice.longitude;

  const allowedRadiusMeters =
    Number(user?.allowedRadiusMeters) > 0
      ? Number(user!.allowedRadiusMeters)
      : matchedOffice.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_METERS;

  const locationStatus: 'Active' | 'Inactive' =
    user?.locationStatus === 'Inactive'
      ? 'Inactive'
      : user?.locationStatus === 'Active'
      ? 'Active'
      : matchedOffice.status || 'Active';

  const userHasCustomDistantCoords =
    hasValidUserCoords &&
    calculateHaversineDistanceMeters(
      officeLatitude,
      officeLongitude,
      matchedOffice.latitude,
      matchedOffice.longitude
    ) > 500;

  const explicitUserAddress = String(user?.officeAddress || '').trim();
  const officeAddress = String(
    (userHasCustomDistantCoords
      ? explicitUserAddress && explicitUserAddress !== matchedOffice.address
        ? explicitUserAddress
        : ''
      : explicitUserAddress || matchedOffice.address) ||
      matchedOffice.address ||
      ''
  ).trim();

  return {
    assignedOfficeId: String(user?.assignedOfficeId || matchedOffice.id || DEFAULT_OFFICE_LOCATIONS[0].id),
    assignedOfficeName: String(
      user?.assignedOfficeName ||
        (user?.assignedOfficeId && user.assignedOfficeId !== 'custom' ? matchedOffice.name : '') ||
        fallbackBranchName ||
        matchedOffice.name ||
        DEFAULT_OFFICE_LOCATIONS[0].name
    ),
    officeAddress,
    officeLatitude,
    officeLongitude,
    allowedRadiusMeters,
    locationStatus,
    shiftStartTime: user?.shiftStartTime || payrollSettings?.shiftStartTime || DEFAULT_SHIFT_START_TIME,
    shiftEndTime: user?.shiftEndTime || payrollSettings?.shiftEndTime || DEFAULT_SHIFT_END_TIME,
    gracePeriodMinutes:
      user?.gracePeriodMinutes !== undefined && user?.gracePeriodMinutes !== null
        ? Number(user.gracePeriodMinutes)
        : payrollSettings?.lateGracePeriodMinutes ?? DEFAULT_GRACE_PERIOD_MINUTES,
    standardDailyHours: payrollSettings?.standardDailyHours || payrollSettings?.standardWorkHoursPerDay || 8,
    maxGpsAccuracyMeters: payrollSettings?.maxGpsAccuracyMeters || DEFAULT_MAX_GPS_ACCURACY_METERS,
  };
}

/**
 * Deterministically resolves the logged-in ERP user's employee profile.
 * Reads Assigned Office GPS Location & Shift Geofence exclusively from the User record.
 * Returns null if no valid active ERP session user exists (never falls back to another employee).
 */
export function resolveEmployeeForERPUser(
  user: Partial<User> | null | undefined,
  fieldForceReps: FieldForceRep[] = [],
  officeLocations: OfficeLocation[] = []
): ResolvedMobileEmployeeProfile | null {
  if (!user || !user.id || user.id === 'guest') {
    return null;
  }
  if (user.status === 'Blocked' || user.status === 'Inactive') {
    return null;
  }

  const eligibleReps = (Array.isArray(fieldForceReps) ? fieldForceReps : []).filter(
    (r) => r && !isMockOrTestEmployeeRecord(r)
  );

  const userIdNorm = normalizeCode(user.id);
  const userLoginNorm = normalizeCode(user.userId);
  const salesmanCodeNorm = normalizeCode(user.salesmanCode);
  const explicitEmpIdNorm = normalizeCode((user as any).employeeId);
  const userEmailNorm = normalizeCode(user.email);
  const userPhoneNorm = normalizePhoneDigits(user.phone);
  const userNameNorm = normalizeCode(user.name);

  let matchedRep: FieldForceRep | undefined;

  // Priority 1: Explicit userId binding on employee record (rep.userId -> user.id or user.userId)
  matchedRep = eligibleReps.find((r) => {
    const repUserId = normalizeCode(r.userId);
    if (!repUserId) return false;
    return repUserId === userIdNorm || (Boolean(userLoginNorm) && repUserId === userLoginNorm);
  });

  // Priority 2: Direct employeeId / rep.id / code / salesmanCode / pin link
  if (!matchedRep) {
    matchedRep = eligibleReps.find((r) => {
      const repId = normalizeCode(r.id);
      const repCode = normalizeCode(r.code);
      const repEmpId = normalizeCode(r.employeeId);
      const repPin = normalizeCode(r.pin);

      if (explicitEmpIdNorm && (repId === explicitEmpIdNorm || repCode === explicitEmpIdNorm || repEmpId === explicitEmpIdNorm)) {
        return true;
      }
      if (repId === userIdNorm) {
        return true;
      }
      if (salesmanCodeNorm && (repCode === salesmanCodeNorm || repEmpId === salesmanCodeNorm)) {
        return true;
      }
      if (userLoginNorm && (repCode === userLoginNorm || repEmpId === userLoginNorm || repPin === userLoginNorm)) {
        return true;
      }
      return false;
    });
  }

  // Priority 3: Verified email match
  if (!matchedRep && userEmailNorm) {
    matchedRep = eligibleReps.find(
      (r) => r.email && normalizeCode(r.email) === userEmailNorm
    );
  }

  // Priority 4: Normalized real phone match
  if (!matchedRep && userPhoneNorm && userPhoneNorm.length >= 8) {
    matchedRep = eligibleReps.find((r) => {
      const repPhoneNorm = normalizePhoneDigits(r.phone);
      return repPhoneNorm && repPhoneNorm.length >= 8 && repPhoneNorm === userPhoneNorm;
    });
  }

  // Priority 5: Exact full-name match (trimmed, case-insensitive)
  if (!matchedRep && userNameNorm) {
    matchedRep = eligibleReps.find(
      (r) => r.name && normalizeCode(r.name) === userNameNorm
    );
  }

  const userGeofence = resolveGeofenceConfigFromUser(
    user,
    officeLocations,
    undefined,
    matchedRep?.branchWorkplace
  );

  const employeeCode =
    String(
      matchedRep?.code ||
        user.salesmanCode ||
        user.userId ||
        user.id
    ).trim();

  const employeeId = String(matchedRep?.id || user.userId || user.id).trim();
  const displayName = String(matchedRep?.name || user.name || 'Staff User').trim();
  const designation = String(
    matchedRep?.designation || user.designation || user.role || 'Staff Member'
  ).trim();
  const assignedRole = deriveAssignedRoleLabel(user, matchedRep);
  const department = String(
    matchedRep?.department || user.department || 'Operations'
  ).trim();

  const region = String(matchedRep?.region || user.region || '').trim();
  const area = String(matchedRep?.area || user.area || '').trim();
  const territory = String(matchedRep?.territory || user.territory || '').trim();

  const officeAddress =
    userGeofence.officeAddress ||
    [territory, area, region].filter(Boolean).join(', ') ||
    department;

  return {
    userId: String(user.id),
    userLoginId: String(user.userId || user.salesmanCode || user.id),
    employeeId,
    employeeCode,
    name: displayName,
    designation,
    assignedRole,
    erpRole: String(user.role || 'Employee'),
    department,
    phone: String(matchedRep?.phone || user.phone || '').trim(),
    email: String(matchedRep?.email || user.email || '').trim(),
    region,
    area,
    territory,
    branchWorkplace: String(
      user.assignedOfficeName || matchedRep?.branchWorkplace || userGeofence.assignedOfficeName
    ),
    officeAddress,
    assignedOfficeId: userGeofence.assignedOfficeId,
    assignedOfficeName: userGeofence.assignedOfficeName,
    officeLatitude: userGeofence.officeLatitude,
    officeLongitude: userGeofence.officeLongitude,
    allowedRadiusMeters: userGeofence.allowedRadiusMeters,
    locationStatus: userGeofence.locationStatus,
    shiftStartTime: userGeofence.shiftStartTime,
    shiftEndTime: userGeofence.shiftEndTime,
    gracePeriodMinutes: userGeofence.gracePeriodMinutes,
    monthlyTargetBDT:
      Number(matchedRep?.monthlyTargetBDT) || Number(user.monthlySalesTargetBDT) || Number(user.salesTargetBDT) || 0,
    monthlyAchievedBDT: Number(matchedRep?.monthlyAchievedBDT || matchedRep?.mtdAchievementBDT || 0),
    tadaApproverId: matchedRep?.tadaApproverId,
    tadaApproverName: matchedRep?.tadaApproverName,
    hasEmployeeRecord: Boolean(matchedRep),
    matchedRep,
  };
}

export function toFieldForceRepView(profile: ResolvedMobileEmployeeProfile): FieldForceRep {
  return {
    ...(profile.matchedRep || {}),
    id: profile.employeeId,
    userId: profile.userId,
    code: profile.employeeCode,
    employeeId: profile.employeeId,
    name: profile.name,
    designation: profile.designation,
    role: profile.assignedRole,
    department: profile.department,
    phone: profile.phone,
    email: profile.email,
    region: profile.region,
    area: profile.area,
    territory: profile.territory,
    branchWorkplace: profile.branchWorkplace,
    assignedOfficeId: profile.assignedOfficeId,
    assignedOfficeName: profile.assignedOfficeName,
    officeLatitude: profile.officeLatitude,
    officeLongitude: profile.officeLongitude,
    allowedRadiusMeters: profile.allowedRadiusMeters,
    officeAddress: profile.officeAddress,
    locationStatus: profile.locationStatus,
    shiftStartTime: profile.shiftStartTime,
    shiftEndTime: profile.shiftEndTime,
    gracePeriodMinutes: profile.gracePeriodMinutes,
    monthlyTargetBDT: profile.monthlyTargetBDT,
    monthlyAchievedBDT: profile.monthlyAchievedBDT,
    tadaApproverId: profile.tadaApproverId,
    tadaApproverName: profile.tadaApproverName,
    status: 'Active',
    isActive: true,
  };
}

/**
 * Verifies that any identity identifiers supplied in a mobile/transaction payload
 * match the authenticated ERP user & resolved employee profile (prevents spoofing).
 */
export function verifyTransactionIdentityMatchesUser(
  claimed: {
    userId?: string;
    employeeId?: string;
    fieldForceId?: string;
    employeeCode?: string;
    salespersonId?: string;
    assignedSalespersonId?: string;
    repId?: string;
    ffCode?: string;
    employee?: {
      id?: string;
      userId?: string;
      employeeId?: string;
      code?: string;
      employeeCode?: string;
    };
  },
  resolved: ResolvedMobileEmployeeProfile
): { valid: boolean; reason?: string } {
  const allowedIds = new Set(
    [
      resolved.userId,
      resolved.userLoginId,
      resolved.employeeId,
      resolved.employeeCode,
      resolved.matchedRep?.id,
      resolved.matchedRep?.code,
      resolved.matchedRep?.employeeId,
    ]
      .map((s) => normalizeCode(s))
      .filter(Boolean)
  );

  const checks: Array<[string, string | undefined]> = [
    ['userId', claimed.userId],
    ['employeeId', claimed.employeeId],
    ['fieldForceId', claimed.fieldForceId],
    ['employeeCode', claimed.employeeCode],
    ['salespersonId', claimed.salespersonId],
    ['assignedSalespersonId', claimed.assignedSalespersonId],
    ['repId', claimed.repId],
    ['ffCode', claimed.ffCode],
    ['employee.userId', claimed.employee?.userId],
    ['employee.id', claimed.employee?.id],
    ['employee.employeeId', claimed.employee?.employeeId],
    ['employee.code', claimed.employee?.code],
    ['employee.employeeCode', claimed.employee?.employeeCode],
  ];

  for (const [field, value] of checks) {
    const cleanVal = normalizeCode(value);
    if (cleanVal && !allowedIds.has(cleanVal)) {
      return {
        valid: false,
        reason: `Identity mismatch on "${field}": authenticated user (${resolved.name} / ${resolved.employeeCode}) cannot submit transactions under another employee (${value}).`,
      };
    }
  }

  return { valid: true };
}
