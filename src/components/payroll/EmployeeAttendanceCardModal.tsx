/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Printable Monthly Employee Attendance Card
 * Reconstructs the classic physical attendance card digitally with live Supabase
 * integration across field_force_reps, employee_attendances, and overtime_requests.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  RefreshCw,
  Calendar,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { useERP } from '../../context/ERPContext.tsx';
import { getSupabase } from '../../lib/supabase.ts';
import { calculateNetWorkingHours, formatTime12Hour, parseTimeToMinutes } from '../../lib/geofence.ts';
import {
  findLinkedUserForEmployee,
  resolveGeofenceConfigFromUser,
} from '../../lib/fieldForceAuth.ts';
import type { FieldForceRep } from '../../types/erp.ts';
import type { AttendanceRecord, AttendanceStatus } from '../../types/payroll.ts';
import type { OvertimeAttendance, OvertimeRequest } from '../../types/overtime.ts';

interface EmployeeAttendanceCardModalProps {
  isOpen: boolean;
  initialEmployeeId?: string;
  initialMonthYear?: string; // YYYY-MM
  autoDownloadPdf?: boolean;
  onClose: () => void;
}

interface DayCardRow {
  day: number;
  dateIso: string;
  weekdayShort: string;
  isWeekendFriday: boolean;
  checkInTime: string;
  checkOutTime: string;
  regularWorkingHours: number | null;
  attendanceStatus: AttendanceStatus | '';
  otExpectedStart: string;
  otExpectedEnd: string;
  otHours: number | null;
  otStatus: string;
  otRequestCount: number;
  netLunchAdjustedHours: number | null;
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBengaliDigits(val: string | number): string {
  return String(val).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d);
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHoursToHMM(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours <= 0) return '—';
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function normalizeTimeDisplay(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function sanitizeOrValue(val: string): string {
  return val.replace(/[,()]/g, '').trim();
}

function computeNonOverlappingOtHours(params: {
  checkInMins: number | null;
  checkOutAdjMins: number | null;
  activeOtReqs: OvertimeRequest[];
  dayOtAtts: OvertimeAttendance[];
  otHours: number | null;
  hasExplicitOt: boolean;
  netShiftHours: number;
  standardDailyHours: number;
}): number {
  const {
    checkInMins,
    checkOutAdjMins,
    activeOtReqs,
    dayOtAtts,
    otHours,
    hasExplicitOt,
    netShiftHours,
    standardDailyHours,
  } = params;

  if (!hasExplicitOt || !otHours || otHours <= 0) return 0;

  if (checkInMins === null || checkOutAdjMins === null) {
    return otHours;
  }

  const calcNonOverlapForRange = (
    rawStart: string | undefined,
    rawEnd: string | undefined,
    hours: number
  ): number | null => {
    const sRaw = parseTimeToMinutes(rawStart);
    const eRaw = parseTimeToMinutes(rawEnd);
    if (sRaw === null || eRaw === null) return null;

    let otS = sRaw;
    let otE = eRaw < sRaw ? eRaw + 1440 : eRaw;
    if (otE <= checkInMins && checkOutAdjMins > 1440) {
      otS += 1440;
      otE += 1440;
    }

    const otSpanMins = otE - otS;
    if (otSpanMins <= 0) return 0;

    const overlapMins = Math.max(
      0,
      Math.min(checkOutAdjMins, otE) - Math.max(checkInMins, otS)
    );
    if (overlapMins >= otSpanMins) return 0;
    if (overlapMins === 0) return hours;

    const nonOverlapRatio = Math.max(0, 1 - overlapMins / otSpanMins);
    return Math.round(hours * nonOverlapRatio * 100) / 100;
  };

  if (activeOtReqs.length > 0) {
    let totalExtra = 0;
    for (const req of activeOtReqs) {
      const matchedAtt = dayOtAtts.find((a) => a.requestId === req.id);
      const reqHours =
        Number(
          matchedAtt && matchedAtt.actualOvertimeHours > 0
            ? matchedAtt.actualOvertimeHours
            : req.actualOvertimeHours && req.actualOvertimeHours > 0
            ? req.actualOvertimeHours
            : req.expectedHours
        ) || 0;
      if (reqHours <= 0) continue;

      const startStr = matchedAtt?.overtimeCheckInTime || req.expectedStartTime;
      const endStr = matchedAtt?.overtimeCheckOutTime || req.expectedEndTime;
      const computed = calcNonOverlapForRange(startStr, endStr, reqHours);
      if (computed !== null) {
        totalExtra += computed;
      } else {
        const alreadyInShift = Math.max(0, netShiftHours - standardDailyHours);
        totalExtra += Math.max(0, reqHours - alreadyInShift);
      }
    }
    return Math.round(totalExtra * 100) / 100;
  }

  if (dayOtAtts.length > 0) {
    let totalExtra = 0;
    for (const att of dayOtAtts) {
      const attHours = Number(att.actualOvertimeHours) || 0;
      if (attHours <= 0) continue;
      const computed = calcNonOverlapForRange(
        att.overtimeCheckInTime,
        att.overtimeCheckOutTime,
        attHours
      );
      if (computed !== null) {
        totalExtra += computed;
      } else {
        const alreadyInShift = Math.max(0, netShiftHours - standardDailyHours);
        totalExtra += Math.max(0, attHours - alreadyInShift);
      }
    }
    return Math.round(totalExtra * 100) / 100;
  }

  const alreadyInShift = Math.max(0, netShiftHours - standardDailyHours);
  return Math.max(0, Math.round((otHours - alreadyInShift) * 100) / 100);
}

export const EmployeeAttendanceCardModal: React.FC<EmployeeAttendanceCardModalProps> = ({
  isOpen,
  initialEmployeeId,
  initialMonthYear,
  autoDownloadPdf = false,
  onClose,
}) => {
  const {
    users,
    officeLocations,
    fieldForceReps,
    attendanceRecords,
    overtimeRequests,
    overtimeAttendances,
    payrollSettings,
    systemSettings,
  } = useERP();

  const cardPrintRef = useRef<HTMLDivElement | null>(null);
  const defaultMonthYear = initialMonthYear || new Date().toISOString().slice(0, 7);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployeeId || fieldForceReps[0]?.id || ''
  );
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(defaultMonthYear);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfFeedback, setPdfFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [fetchedKey, setFetchedKey] = useState<string>('');
  const [autoDownloadPending, setAutoDownloadPending] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dbEmployee, setDbEmployee] = useState<FieldForceRep | null>(null);
  const [dbAttendances, setDbAttendances] = useState<AttendanceRecord[]>([]);
  const [dbOvertimeRequests, setDbOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [dbOvertimeAttendances, setDbOvertimeAttendances] = useState<OvertimeAttendance[]>([]);

  // Sync initial props whenever modal opens
  useEffect(() => {
    if (!isOpen) {
      setAutoDownloadPending(false);
      setPdfFeedback(null);
      setFetchedKey('');
      return;
    }
    if (initialEmployeeId) {
      setSelectedEmployeeId(initialEmployeeId);
    } else if (!selectedEmployeeId && fieldForceReps.length > 0) {
      setSelectedEmployeeId(fieldForceReps[0].id);
    }
    if (initialMonthYear) {
      setSelectedMonthYear(initialMonthYear);
    }
    setPdfFeedback(null);
    if (autoDownloadPdf) {
      setAutoDownloadPending(true);
    }
  }, [isOpen, initialEmployeeId, initialMonthYear, autoDownloadPdf]);

  const contextEmployee = useMemo(
    () =>
      fieldForceReps.find(
        (e) => e.id === selectedEmployeeId || e.code === selectedEmployeeId
      ) || fieldForceReps[0],
    [fieldForceReps, selectedEmployeeId]
  );

  const activeEmployee = dbEmployee || contextEmployee;

  const { yearNum, monthNum, monthStart, monthEnd, daysInMonth, monthLabel } = useMemo(() => {
    const parts = (selectedMonthYear || new Date().toISOString().slice(0, 7)).split('-');
    const y = Math.max(2000, Math.min(2100, Number(parts[0]) || new Date().getFullYear()));
    const m = Math.max(1, Math.min(12, Number(parts[1]) || new Date().getMonth() + 1));
    const dim = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return {
      yearNum: y,
      monthNum: m,
      monthStart: `${y}-${mm}-01`,
      monthEnd: `${y}-${mm}-${String(dim).padStart(2, '0')}`,
      daysInMonth: dim,
      monthLabel: `${String(m).padStart(2, '0')}/${y}`,
    };
  }, [selectedMonthYear]);

  const fetchCardData = useCallback(async () => {
    if (!isOpen || !contextEmployee) return;
    const sb = getSupabase();
    if (!sb) {
      setDbEmployee(null);
      setDbAttendances([]);
      setDbOvertimeRequests([]);
      setDbOvertimeAttendances([]);
      setLoadError(null);
      setFetchedKey(`${contextEmployee.id}::${monthStart}`);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const empIdStr = sanitizeOrValue(String(contextEmployee.id || ''));
    const empCodeStr = sanitizeOrValue(String(contextEmployee.code || ''));
    const empFilter =
      empIdStr && empCodeStr
        ? `employee_id.eq.${empIdStr},employee_code.eq.${empCodeStr}`
        : empIdStr
        ? `employee_id.eq.${empIdStr}`
        : `employee_code.eq.${empCodeStr}`;

    try {
      const empIdNum = Number(empIdStr);
      const repQuery = Number.isFinite(empIdNum) && empIdStr !== ''
        ? sb.from('field_force_reps').select('*').eq('id', empIdNum).maybeSingle()
        : sb.from('field_force_reps').select('*').eq('code', empCodeStr).maybeSingle();

      const [repRes, attRes, otReqRes, otAttRes, backupAttRes] = await Promise.all([
        repQuery,
        sb
          .from('employee_attendances')
          .select('*')
          .or(empFilter)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date', { ascending: true }),
        sb
          .from('overtime_requests')
          .select('*')
          .or(empFilter)
          .gte('overtime_date', monthStart)
          .lte('overtime_date', monthEnd)
          .order('overtime_date', { ascending: true }),
        sb
          .from('overtime_attendances')
          .select('*')
          .or(empFilter)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date', { ascending: true }),
        sb
          .from('system_settings')
          .select('settings_json')
          .eq('id', 'employee_attendances')
          .maybeSingle(),
      ]);

      if (!repRes.error && repRes.data) {
        const row: any = repRes.data;
        setDbEmployee({
          ...contextEmployee,
          id: String(row.id),
          code: row.code || contextEmployee.code,
          name: row.name || contextEmployee.name,
          nativeName: row.native_name || contextEmployee.nativeName,
          designation: row.designation || contextEmployee.designation,
          fieldForceType: row.field_force_type || contextEmployee.fieldForceType,
          department: row.department || contextEmployee.department,
          employeeCategory: row.employee_category || contextEmployee.employeeCategory,
          employmentType: row.employment_type || contextEmployee.employmentType,
          employmentStatus: row.employment_status || contextEmployee.employmentStatus,
          branchWorkplace: row.branch_workplace || contextEmployee.branchWorkplace,
          joiningDate: row.joining_date || contextEmployee.joiningDate,
        });
      } else {
        setDbEmployee(null);
      }

      const mappedAtts: AttendanceRecord[] =
        !attRes.error && Array.isArray(attRes.data)
          ? attRes.data.map((row: any) => ({
              id: String(row.id),
              fieldForceId: row.employee_id ? String(row.employee_id) : undefined,
              employeeId: row.employee_id ? String(row.employee_id) : undefined,
              employeeCode: row.employee_code || undefined,
              employeeName: row.employee_name || contextEmployee.name,
              department: row.department || undefined,
              designation: row.designation || undefined,
              date: String(row.date).slice(0, 10),
              status: (row.status || 'Present') as AttendanceStatus,
              inTime: row.in_time || undefined,
              checkInTime: row.in_time || undefined,
              outTime: row.out_time || undefined,
              checkOutTime: row.out_time || undefined,
              workHours:
                row.work_hours !== null && row.work_hours !== undefined
                  ? Number(row.work_hours)
                  : undefined,
              overtimeHours: Number(row.overtime_hours) || 0,
              lateDurationMinutes: Number(row.late_duration_minutes) || 0,
              lateMinutes: Number(row.late_duration_minutes) || 0,
              isLate: (Number(row.late_duration_minutes) || 0) > 0 || row.status === 'Late',
              assignedOfficeId: row.assigned_office_id || undefined,
              assignedOfficeName: row.assigned_office_name || undefined,
              gpsValidationStatus: row.gps_validation_status || 'Manual',
              remarks: row.remarks || undefined,
              updatedAt: row.updated_at || row.created_at,
            }))
          : [];

      // Merge system_settings backup if employee_attendances had pending rows
      const backupList: AttendanceRecord[] =
        !backupAttRes.error &&
        backupAttRes.data?.settings_json &&
        typeof backupAttRes.data.settings_json === 'object' &&
        Array.isArray((backupAttRes.data.settings_json as any).records)
          ? ((backupAttRes.data.settings_json as any).records as AttendanceRecord[]).filter(
              (r) =>
                r.date >= monthStart &&
                r.date <= monthEnd &&
                (r.employeeId === empIdStr ||
                  r.fieldForceId === empIdStr ||
                  (empCodeStr && r.employeeCode === empCodeStr))
            )
          : [];

      const attMergedMap = new Map<string, AttendanceRecord>();
      mappedAtts.forEach((r) => attMergedMap.set(r.date, r));
      backupList.forEach((b) => {
        const existing = attMergedMap.get(b.date);
        if (!existing) {
          attMergedMap.set(b.date, b);
        } else {
          const eTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
          const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
          if (bTime > eTime) attMergedMap.set(b.date, b);
        }
      });
      setDbAttendances(Array.from(attMergedMap.values()));

      if (!otReqRes.error && Array.isArray(otReqRes.data)) {
        const mappedReqs: OvertimeRequest[] = otReqRes.data.map((r: any) => ({
          id: String(r.id),
          requestNumber: r.request_number || '',
          employeeId: String(r.employee_id),
          employeeCode: r.employee_code || '',
          employeeName: r.employee_name || contextEmployee.name,
          department: r.department || '',
          designation: r.designation || '',
          employeeCategory: r.employee_category || undefined,
          overtimeDate: String(r.overtime_date).slice(0, 10),
          purposeCategory: r.purpose_category || 'Direct Production',
          productionOrderId: r.production_order_id || undefined,
          productionOrderNumber: r.production_order_number || undefined,
          productionBatchNumber: r.production_batch_number || undefined,
          productName: r.product_name || undefined,
          projectPurpose: r.project_purpose || '',
          expectedStartTime: r.expected_start_time || '',
          expectedEndTime: r.expected_end_time || '',
          expectedHours: Number(r.expected_hours) || 0,
          overtimeReason: r.overtime_reason || '',
          requestedBy: r.requested_by || '',
          requestedAt: r.requested_at || r.created_at || '',
          status: r.status || 'Pending Supervisor',
          actualOvertimeHours:
            r.actual_overtime_hours !== null && r.actual_overtime_hours !== undefined
              ? Number(r.actual_overtime_hours)
              : undefined,
          basicSalaryBDT: Number(r.basic_salary_bdt) || 0,
          hourlyRateBDT: Number(r.hourly_rate_bdt) || 0,
          overtimeMultiplier: Number(r.overtime_multiplier) || 1,
          calculatedOvertimeAmountBDT: Number(r.calculated_overtime_amount_bdt) || 0,
          batchAllocations: [],
          createdAt: r.created_at || '',
          updatedAt: r.updated_at || undefined,
        }));
        setDbOvertimeRequests(mappedReqs);
      } else {
        setDbOvertimeRequests([]);
      }

      if (!otAttRes.error && Array.isArray(otAttRes.data)) {
        const mappedOtAtts: OvertimeAttendance[] = otAttRes.data.map((a: any) => ({
          id: String(a.id),
          requestId: a.request_id || undefined,
          requestNumber: a.request_number || undefined,
          employeeId: String(a.employee_id),
          employeeCode: a.employee_code || '',
          employeeName: a.employee_name || '',
          department: a.department || '',
          designation: a.designation || '',
          date: String(a.date).slice(0, 10),
          normalCheckInTime: a.normal_check_in_time || '09:00',
          normalCheckOutTime: a.normal_check_out_time || '18:00',
          overtimeCheckInTime: a.overtime_check_in_time || '',
          overtimeCheckOutTime: a.overtime_check_out_time || '',
          isOvernight: Boolean(a.is_overnight),
          breakDurationMinutes: Number(a.break_duration_minutes) || 0,
          rawCalculatedHours: Number(a.raw_calculated_hours) || 0,
          actualOvertimeHours: Number(a.actual_overtime_hours) || 0,
          isVerified: Boolean(a.is_verified),
          syncSource: (a.sync_source || 'Manual') as any,
          createdAt: a.created_at || '',
        }));
        setDbOvertimeAttendances(mappedOtAtts);
      } else {
        setDbOvertimeAttendances([]);
      }

      const firstErr = attRes.error || otReqRes.error;
      if (firstErr) {
        setLoadError(firstErr.message || 'Partial error loading attendance or overtime records from Supabase.');
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Unable to load monthly attendance card data from Supabase.');
    } finally {
      setIsLoading(false);
      setFetchedKey(`${contextEmployee.id}::${monthStart}`);
    }
  }, [isOpen, contextEmployee, monthStart, monthEnd]);

  useEffect(() => {
    fetchCardData();
  }, [fetchCardData]);

  // Merge direct Supabase query results with live ERPContext records strictly bounded to selected employee + month
  const monthlyAttendancesByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (!activeEmployee) return map;
    const empId = String(activeEmployee.id);
    const empCode = activeEmployee.code || '';

    const isForEmployeeAndMonth = (r: AttendanceRecord) =>
      r.date >= monthStart &&
      r.date <= monthEnd &&
      (r.employeeId === empId ||
        r.fieldForceId === empId ||
        (empCode && r.employeeCode === empCode));

    attendanceRecords.filter(isForEmployeeAndMonth).forEach((r) => map.set(r.date, r));
    dbAttendances.filter(isForEmployeeAndMonth).forEach((r) => {
      const prev = map.get(r.date);
      if (!prev) {
        map.set(r.date, r);
      } else {
        const pTime = prev.updatedAt ? Date.parse(prev.updatedAt) : 0;
        const nTime = r.updatedAt ? Date.parse(r.updatedAt) : 0;
        if (nTime >= pTime) map.set(r.date, r);
      }
    });
    return map;
  }, [activeEmployee, attendanceRecords, dbAttendances, monthStart, monthEnd]);

  const monthlyOvertimeRequests = useMemo(() => {
    if (!activeEmployee) return [];
    const empId = String(activeEmployee.id);
    const empCode = activeEmployee.code || '';

    const isForEmployeeAndMonth = (r: OvertimeRequest) =>
      r.overtimeDate >= monthStart &&
      r.overtimeDate <= monthEnd &&
      (r.employeeId === empId || (empCode && r.employeeCode === empCode));

    const map = new Map<string, OvertimeRequest>();
    overtimeRequests.filter(isForEmployeeAndMonth).forEach((r) => map.set(r.id, r));
    dbOvertimeRequests.filter(isForEmployeeAndMonth).forEach((r) => map.set(r.id, r));

    return Array.from(map.values()).sort((a, b) => a.overtimeDate.localeCompare(b.overtimeDate));
  }, [activeEmployee, overtimeRequests, dbOvertimeRequests, monthStart, monthEnd]);

  const monthlyOvertimeAttendancesByDate = useMemo(() => {
    const map = new Map<string, OvertimeAttendance[]>();
    if (!activeEmployee) return map;
    const empId = String(activeEmployee.id);
    const empCode = activeEmployee.code || '';

    const isForEmployeeAndMonth = (a: OvertimeAttendance) =>
      a.date >= monthStart &&
      a.date <= monthEnd &&
      (a.employeeId === empId || (empCode && a.employeeCode === empCode));

    const dedup = new Map<string, OvertimeAttendance>();
    overtimeAttendances.filter(isForEmployeeAndMonth).forEach((a) => dedup.set(a.id, a));
    dbOvertimeAttendances.filter(isForEmployeeAndMonth).forEach((a) => dedup.set(a.id, a));

    dedup.forEach((a) => {
      const list = map.get(a.date) || [];
      list.push(a);
      map.set(a.date, list);
    });
    return map;
  }, [activeEmployee, overtimeAttendances, dbOvertimeAttendances, monthStart, monthEnd]);

  // Build dynamic day rows (1..daysInMonth — handles 28, 29, 30, 31 automatically)
  const dayRows: DayCardRow[] = useMemo(() => {
    const mm = String(monthNum).padStart(2, '0');
    const rows: DayCardRow[] = [];
    const standardDailyHours =
      Number(payrollSettings?.standardDailyHours || payrollSettings?.standardWorkHoursPerDay) || 8;

    for (let day = 1; day <= daysInMonth; day++) {
      const dd = String(day).padStart(2, '0');
      const dateIso = `${yearNum}-${mm}-${dd}`;
      const weekdayIdx = new Date(yearNum, monthNum - 1, day).getDay();
      const att = monthlyAttendancesByDate.get(dateIso);
      const dayOtReqs = monthlyOvertimeRequests.filter((r) => r.overtimeDate === dateIso);
      const dayOtAtts = monthlyOvertimeAttendancesByDate.get(dateIso) || [];

      const checkInTime = normalizeTimeDisplay(att?.checkInTime || att?.inTime);
      const checkOutTime = normalizeTimeDisplay(att?.checkOutTime || att?.outTime);

      // Compute regular hours using lunch-adjusted net working hours (>= 5h span deducts 1h)
      let regularWorkingHours: number | null = null;
      let rawShiftSpanHours = 0;
      let netShiftHours = 0;
      let checkInMins: number | null = null;
      let checkOutAdjMins: number | null = null;
      if (checkInTime && checkOutTime) {
        const inM = parseTimeToMinutes(checkInTime);
        const outM = parseTimeToMinutes(checkOutTime);
        if (inM !== null && outM !== null) {
          const outAdj = outM >= inM ? outM : outM + 1440;
          checkInMins = inM;
          checkOutAdjMins = outAdj;
          const diff = outAdj - inM;
          rawShiftSpanHours = diff / 60;
        }
        netShiftHours = calculateNetWorkingHours(checkInTime, checkOutTime);
      }
      if (checkInTime && checkOutTime && netShiftHours > 0) {
        regularWorkingHours = netShiftHours;
      } else if (att && typeof att.workHours === 'number' && att.workHours > 0) {
        regularWorkingHours = Math.round(att.workHours * 100) / 100;
      }

      // Overtime aggregation for this date from overtime_requests (+ attendance fallback)
      const activeOtReqs = dayOtReqs.filter(
        (r) => r.status !== 'Rejected' && r.status !== 'Cancelled'
      );
      const primaryOt = activeOtReqs[0] || dayOtReqs[0];
      const otExpectedStart = normalizeTimeDisplay(primaryOt?.expectedStartTime);
      const otExpectedEnd = normalizeTimeDisplay(primaryOt?.expectedEndTime);

      let otHours: number | null = null;
      let hasExplicitOt = false;
      if (activeOtReqs.length > 0) {
        const sumReqOt = activeOtReqs.reduce((sum, req) => {
          const matchedAtt = dayOtAtts.find((a) => a.requestId === req.id);
          const actual =
            matchedAtt && matchedAtt.actualOvertimeHours > 0
              ? matchedAtt.actualOvertimeHours
              : req.actualOvertimeHours && req.actualOvertimeHours > 0
              ? req.actualOvertimeHours
              : req.expectedHours;
          return sum + (Number(actual) || 0);
        }, 0);
        otHours = Math.round(sumReqOt * 100) / 100;
        hasExplicitOt = true;
      } else if (dayOtAtts.length > 0) {
        const sumAttOt = dayOtAtts.reduce(
          (sum, a) => sum + (Number(a.actualOvertimeHours) || 0),
          0
        );
        otHours = sumAttOt > 0 ? Math.round(sumAttOt * 100) / 100 : null;
        hasExplicitOt = otHours !== null && otHours > 0;
      } else if (checkInTime && checkOutTime) {
        // Recompute shift-based overtime after 1h lunch deduction so pre-fix DB rows don't inflate OT
        otHours =
          netShiftHours > standardDailyHours
            ? Math.round((netShiftHours - standardDailyHours) * 100) / 100
            : null;
      } else if (att && typeof att.overtimeHours === 'number' && att.overtimeHours > 0) {
        otHours = Math.round(att.overtimeHours * 100) / 100;
        hasExplicitOt = true;
      }

      // Physical card lunch rule: Working hour + non-overlapping Overtime hour - 1 hr lunch (when total >= 5h)
      let netLunchAdjustedHours: number | null = null;
      if (rawShiftSpanHours > 0) {
        const extraOt = computeNonOverlappingOtHours({
          checkInMins,
          checkOutAdjMins,
          activeOtReqs,
          dayOtAtts,
          otHours,
          hasExplicitOt,
          netShiftHours,
          standardDailyHours,
        });
        const grossTotal = rawShiftSpanHours + extraOt;
        const lunchDeduct = rawShiftSpanHours >= 5 || grossTotal >= 5 ? 1 : 0;
        netLunchAdjustedHours = Math.max(
          0,
          Math.round((grossTotal - lunchDeduct) * 100) / 100
        );
      } else if (regularWorkingHours && regularWorkingHours > 0) {
        const extraOt = hasExplicitOt ? otHours || 0 : 0;
        netLunchAdjustedHours = Math.max(
          0,
          Math.round((regularWorkingHours + extraOt) * 100) / 100
        );
      } else if (otHours && otHours > 0) {
        netLunchAdjustedHours = otHours;
      }

      rows.push({
        day,
        dateIso,
        weekdayShort: WEEKDAY_SHORT[weekdayIdx],
        isWeekendFriday: weekdayIdx === 5,
        checkInTime,
        checkOutTime,
        regularWorkingHours,
        attendanceStatus: att?.status || '',
        otExpectedStart,
        otExpectedEnd,
        otHours,
        otStatus: primaryOt?.status || (otHours && otHours > 0 ? 'Logged' : ''),
        otRequestCount: dayOtReqs.length,
        netLunchAdjustedHours,
      });
    }

    return rows;
  }, [
    yearNum,
    monthNum,
    daysInMonth,
    monthlyAttendancesByDate,
    monthlyOvertimeRequests,
    monthlyOvertimeAttendancesByDate,
    payrollSettings,
  ]);

  // Summary metrics
  const summary = useMemo(() => {
    const standardWorkingDays =
      dayRows.length > 0
        ? dayRows.filter((r) => !r.isWeekendFriday).length
        : Number(payrollSettings?.standardWorkingDaysPerMonth ?? payrollSettings?.workingDaysPerMonth) || 26;
    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let totalRegularHours = 0;
    let totalDayOvertimeHours = 0;

    const now = new Date();
    const localTodayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    dayRows.forEach((r) => {
      if (r.attendanceStatus === 'Present') presentDays += 1;
      else if (r.attendanceStatus === 'Late') lateDays += 1;
      else if (r.attendanceStatus === 'Half Day' || r.attendanceStatus === 'Half-Day') halfDays += 1;
      else if (r.attendanceStatus === 'Absent') absentDays += 1;
      else if (
        r.attendanceStatus === 'Leave' ||
        r.attendanceStatus === 'Paid Leave' ||
        r.attendanceStatus === 'Unpaid Leave'
      ) {
        leaveDays += 1;
      } else if (
        r.attendanceStatus === 'Holiday' ||
        r.attendanceStatus === 'Weekly Off' ||
        r.attendanceStatus === 'Public Holiday'
      ) {
        // Holiday / weekly off — not counted as absent
      } else if (!r.attendanceStatus && r.dateIso < localTodayIso) {
        absentDays += 1;
      }

      if (r.regularWorkingHours) totalRegularHours += r.regularWorkingHours;
      if (r.otHours) totalDayOvertimeHours += r.otHours;
    });

    const totalAttendanceDays = presentDays + lateDays + halfDays;

    const approvedOtHours = monthlyOvertimeRequests
      .filter((r) => r.status === 'Final Approved')
      .reduce(
        (sum, r) =>
          sum +
          (r.actualOvertimeHours && r.actualOvertimeHours > 0
            ? r.actualOvertimeHours
            : r.expectedHours || 0),
        0
      );

    const actualOtHoursFromReqs = monthlyOvertimeRequests
      .filter((r) => r.status !== 'Rejected' && r.status !== 'Cancelled')
      .reduce((sum, r) => sum + (Number(r.actualOvertimeHours) || 0), 0);

    const actualOtHoursFromLogs = Array.from(monthlyOvertimeAttendancesByDate.values())
      .flat()
      .reduce((sum, a) => sum + (Number(a.actualOvertimeHours) || 0), 0);

    const actualOtHours = Math.round(
      Math.max(actualOtHoursFromReqs, actualOtHoursFromLogs) * 100
    ) / 100;

    const requestedOtHours = monthlyOvertimeRequests
      .filter((r) => r.status !== 'Rejected' && r.status !== 'Cancelled')
      .reduce((sum, r) => sum + (Number(r.expectedHours) || 0), 0);

    const totalNetLunchAdjustedHours = dayRows.reduce(
      (sum, r) => sum + (r.netLunchAdjustedHours || 0),
      0
    );

    return {
      standardWorkingDays,
      totalAttendanceDays,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      leaveDays,
      totalRegularHours: Math.round(totalRegularHours * 100) / 100,
      totalOvertimeHours: Math.round(totalDayOvertimeHours * 100) / 100,
      totalNetLunchAdjustedHours: Math.round(totalNetLunchAdjustedHours * 100) / 100,
      approvedOtHours: Math.round(approvedOtHours * 100) / 100,
      actualOtHours,
      requestedOtHours: Math.round(requestedOtHours * 100) / 100,
    };
  }, [dayRows, monthlyOvertimeRequests, monthlyOvertimeAttendancesByDate, payrollSettings]);

  const leftHalfRows = useMemo(() => dayRows.slice(0, 16), [dayRows]);
  const rightHalfRows = useMemo(() => dayRows.slice(16), [dayRows]);
  const rightSpacerCount = Math.max(0, 16 - rightHalfRows.length);

  const shiftMonth = (delta: number) => {
    const d = new Date(yearNum, monthNum - 1 + delta, 1);
    setSelectedMonthYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handlePrintCard = () => {
    const bodyClass =
      orientation === 'landscape'
        ? 'printing-attendance-card-landscape'
        : 'printing-attendance-card';
    document.body.classList.add(bodyClass);
    const cleanup = () => {
      document.body.classList.remove('printing-attendance-card');
      document.body.classList.remove('printing-attendance-card-landscape');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 2000);
  };

  const handleDownloadPdf = useCallback(async () => {
    const cardEl = cardPrintRef.current;
    if (!cardEl || !activeEmployee || isGeneratingPdf) return;

    setIsGeneratingPdf(true);
    setPdfFeedback(null);

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const targetWidth = orientation === 'landscape' ? 1060 : 820;
      const canvas = await html2canvas(cardEl, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f5dc78',
        logging: false,
        windowWidth: 1280,
        windowHeight: 1600,
        onclone: (_clonedDoc, clonedEl) => {
          clonedEl.style.width = `${targetWidth}px`;
          clonedEl.style.maxWidth = `${targetWidth}px`;
          clonedEl.style.margin = '0';
          clonedEl.style.boxShadow = 'none';
          clonedEl.querySelectorAll('[data-pdf-exclude="true"]').forEach((node) => node.remove());
        },
      });

      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 7;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;
      const aspect = canvas.width / canvas.height;

      let renderW = maxW;
      let renderH = renderW / aspect;
      if (renderH > maxH) {
        renderH = maxH;
        renderW = renderH * aspect;
      }

      const offsetX = (pageWidth - renderW) / 2;
      const offsetY = margin;
      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');

      const safeCode = String(activeEmployee.code || activeEmployee.id || 'EMP')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_');
      const safeName = String(activeEmployee.name || 'Employee')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const fileName = `Attendance_Card_${safeCode}${safeName ? `_${safeName}` : ''}_${selectedMonthYear}.pdf`;

      pdf.save(fileName);
      setPdfFeedback({
        type: 'success',
        message: `Downloaded ${fileName}`,
      });
    } catch (err: any) {
      setPdfFeedback({
        type: 'error',
        message: err?.message || 'Failed to generate Attendance Card PDF. Please try again.',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [activeEmployee, isGeneratingPdf, orientation, selectedMonthYear]);

  useEffect(() => {
    if (!isOpen || !autoDownloadPending || isLoading || !contextEmployee || !activeEmployee) {
      return;
    }
    const currentKey = `${contextEmployee.id}::${monthStart}`;
    if (fetchedKey !== currentKey) return;

    const timer = window.setTimeout(() => {
      setAutoDownloadPending(false);
      void handleDownloadPdf();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    isOpen,
    autoDownloadPending,
    isLoading,
    contextEmployee,
    activeEmployee,
    monthStart,
    fetchedKey,
    handleDownloadPdf,
  ]);

  const activeEmpGeofence = useMemo(() => {
    if (!activeEmployee) return null;
    return resolveGeofenceConfigFromUser(
      findLinkedUserForEmployee(activeEmployee, users),
      officeLocations,
      payrollSettings,
      activeEmployee.branchWorkplace
    );
  }, [activeEmployee, users, officeLocations, payrollSettings]);

  if (!isOpen) return null;

  const rawCompanyName = payrollSettings?.companyName?.trim();
  const companyName =
    !rawCompanyName || rawCompanyName.toUpperCase() === 'STERN INDUSTRIES LTD.'
      ? 'স্টার্ন ইন্ডাষ্ট্রিজ লিঃ'
      : rawCompanyName;
  const rawCompanyAddress = payrollSettings?.companyAddress?.trim();
  const isDefaultAddress =
    !rawCompanyAddress ||
    rawCompanyAddress === '8/A Factory Road, Shyampur I/A, Kadamtoli, Dhaka';
  const companyAddressLine1 = isDefaultAddress
    ? '৮/এ ফ্যাক্টরী রোড, শ্যামপুর শি/এ'
    : rawCompanyAddress;
  const companyAddressLine2 = isDefaultAddress ? 'কদম তলী, ঢাকা' : '';

  const shiftLabel =
    activeEmpGeofence && (activeEmpGeofence.shiftStartTime || payrollSettings?.shiftStartTime)
      ? `${formatTime12Hour(
          activeEmpGeofence.shiftStartTime || payrollSettings?.shiftStartTime
        )} - ${formatTime12Hour(
          activeEmpGeofence.shiftEndTime || payrollSettings?.shiftEndTime || '17:00'
        )}`
      : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto print:static print:p-0 print:bg-white print:overflow-visible">
      <div className="w-full max-w-6xl max-h-[94vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden print:max-h-none print:border-none print:shadow-none print:rounded-none print:overflow-visible">
        {/* Top Modal Action Bar (Hidden on Print) */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-2xs shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Employee Attendance Card
              </h3>
              <p className="text-[11px] text-slate-500">
                Monthly Attendance & Overtime Card • Synced with field_force_reps, employee_attendances & overtime_requests
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Employee Picker */}
            <select
              value={activeEmployee?.id || ''}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              aria-label="Select Employee"
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[230px]"
            >
              {fieldForceReps.length === 0 ? (
                <option value="">No employees available</option>
              ) : (
                fieldForceReps.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.code} — {emp.name}
                  </option>
                ))
              )}
            </select>

            {/* Month & Year Picker */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                title="Previous Month"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1 px-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <input
                  type="month"
                  value={selectedMonthYear}
                  onChange={(e) => e.target.value && setSelectedMonthYear(e.target.value)}
                  aria-label="Select Month and Year"
                  className="py-1 bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                title="Next Month"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Print Orientation */}
            <div className="inline-flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  orientation === 'portrait'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                A4 Portrait
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  orientation === 'landscape'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                A4 Landscape
              </button>
            </div>

            <button
              type="button"
              onClick={fetchCardData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!activeEmployee || isLoading || isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <Download className={`w-3.5 h-3.5 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
              <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintCard}
              disabled={!activeEmployee || isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Attendance Card</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Preview Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-100 dark:bg-slate-950/80 print:p-0 print:bg-white print:overflow-visible">
          {pdfFeedback && (
            <div
              className={`mb-3 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 print:hidden ${
                pdfFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {pdfFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span className="font-semibold">{pdfFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setPdfFeedback(null)}
                className="p-0.5 rounded hover:bg-black/5"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loadError && (
            <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 print:hidden">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{loadError} — showing synchronized ERP records where available.</span>
            </div>
          )}

          {!activeEmployee ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 text-sm">
              No employee records found. Add employees under Basic Data → Employees first.
            </div>
          ) : (
            <div
              ref={cardPrintRef}
              id="employee-attendance-card-print"
              lang="bn"
              className={`mx-auto bg-[#f5dc78] text-black border border-slate-400 shadow-md p-5 sm:p-7 print:bg-white print:border-black print:shadow-none print:p-2 ${
                orientation === 'landscape' ? 'max-w-[1060px]' : 'max-w-[820px]'
              }`}
            >
              {/* Loading indicator overlay bar on screen */}
              {isLoading && (
                <div
                  data-pdf-exclude="true"
                  className="mb-2 px-3 py-1 rounded bg-white/80 border border-slate-400 text-slate-800 text-[11px] font-semibold flex items-center gap-2 print:hidden"
                >
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Loading {monthLabel} attendance &amp; overtime data...</span>
                </div>
              )}

              {/* ================================================================= */}
              {/* TOP BOOKLET HEADER: SUMMARY + RULES (LEFT) | COMPANY + EMP (RIGHT) */}
              {/* ================================================================= */}
              <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2">
                {/* TOP LEFT PANEL: Summary + Timekeeper + Rules + Authority */}
                <div className="pr-0 md:pr-5 pb-12 md:pb-12 print:pb-10 border-b md:border-b-0 md:border-r border-slate-700/60 print:border-b-0 print:border-r print:border-black print:pr-4 flex flex-col justify-between">
                  <div>
                    <div className="space-y-2 text-[13px] leading-snug">
                      <div className="grid grid-cols-12 items-baseline gap-1">
                        <span className="col-span-6 font-medium text-black">
                          মাসিক কর্ম দিবস
                        </span>
                        <span className="col-span-1 text-center font-bold">:</span>
                        <div className="col-span-5 flex items-baseline">
                          <span className="flex-1 border-b border-dotted border-black text-center font-mono text-[13px] font-semibold leading-none pb-0.5">
                            {summary.standardWorkingDays}
                          </span>
                          <span className="ml-1 font-medium shrink-0">দিন</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 items-baseline gap-1">
                        <span className="col-span-6 font-medium text-black">
                          সম্পাদিত মোট কর্ম দিবস
                        </span>
                        <span className="col-span-1 text-center font-bold">:</span>
                        <div className="col-span-5 flex items-baseline">
                          <span className="flex-1 border-b border-dotted border-black text-center font-mono text-[13px] font-semibold leading-none pb-0.5">
                            {String(summary.totalAttendanceDays).padStart(2, '0')}
                          </span>
                          <span className="ml-1 font-medium shrink-0">দিন</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 items-baseline gap-1">
                        <span className="col-span-6 font-medium text-black">
                          মোট অনুপস্থিতি
                        </span>
                        <span className="col-span-1 text-center font-bold">:</span>
                        <div className="col-span-5 flex items-baseline">
                          <span className="flex-1 border-b border-dotted border-black text-center font-mono text-[13px] font-semibold leading-none pb-0.5">
                            {summary.absentDays}
                          </span>
                          <span className="ml-1 font-medium shrink-0">দিন</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 items-baseline gap-1">
                        <span className="col-span-6 font-medium text-black">
                          মোট অতিরিক্ত সময়
                        </span>
                        <span className="col-span-1 text-center font-bold">:</span>
                        <div className="col-span-5 flex items-baseline">
                          <span className="flex-1 border-b border-dotted border-black text-center font-mono text-[13px] font-semibold leading-none pb-0.5">
                            {summary.totalOvertimeHours > 0
                              ? formatHoursToHMM(summary.totalOvertimeHours)
                              : '0:00'}
                          </span>
                          <span className="ml-1 font-medium shrink-0">দিন</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end pr-2">
                      <span className="border-t border-black px-3 pt-0.5 text-[11px] font-medium text-black">
                        সময় নিয়ন্ত্রক
                      </span>
                    </div>
                  </div>

                  {/* Card Rules matching exact screenshot text */}
                  <div className="mt-2 text-[11.5px] leading-snug text-black">
                    <div className="font-bold underline mb-1.5 text-[13px]">
                      নিয়মাবলীঃ
                    </div>
                    <ol className="space-y-1 text-[11px] leading-[1.45]">
                      <li className="flex gap-1.5">
                        <span className="shrink-0">১।</span>
                        <span>এই কার্ড প্রতিদিন সময় নিয়ন্ত্রণ কক্ষে জমা দিতে হইবে।</span>
                      </li>
                      <li className="flex gap-1.5">
                        <span className="shrink-0">২।</span>
                        <span>এই কার্ড পুনঃলিখন/মুদ্রণ, কাটাকাটি, ঘষামাজা করা যাইবে না।</span>
                      </li>
                      <li className="flex gap-1.5">
                        <span className="shrink-0">৩।</span>
                        <span>কার্ডে উল্লেখিত ব্যক্তি ছাড়া অন্য কেহ ইহা ব্যবহার করিতে পারিবে না।</span>
                      </li>
                      <li className="flex gap-1.5">
                        <span className="shrink-0">৪।</span>
                        <span>
                          এই কার্ড হারাইয়া গেলে ১০/-(দশ) টাকা জরিমানা প্রদান সাপেক্ষে যথাযথ কর্তৃপক্ষ হইতে নিয়ম মোতাবেক কার্ড সংগ্রহ করিতে হইবে।
                        </span>
                      </li>
                    </ol>
                    <div className="mt-3 flex justify-end pr-4">
                      <span className="text-[12px] font-medium text-black">
                        কর্তৃপক্ষ
                      </span>
                    </div>
                  </div>
                </div>

                {/* TOP RIGHT PANEL: Company Header + Boxed Title + Employee Info */}
                <div className="pl-0 md:pl-5 pt-3 md:pt-0 pb-12 print:pl-4 print:pt-0 print:pb-10 flex flex-col justify-between">
                  <div className="text-center pt-1 pb-3">
                    {systemSettings?.branding?.logoDataUrl && (
                      <div className="flex justify-center mb-1">
                        <img
                          src={systemSettings.branding.logoDataUrl}
                          alt={companyName}
                          className="h-7 w-auto object-contain"
                        />
                      </div>
                    )}
                    <h1 className="text-[22px] font-extrabold tracking-tight text-black leading-tight">
                      {companyName}
                    </h1>
                    <p className="text-[11px] text-black leading-snug mt-0.5">
                      {companyAddressLine1}
                    </p>
                    {companyAddressLine2 && (
                      <p className="text-[11px] text-black leading-snug">
                        {companyAddressLine2}
                      </p>
                    )}
                    <div className="inline-block mt-3 px-6 py-0.5 border-2 border-black text-[15px] font-extrabold tracking-wide text-black">
                      হাজিরা কার্ড
                    </div>
                  </div>

                  {/* Employee Information Ruled Fields (Exact Screenshot Labels) */}
                  <div className="space-y-2.5 text-[12.5px] text-black mt-2">
                    <div className="flex items-baseline gap-2">
                      <div className="flex items-baseline gap-1 flex-1 min-w-0">
                        <span className="font-medium shrink-0">কার্ড নংঃ</span>
                        <span className="flex-1 border-b border-dotted border-black px-1 font-mono font-semibold text-center truncate">
                          {activeEmployee.code || activeEmployee.id}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 w-[49%] shrink-0">
                        <span className="font-medium shrink-0">শিফটঃ</span>
                        <span className="flex-1 border-b border-dotted border-black px-1 font-mono text-[10px] text-center whitespace-nowrap">
                          {shiftLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium shrink-0">নামঃ</span>
                      <span className="flex-1 border-b border-dotted border-black px-2 font-semibold">
                        {activeEmployee.name}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium shrink-0">পিতা/স্বামীর নামঃ</span>
                      <span className="flex-1 border-b border-dotted border-black px-2 min-h-[16px]" />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium shrink-0">পদবীঃ</span>
                      <span className="flex-1 border-b border-dotted border-black px-2 font-medium">
                        {activeEmployee.employmentType || activeEmployee.fieldForceType || ''}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium shrink-0">সেকশন/বিভাগঃ</span>
                      <span className="flex-1 border-b border-dotted border-black px-2 font-medium">
                        {activeEmployee.employeeCategory || ''}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-3 pt-0.5">
                      <div className="flex items-baseline gap-1 flex-1">
                        <span className="font-medium shrink-0">মাসঃ</span>
                        <span className="flex-1 border-b border-dotted border-black px-2 font-mono font-semibold text-center">
                          {String(monthNum).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 flex-1">
                        <span className="font-medium shrink-0">সনঃ</span>
                        <span className="flex-1 border-b border-dotted border-black px-2 font-mono font-semibold text-center">
                          {yearNum}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================================================================= */}
              {/* BOTTOM HALF: SPLIT DAILY ATTENDANCE GRID (১-১৬ | ১৭-৩১)           */}
              {/* ================================================================= */}
              <div className="mt-32 print:mt-24 grid grid-cols-1 lg:grid-cols-2 gap-0 border border-black print:grid-cols-2">
                {/* LEFT TABLE: Days ১ to ১৬ */}
                <div className="border-b lg:border-b-0 lg:border-r border-black print:border-b-0 print:border-r">
                  <table className="w-full border-collapse text-[10.5px] text-black tabular-nums">
                    <thead>
                      <tr className="font-bold text-black">
                        <th
                          rowSpan={2}
                          className="border-b border-r border-black px-1 py-1 text-center w-9 leading-tight"
                        >
                          তারিখ
                        </th>
                        <th
                          colSpan={2}
                          className="border-b border-r border-black px-1 py-0.5 text-center leading-tight"
                        >
                          নিয়মিত
                          <br />
                          সময়
                        </th>
                        <th
                          rowSpan={2}
                          className="border-b border-r border-black px-1 py-1 text-center w-10 leading-tight"
                        >
                          স্বাক্ষর
                        </th>
                        <th
                          colSpan={3}
                          className="border-b border-r border-black px-1 py-0.5 text-center leading-tight"
                        >
                          অতিরিক্ত সময়
                        </th>
                        <th
                          rowSpan={2}
                          className="border-b border-black px-1 py-1 text-center w-10 leading-tight"
                        >
                          স্বাক্ষর
                        </th>
                      </tr>
                      <tr className="text-[9.5px] font-bold text-black leading-tight">
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          আরম্ভ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          শেষ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          আরম্ভ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          শেষ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          মোট
                          <br />
                          সময়
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leftHalfRows.map((r) => (
                        <tr key={r.dateIso} className="h-[21px]">
                          <td className="border-b border-r border-black px-1 py-0.5 text-center font-medium">
                            {toBengaliDigits(r.day)}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.checkInTime) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.checkOutTime) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center" />
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.otExpectedStart) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.otExpectedEnd) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[9px] font-semibold whitespace-nowrap">
                            {r.netLunchAdjustedHours !== null && r.netLunchAdjustedHours > 0
                              ? formatHoursToHMM(r.netLunchAdjustedHours)
                              : ''}
                          </td>
                          <td className="border-b border-black px-0.5 py-0.5 text-center" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* RIGHT TABLE: Days ১৭ to daysInMonth (২৮/২৯/৩০/৩১) */}
                <div>
                  <table className="w-full border-collapse text-[10.5px] text-black tabular-nums">
                    <thead>
                      <tr className="font-bold text-black">
                        <th
                          rowSpan={2}
                          className="border-b border-r border-black px-1 py-1 text-center w-9 leading-tight"
                        >
                          তারিখ
                        </th>
                        <th
                          colSpan={2}
                          className="border-b border-r border-black px-1 py-0.5 text-center leading-tight"
                        >
                          নিয়মিত
                          <br />
                          সময়
                        </th>
                        <th
                          rowSpan={2}
                          className="border-b border-r border-black px-1 py-1 text-center w-10 leading-tight"
                        >
                          স্বাক্ষর
                        </th>
                        <th
                          colSpan={3}
                          className="border-b border-r border-black px-1 py-0.5 text-center leading-tight"
                        >
                          অতিরিক্ত সময়
                        </th>
                        <th
                          rowSpan={2}
                          className="border-b border-black px-1 py-1 text-center w-10 leading-tight"
                        >
                          স্বাক্ষর
                        </th>
                      </tr>
                      <tr className="text-[9.5px] font-bold text-black leading-tight">
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          আরম্ভ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          শেষ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          আরম্ভ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          শেষ
                        </th>
                        <th className="border-b border-r border-black px-0.5 py-0.5 text-center">
                          মোট
                          <br />
                          সময়
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rightHalfRows.map((r) => (
                        <tr key={r.dateIso} className="h-[21px]">
                          <td className="border-b border-r border-black px-1 py-0.5 text-center font-medium">
                            {toBengaliDigits(r.day)}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.checkInTime) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.checkOutTime) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center" />
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.otExpectedStart) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[8.5px] whitespace-nowrap">
                            {formatTime12Hour(r.otExpectedEnd) || ''}
                          </td>
                          <td className="border-b border-r border-black px-0.5 py-0.5 text-center font-mono text-[9px] font-semibold whitespace-nowrap">
                            {r.netLunchAdjustedHours !== null && r.netLunchAdjustedHours > 0
                              ? formatHoursToHMM(r.netLunchAdjustedHours)
                              : ''}
                          </td>
                          <td className="border-b border-black px-0.5 py-0.5 text-center" />
                        </tr>
                      ))}
                      {Array.from({ length: rightSpacerCount }).map((_, idx) => (
                        <tr key={`spacer-${idx}`} className="h-[21px]">
                          <td className="border-b border-r border-black px-1 py-0.5 text-center" />
                          <td className="border-b border-r border-black px-0.5 py-0.5" />
                          <td className="border-b border-r border-black px-0.5 py-0.5" />
                          <td className="border-b border-r border-black px-0.5 py-0.5" />
                          <td className="border-b border-r border-black px-0.5 py-0.5" />
                          <td className="border-b border-r border-black px-0.5 py-0.5" />
                          <td className="border-b border-r border-black px-0.5 py-0.5" />
                          <td className="border-b border-black px-0.5 py-0.5" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ================================================================= */}
              {/* BOTTOM SIGNATURES                                                 */}
              {/* ================================================================= */}
              <div className="mt-7 pt-2 flex items-end justify-between text-[12px] text-black px-2">
                <div className="text-center">
                  <div className="pt-1 font-medium">
                    শ্রমিকের স্বাক্ষর
                  </div>
                </div>
                <div className="text-center">
                  <div className="pt-1 font-medium">
                    প্রশাসনিক কর্মকর্তার স্বাক্ষর
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
