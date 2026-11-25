/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Unified Attendance <-> Overtime Requisition Synchronization Engine
 * Shared between Express backend (server.ts) and React frontend (ERPContext.tsx).
 *
 * Supports:
 * - QR Code Attendance Scans (IN / OUT / OUT_UPDATE)
 * - Manual Attendance Daily Grid Create / Update (Today & Historical Dates)
 * - Bulk Attendance Marking
 * - GPS Check-Out
 */

import {
  DEFAULT_SHIFT_END_TIME,
  DEFAULT_SHIFT_START_TIME,
  formatMinutesAsHHmm,
  formatTime12Hour,
  parseTimeToMinutes,
} from './geofence.ts';
import {
  EmployeeOvertimePolicy,
  OvertimeRequest,
  calculateEmployeeIndividualOvertime,
} from '../types/overtime.ts';
import type { AttendanceRecord } from '../types/payroll.ts';

export const MINIMUM_AUTO_OVERTIME_MINUTES = 60;
export const DEFAULT_ATTENDANCE_CANCEL_REASON =
  'Attendance OUT Time Updated – No Overtime';

export type AttendanceOvertimeSourceMode = 'QR' | 'MANUAL' | 'GPS';

export interface QrOvertimeEligibility {
  otStartTime24: string;
  otEndTime24: string;
  overtimeMinutes: number;
  overtimeHours: number;
  qualifiesForAutoRequest: boolean;
}

function parseFlexibleTimeMinutes(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .replace(/\b([ap])\.?\s*m\.?(?=\s|$)/gi, '$1M');
  return parseTimeToMinutes(normalized);
}

function isNonWorkingAttendanceStatus(status?: string | null): boolean {
  const s = String(status || '').trim().toLowerCase();
  return (
    s === 'absent' ||
    s === 'leave' ||
    s === 'paid leave' ||
    s === 'unpaid leave'
  );
}

/**
 * Calculates automated overtime eligibility from Attendance IN/OUT and
 * Payroll & HR Settings Default Shift Start/End Times.
 *
 * Rules:
 * - Overtime starts immediately after configured Default Shift End Time.
 * - Overtime ends at actual attendance OUT time (with overnight rollover support).
 * - Minimum qualifying overtime = 60 minutes (1 hour).
 * - Absent / Leave or missing OUT time results in 0 overtime.
 */
