/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Daily Wages Bill of Factory Shift & Overtime Calculation
 * Scoped strictly to the Daily Wages Bill of Factory report.
 */

import { calculateNetWorkingHours, parseTimeToMinutes } from './geofence.ts';

export interface DailyWagesShiftBreakdown {
  regularMinutes: number;
  overtimeMinutes: number;
  totalMinutes: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  lunchDeductedMinutes: number;
}

const LUNCH_THRESHOLD_MINUTES = 300; // 5 hours
const LUNCH_DEDUCTION_MINUTES = 60;  // 1 hour

function parseShiftTimeMinutes(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalizedAmPm = raw
    .trim()
    .replace(/\b([ap])\.?\s*m\.?(?=\s|$)/gi, '$1M');
  return parseTimeToMinutes(normalizedAmPm);
}

/**
 * Calculates Regular Working Hours (capped at Settings Default Shift End Time, minus 1h lunch >= 5h),
 * Overtime (working time strictly after Default Shift End Time, never negative),
 * and Total Working Hours (Regular + Overtime) for the Daily Wages Bill of Factory report.
 */
export function calculateDailyWagesShiftBreakdown(params: {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  defaultShiftEndTime?: string | null;
  defaultShiftStartTime?: string | null;
}): DailyWagesShiftBreakdown {
  const startMins = parseShiftTimeMinutes(params.checkInTime);
  const endMinsRaw = parseShiftTimeMinutes(params.checkOutTime);

  if (startMins === null || endMinsRaw === null) {
    return {
      regularMinutes: 0,
      overtimeMinutes: 0,
      totalMinutes: 0,
      regularHours: 0,
      overtimeHours: 0,
      totalHours: 0,
      lunchDeductedMinutes: 0,
    };
  }

  // Handle overnight checkout (e.g. 08:30 AM -> 01:00 AM next day)
  const endMins = endMinsRaw >= startMins ? endMinsRaw : endMinsRaw + 1440;

  const shiftEndMinsRaw = parseShiftTimeMinutes(params.defaultShiftEndTime);
  if (shiftEndMinsRaw === null) {
    // Fallback only if no Default Shift End Time exists in Settings
    const netHours = calculateNetWorkingHours(params.checkInTime, params.checkOutTime);
    const totalMinutes = Math.round(netHours * 60);
    return {
      regularMinutes: totalMinutes,
      overtimeMinutes: 0,
      totalMinutes,
      regularHours: netHours,
      overtimeHours: 0,
      totalHours: netHours,
      lunchDeductedMinutes: (endMins - startMins) >= LUNCH_THRESHOLD_MINUTES ? LUNCH_DEDUCTION_MINUTES : 0,
    };
  }

  const shiftStartMinsRaw = parseShiftTimeMinutes(params.defaultShiftStartTime);
  const isOvernightConfiguredShift =
    shiftStartMinsRaw !== null && shiftEndMinsRaw < shiftStartMinsRaw;

  let regularGrossMins = 0;
  let overtimeMins = 0;

  if (isOvernightConfiguredShift) {
    // Overnight shift window configured in Settings (e.g. 22:00 -> 06:00)
    const effectiveShiftEnd = shiftEndMinsRaw + 1440;
    const adjStart = startMins < shiftEndMinsRaw ? startMins + 1440 : startMins;
    const adjEnd = endMins < adjStart ? endMins + 1440 : endMins;
    const regularEnd = Math.min(adjEnd, effectiveShiftEnd);
    regularGrossMins = Math.max(0, regularEnd - adjStart);
    overtimeMins = Math.max(0, adjEnd - effectiveShiftEnd);
  } else if (startMins >= shiftEndMinsRaw) {
    // Employee clocked in at or after the configured Default Shift End Time:
    // entire worked duration is Overtime (0 regular hours)
    regularGrossMins = 0;
    overtimeMins = Math.max(0, endMins - startMins);
  } else {
    // Standard daytime shift: Regular hours end at min(actualEnd, shiftEnd),
    // any time beyond shiftEnd is Overtime (clamped >= 0 so early leave never creates negative OT)
    const regularEnd = Math.min(endMins, shiftEndMinsRaw);
    regularGrossMins = Math.max(0, regularEnd - startMins);
    overtimeMins = Math.max(0, endMins - shiftEndMinsRaw);
  }

  const lunchDeductedMinutes =
    regularGrossMins >= LUNCH_THRESHOLD_MINUTES ? LUNCH_DEDUCTION_MINUTES : 0;
  const regularMinutes = Math.max(0, regularGrossMins - lunchDeductedMinutes);
  const totalMinutes = regularMinutes + overtimeMins;

  const regularHours = Math.round((regularMinutes / 60) * 100) / 100;
  const overtimeHours = Math.round((overtimeMins / 60) * 100) / 100;
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

  return {
    regularMinutes,
    overtimeMinutes: overtimeMins,
    totalMinutes,
    regularHours,
    overtimeHours,
    totalHours,
    lunchDeductedMinutes,
  };
}