export function calculateQrOvertimeEligibility(params: {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  attendanceStatus?: string | null;
  defaultShiftEndTime?: string | null;
  defaultShiftStartTime?: string | null;
  minimumOvertimeMinutes?: number;
}): QrOvertimeEligibility {
  const minThreshold =
    typeof params.minimumOvertimeMinutes === 'number' && params.minimumOvertimeMinutes > 0
      ? params.minimumOvertimeMinutes
      : MINIMUM_AUTO_OVERTIME_MINUTES;

  const shiftEndMinsRaw =
    parseFlexibleTimeMinutes(params.defaultShiftEndTime) ??
    parseFlexibleTimeMinutes(DEFAULT_SHIFT_END_TIME) ??
    18 * 60;
  const shiftStartMinsRaw =
    parseFlexibleTimeMinutes(params.defaultShiftStartTime) ??
    parseFlexibleTimeMinutes(DEFAULT_SHIFT_START_TIME) ??
    9 * 60;

  const shiftEndCanonical = formatMinutesAsHHmm(shiftEndMinsRaw);

  if (isNonWorkingAttendanceStatus(params.attendanceStatus)) {
    return {
      otStartTime24: shiftEndCanonical,
      otEndTime24: '',
      overtimeMinutes: 0,
      overtimeHours: 0,
      qualifiesForAutoRequest: false,
    };
  }

  const checkInMins = parseFlexibleTimeMinutes(params.checkInTime);
  const checkOutMinsRaw = parseFlexibleTimeMinutes(params.checkOutTime);

  if (checkOutMinsRaw === null) {
    return {
      otStartTime24: shiftEndCanonical,
      otEndTime24: '',
      overtimeMinutes: 0,
      overtimeHours: 0,
      qualifiesForAutoRequest: false,
    };
  }

  const outCanonical = formatMinutesAsHHmm(checkOutMinsRaw);
  const isOvernightConfiguredShift = shiftEndMinsRaw < shiftStartMinsRaw;

  let effectiveShiftEnd = shiftEndMinsRaw;
  let adjCheckIn = checkInMins;
  let adjCheckOut = checkOutMinsRaw;

  if (isOvernightConfiguredShift) {
    effectiveShiftEnd = shiftEndMinsRaw + 1440;
    if (adjCheckIn !== null && adjCheckIn < shiftStartMinsRaw) {
      adjCheckIn += 1440;
    }
    if (adjCheckOut < shiftStartMinsRaw) {
      adjCheckOut += 1440;
    }
    if (adjCheckIn !== null && adjCheckOut < adjCheckIn) {
      adjCheckOut += 1440;
    }
  } else if (adjCheckIn !== null && adjCheckOut < adjCheckIn) {
    // Overnight OUT punch on a standard daytime shift (e.g. 08:30 AM -> 01:00 AM)
    adjCheckOut += 1440;
  }

  const otStartMins =
    adjCheckIn !== null && adjCheckIn > effectiveShiftEnd
      ? adjCheckIn
      : effectiveShiftEnd;

  const overtimeMinutes = Math.max(0, adjCheckOut - otStartMins);
  const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;

  return {
    otStartTime24: formatMinutesAsHHmm(otStartMins),
    otEndTime24: outCanonical,
    overtimeMinutes,
    overtimeHours,
    qualifiesForAutoRequest: overtimeMinutes >= minThreshold,
  };
}

export function isOvertimeRequestPendingForAutoUpdate(status?: string | null): boolean {
  const norm = String(status || '').trim();
  return norm === 'Pending Supervisor' || norm === 'Draft' || norm === 'Pending';
}

export function isOvertimeRequestApprovedStatus(status?: string | null): boolean {
  const norm = String(status || '').trim();
  return (
    norm === 'Supervisor Approved' ||
    norm === 'Production Approved' ||
    norm === 'HR Verified' ||
    norm === 'Final Approved'
  );
}

export function isOvertimeRequestRejectedStatus(status?: string | null): boolean {
  return String(status || '').trim() === 'Rejected';
}

export function isOvertimeRequestCancelledStatus(status?: string | null): boolean {
  return String(status || '').trim() === 'Cancelled';
}

const normCode = (val?: string | null): string => String(val || '').trim().toLowerCase();

function matchesEmployeeAndDate(
  req: OvertimeRequest,
  employeeId?: string | null,
  employeeCode?: string | null,
  targetDate?: string | null
): boolean {
  if (!req || !targetDate) return false;
  if (String(req.overtimeDate || '').trim().slice(0, 10) !== targetDate) return false;

  const targetEmpId = normCode(employeeId);
  const targetEmpCode = normCode(employeeCode);
  const rEmpId = normCode(req.employeeId);
  const rEmpCode = normCode(req.employeeCode);

  if (targetEmpId && rEmpId && rEmpId === targetEmpId) return true;
  if (targetEmpCode && rEmpCode && rEmpCode === targetEmpCode) return true;
  if (targetEmpId && rEmpCode && rEmpCode === targetEmpId) return true;
  if (targetEmpCode && rEmpId && rEmpId === targetEmpCode) return true;
  return false;
}

/**
 * Finds an active (non-Cancelled) overtime requisition for the same employee and date.
 */
export function findDuplicateOvertimeRequest(
  requests: OvertimeRequest[],
  employeeId?: string | null,
  employeeCode?: string | null,
  overtimeDate?: string | null,
  excludeRequestId?: string | null
): OvertimeRequest | undefined {
  const targetDate = String(overtimeDate || '').trim().slice(0, 10);
  if (!targetDate) return undefined;

  return requests.find((req) => {
    if (!req) return false;
    if (excludeRequestId && req.id === excludeRequestId) return false;
    if (isOvertimeRequestCancelledStatus(req.status)) return false;
    return matchesEmployeeAndDate(req, employeeId, employeeCode, targetDate);
  });
}

/**
 * Finds the latest Cancelled overtime requisition for the same employee and date
 * so automatic Attendance edits never auto-reactivate a cancelled requisition.
 */
export function findCancelledOvertimeRequest(
  requests: OvertimeRequest[],
  employeeId?: string | null,
  employeeCode?: string | null,
  overtimeDate?: string | null
): OvertimeRequest | undefined {
  const targetDate = String(overtimeDate || '').trim().slice(0, 10);
  if (!targetDate) return undefined;

  return requests.find(
    (req) =>
      Boolean(req) &&
      isOvertimeRequestCancelledStatus(req.status) &&
      matchesEmployeeAndDate(req, employeeId, employeeCode, targetDate)
  );
}

export function generateNextOvertimeRequestNumber(
  existingRequests: OvertimeRequest[],
  year = new Date().getFullYear()
): string {
  const existingMax = existingRequests.reduce((max, r) => {
    const m = String(r.requestNumber || '').match(/(\d+)$/);
    const num = m ? parseInt(m[1], 10) : 0;
    return num > max ? num : max;
  }, 0);
  const nextSeq = Math.max(existingMax + 1, existingRequests.length + 1);
  return `OTR-${year}-${String(nextSeq).padStart(3, '0')}`;
}

export type QrOvertimeSyncAction =
  | 'CREATED'
  | 'UPDATED'
  | 'CANCELLED'
  | 'LOCKED_APPROVED'
  | 'LOCKED_REJECTED'
  | 'LOCKED_CANCELLED'
  | 'BELOW_THRESHOLD_NO_REQUEST'
  | 'BELOW_THRESHOLD_EXISTING_UNCHANGED';

export interface QrOvertimeSyncResult {
  action: QrOvertimeSyncAction;
  eligibility: QrOvertimeEligibility;
  request?: OvertimeRequest;
  previousStatus?: string;
  previousHours?: number;
  message: string;
  auditDetails?: string;
}

export interface ReconcileAttendanceOvertimeParams {
  existingRequests: OvertimeRequest[];
  attendanceRecord: AttendanceRecord;
  employee: {
    id: string;
    code?: string;
    name: string;
    department?: string;
    designation?: string;
    employeeCategory?: string;
    basicSalaryBDT?: number;
  };
  salaryBasicBDT?: number;
  salaryGrossBDT?: number;
  policy?: Partial<EmployeeOvertimePolicy>;
  defaultShiftEndTime?: string | null;
  defaultShiftStartTime?: string | null;
  nowIso?: string;
  sourceMode?: AttendanceOvertimeSourceMode;
  actorName?: string;
}

export function reconcileAttendanceOvertimeRequest(
  params: ReconcileAttendanceOvertimeParams
): QrOvertimeSyncResult {
  const {
    existingRequests,
    attendanceRecord,
    employee,
    salaryBasicBDT,
    salaryGrossBDT,
    policy,
    defaultShiftEndTime,
    defaultShiftStartTime,
    nowIso = new Date().toISOString(),
    sourceMode = 'MANUAL',
    actorName = 'Attendance Synchronization',
  } = params;

  const checkInTime = attendanceRecord.inTime || attendanceRecord.checkInTime || '';
  const checkOutTime = attendanceRecord.outTime || attendanceRecord.checkOutTime || '';
  const attendanceDate = String(attendanceRecord.date || '').slice(0, 10);

  const eligibility = calculateQrOvertimeEligibility({
    checkInTime,
    checkOutTime,
    attendanceStatus: attendanceRecord.status,
    defaultShiftEndTime,
    defaultShiftStartTime,
    minimumOvertimeMinutes: MINIMUM_AUTO_OVERTIME_MINUTES,
  });

  if (!attendanceDate) {
    return {
      action: 'BELOW_THRESHOLD_NO_REQUEST',
      eligibility,
      message: 'Attendance date missing; skipped overtime synchronization.',
    };
  }

  const existingActive = findDuplicateOvertimeRequest(
    existingRequests,
    employee.id,
    employee.code,
    attendanceDate
  );
  const existingCancelled = !existingActive
    ? findCancelledOvertimeRequest(
        existingRequests,
        employee.id,
        employee.code,
        attendanceDate
      )
    : undefined;

  const inLabel = formatTime12Hour(checkInTime) || checkInTime || '—';
  const outLabel =
    formatTime12Hour(eligibility.otEndTime24 || checkOutTime) ||
    eligibility.otEndTime24 ||
    checkOutTime ||
    '—';
  const shiftEndLabel = formatTime12Hour(eligibility.otStartTime24) || eligibility.otStartTime24;

  // 1. Existing active (non-Cancelled) requisition found for (employee, attendanceDate)
  if (existingActive) {
    if (isOvertimeRequestApprovedStatus(existingActive.status)) {
      return {
        action: 'LOCKED_APPROVED',
        eligibility,
        request: existingActive,
        previousStatus: existingActive.status,
        previousHours: existingActive.expectedHours,
        message: `Overtime request ${existingActive.requestNumber} is already ${existingActive.status} and locked from automatic updates.`,
        auditDetails: `Attendance updated on ${attendanceDate} (IN: ${inLabel}, OUT: ${outLabel}, Calculated OT: ${eligibility.overtimeHours}h), but ${existingActive.requestNumber} remains ${existingActive.status} (${existingActive.expectedHours}h) per approval protection.`,
      };
    }

    if (isOvertimeRequestRejectedStatus(existingActive.status)) {
      return {
        action: 'LOCKED_REJECTED',
        eligibility,
        request: existingActive,
        previousStatus: existingActive.status,
        previousHours: existingActive.expectedHours,
        message: `Overtime request ${existingActive.requestNumber} is already Rejected and locked from automatic updates.`,
        auditDetails: `Attendance updated on ${attendanceDate} (IN: ${inLabel}, OUT: ${outLabel}, Calculated OT: ${eligibility.overtimeHours}h), but ${existingActive.requestNumber} remains Rejected per approval protection.`,
      };
    }

    if (isOvertimeRequestPendingForAutoUpdate(existingActive.status)) {
      // Scenario D: Overtime completely removed or fell below 1-hour minimum -> Cancel Pending Requisition
      if (!eligibility.qualifiesForAutoRequest) {
        const cancelReason =
          eligibility.overtimeMinutes <= 0
            ? DEFAULT_ATTENDANCE_CANCEL_REASON
            : `${DEFAULT_ATTENDANCE_CANCEL_REASON} (${eligibility.overtimeMinutes} mins under 60-min minimum)`;

        const cancelled: OvertimeRequest = {
          ...existingActive,
          status: 'Cancelled',
          attendanceId: attendanceRecord.id || existingActive.attendanceId,
          actualOvertimeHours: 0,
          cancellationReason: cancelReason,
          cancelledBy: actorName,
          cancelledAt: nowIso,
          rejectionReason: cancelReason,
          updatedAt: nowIso,
        };

        return {
          action: 'CANCELLED',
          eligibility,
          request: cancelled,
          previousStatus: existingActive.status,
          previousHours: existingActive.expectedHours,
          message: `Cancelled Pending Overtime Request ${existingActive.requestNumber}: ${cancelReason}.`,
          auditDetails: `Cancelled ${existingActive.requestNumber} for ${employee.name} (${attendanceDate}) after Attendance update (OUT: ${outLabel}, Shift End: ${shiftEndLabel}, OT: ${eligibility.overtimeMinutes} mins). Reason: ${cancelReason}`,
        };
      }

      // Scenario B & C: Pending Overtime Duration Increased or Reduced (>= 60 mins)
      const basic = Number(
        salaryBasicBDT ?? existingActive.basicSalaryBDT ?? employee.basicSalaryBDT ?? 25000
      );
      const effectivePolicy: Partial<EmployeeOvertimePolicy> = policy || {
        isEligible: true,
        calculationBasis: 'Basic Salary',
        standardMonthlyWorkingHours: 208,
        overtimeMultiplier: existingActive.overtimeMultiplier ?? 2.0,
        status: 'Active',
      };
      const costCalc = calculateEmployeeIndividualOvertime(
        basic,
        effectivePolicy,
        eligibility.overtimeHours
      );

      const sourcePrefix =
        sourceMode === 'QR' || existingActive.sourceType === 'QR_ATTENDANCE_AUTO'
          ? 'Auto-updated from QR Attendance'
          : 'Auto-updated from Attendance';

      const updated: OvertimeRequest = {
        ...existingActive,
        // Keep ID, requestNumber, status, approval hierarchy, and projectPurpose untouched
        expectedStartTime: eligibility.otStartTime24,
        expectedEndTime: eligibility.otEndTime24,
        expectedHours: eligibility.overtimeHours,
        actualOvertimeHours: eligibility.overtimeHours,
        attendanceId: attendanceRecord.id || existingActive.attendanceId,
        basicSalaryBDT: basic,
        hourlyRateBDT: costCalc.hourlyRate,
        overtimeMultiplier: costCalc.multiplier,
        calculatedOvertimeAmountBDT: costCalc.totalAmountBDT,
        overtimeReason:
          existingActive.sourceType === 'QR_ATTENDANCE_AUTO' ||
          existingActive.sourceType === 'ATTENDANCE_AUTO'
            ? `${sourcePrefix} (IN: ${inLabel}, Shift End: ${shiftEndLabel}, OUT: ${outLabel})`
            : existingActive.overtimeReason,
        updatedAt: nowIso,
      };

      return {
        action: 'UPDATED',
        eligibility,
        request: updated,
        previousStatus: existingActive.status,
        previousHours: existingActive.expectedHours,
        message: `Updated pending Overtime Request ${existingActive.requestNumber} to ${eligibility.overtimeHours}h (${shiftEndLabel} – ${outLabel}).`,
        auditDetails: `Updated ${existingActive.requestNumber} for ${employee.name} (${attendanceDate}) from ${existingActive.expectedHours}h to ${eligibility.overtimeHours}h (OUT: ${outLabel}, Cost: ${costCalc.totalAmountBDT}).`,
      };
    }
  }

  // 2. Cancelled requisition protection: Do not automatically reactivate or replace Cancelled requisitions
  if (existingCancelled) {
    return {
      action: 'LOCKED_CANCELLED',
      eligibility,
      request: existingCancelled,
      previousStatus: existingCancelled.status,
      previousHours: existingCancelled.expectedHours,
      message: `Overtime request ${existingCancelled.requestNumber} is Cancelled and will not be automatically reactivated.`,
      auditDetails: `Attendance updated on ${attendanceDate} (IN: ${inLabel}, OUT: ${outLabel}, Calculated OT: ${eligibility.overtimeHours}h), while ${existingCancelled.requestNumber} remains Cancelled (manual new requisition required to re-open overtime).`,
    };
  }

  // 3. No existing requisition and below 1-hour threshold -> Do not generate
  if (!eligibility.qualifiesForAutoRequest) {
    return {
      action: 'BELOW_THRESHOLD_NO_REQUEST',
      eligibility,
      message:
        eligibility.overtimeMinutes > 0
          ? `Overtime duration (${eligibility.overtimeMinutes} mins) is under the 1-hour minimum; no request generated.`
          : 'No qualifying overtime after Default Shift End Time.',
    };
  }

  // 4. Scenario A: Create new Pending Overtime Requisition for (employee, attendanceDate)
  const basic = Number(salaryBasicBDT ?? employee.basicSalaryBDT ?? 25000);
  const gross = Number(salaryGrossBDT ?? (basic > 0 ? Math.round(basic * 1.6) : 40000));
  const costCalc = calculateEmployeeIndividualOvertime(
    basic,
    policy,
    eligibility.overtimeHours
  );

  const year = Number(attendanceDate.slice(0, 4)) || new Date().getFullYear();
  const reqNumber = generateNextOvertimeRequestNumber(existingRequests, year);
  const sanitizedEmpId = String(employee.id || employee.code || 'emp').replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );
  const idPrefix = sourceMode === 'QR' ? 'otr-qr' : 'otr-att';
  const reqId = `${idPrefix}-${sanitizedEmpId}-${attendanceDate}`;

  const sourceType: OvertimeRequest['sourceType'] =
    sourceMode === 'QR' ? 'QR_ATTENDANCE_AUTO' : 'ATTENDANCE_AUTO';
  const requestedByLabel =
    sourceMode === 'QR'
      ? 'QR Attendance Automation'
      : sourceMode === 'GPS'
      ? 'GPS Attendance Automation'
      : 'Attendance Synchronization';

  const created: OvertimeRequest = {
    id: reqId,
    requestNumber: reqNumber,
    employeeId: employee.id,
    employeeCode: employee.code || 'EMP-000',
    employeeName: employee.name || 'Staff Member',
    department: employee.department || 'Operations',
    designation: employee.designation || 'Staff',
    employeeCategory: employee.employeeCategory || 'Factory Employee',
    overtimeDate: attendanceDate,
    purposeCategory: 'General Operations',
    projectPurpose: '', // Must remain blank initially so authorized approver selects purpose
    sourceType,
    expectedStartTime: eligibility.otStartTime24,
    expectedEndTime: eligibility.otEndTime24,
    expectedHours: eligibility.overtimeHours,
    actualOvertimeHours: eligibility.overtimeHours,
    overtimeReason: `Auto-generated from ${
      sourceMode === 'QR' ? 'QR' : sourceMode === 'GPS' ? 'GPS' : 'Manual'
    } Attendance (IN: ${inLabel}, Shift End: ${shiftEndLabel}, OUT: ${outLabel})`,
    requestedBy: requestedByLabel,
    requestedAt: nowIso,
    status: 'Pending Supervisor',
    attendanceId: attendanceRecord.id,
    basicSalaryBDT: basic,
    grossSalaryBDT: gross,
    hourlyRateBDT: costCalc.hourlyRate,
    overtimeMultiplier: costCalc.multiplier,
    calculatedOvertimeAmountBDT: costCalc.totalAmountBDT,
    batchAllocations: [],
    isPayrollProcessed: false,
    isCostingAllocated: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    action: 'CREATED',
    eligibility,
    request: created,
    message: `Auto-generated Overtime Request ${reqNumber} (${eligibility.overtimeHours}h OT on ${attendanceDate} from ${shiftEndLabel} to ${outLabel}).`,
    auditDetails: `Auto-generated ${reqNumber} for ${employee.name} (${attendanceDate}): ${eligibility.overtimeHours}h OT (${shiftEndLabel} – ${outLabel}) via ${sourceMode} Attendance.`,
  };
}

/**
 * Backward-compatible wrapper used by QR Attendance flow.
 */
export function reconcileQrOvertimeRequest(
  params: Omit<ReconcileAttendanceOvertimeParams, 'sourceMode'>
): QrOvertimeSyncResult {
  return reconcileAttendanceOvertimeRequest({
    ...params,
    sourceMode: 'QR',
  });
}
