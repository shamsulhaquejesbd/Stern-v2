/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Geospatial Geofencing & Shift Attendance Utility
 * Shared between Express backend (server.ts) and React frontend.
 */

import type { AttendanceStatus, OfficeLocation } from '../types/payroll.ts';

export const DEFAULT_ALLOWED_RADIUS_METERS = 200;
export const DEFAULT_MAX_GPS_ACCURACY_METERS = 100;
export const DEFAULT_SHIFT_START_TIME = '09:00';
export const DEFAULT_SHIFT_END_TIME = '18:00';
export const DEFAULT_GRACE_PERIOD_MINUTES = 15;

export const DEFAULT_OFFICE_LOCATIONS: OfficeLocation[] = [
  {
    id: 'office-hq',
    code: 'OFF-HQ-01',
    name: 'Head Office (Gulshan HQ)',
    address: 'House 14, Road 11, Gulshan-1, Dhaka-1212',
    latitude: 23.7808,
    longitude: 90.4167,
    allowedRadiusMeters: 200,
    status: 'Active',
  },
  {
    id: 'office-mirpur',
    code: 'OFF-MIR-02',
    name: 'Dhaka North Hub (Mirpur DOHS)',
    address: 'House 9, Avenue 3, Mirpur DOHS, Dhaka-1216',
    latitude: 23.8347,
    longitude: 90.3658,
    allowedRadiusMeters: 200,
    status: 'Active',
  },
  {
    id: 'office-kushtia',
    code: 'OFF-KUS-03',
    name: 'Kushtia Battery Manufacturing Plant',
    address: 'Plot 28, BSCIC Industrial Area, Kushtia',
    latitude: 23.8717,
    longitude: 89.0904,
    allowedRadiusMeters: 200,
    status: 'Active',
  },
  {
    id: 'office-ctg',
    code: 'OFF-CTG-04',
    name: 'Chattogram Regional Hub',
    address: 'Agrabad Commercial Area, Chattogram',
    latitude: 22.3248,
    longitude: 91.8149,
    allowedRadiusMeters: 200,
    status: 'Active',
  },
];

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Haversine formula: computes great-circle distance in meters between two WGS84 coordinates.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // Reject Null Island (0, 0) as uninitialized / spoofed coordinate
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

export interface GeofenceValidationInput {
  employeeLatitude: number;
  employeeLongitude: number;
  gpsAccuracyMeters?: number;
  officeLatitude: number;
  officeLongitude: number;
  allowedRadiusMeters?: number;
  locationStatus?: 'Active' | 'Inactive' | string;
  maxGpsAccuracyMeters?: number;
  previousCheckPoint?: {
    latitude: number;
    longitude: number;
    timestampMs: number;
  };
  currentTimestampMs?: number;
}

export interface GeofenceValidationResult {
  accepted: boolean;
  gpsValidationStatus: 'Accepted' | 'Rejected';
  distanceMeters: number;
  allowedRadiusMeters: number;
  gpsAccuracyMeters?: number;
  reason: string;
  errorCode?:
    | 'LOCATION_INACTIVE'
    | 'INVALID_OFFICE_COORDS'
    | 'INVALID_EMPLOYEE_COORDS'
    | 'POOR_GPS_ACCURACY'
    | 'SUSPICIOUS_GPS'
    | 'OUTSIDE_GEOFENCE';
}

export function formatOutsideGeofenceMessage(allowedRadiusMeters: number): string {
  const roundedRadius = Math.round(allowedRadiusMeters);
  return `You are outside the permitted attendance area. You must be within ${roundedRadius} meters of your assigned office to mark attendance.`;
}

export function evaluateGeofenceAttendance(
  input: GeofenceValidationInput
): GeofenceValidationResult {
  const allowedRadius =
    typeof input.allowedRadiusMeters === 'number' && input.allowedRadiusMeters > 0
      ? input.allowedRadiusMeters
      : DEFAULT_ALLOWED_RADIUS_METERS;
  const maxAccuracy =
    typeof input.maxGpsAccuracyMeters === 'number' && input.maxGpsAccuracyMeters > 0
      ? input.maxGpsAccuracyMeters
      : DEFAULT_MAX_GPS_ACCURACY_METERS;

  if (input.locationStatus && input.locationStatus === 'Inactive') {
    return {
      accepted: false,
      gpsValidationStatus: 'Rejected',
      distanceMeters: 0,
      allowedRadiusMeters: allowedRadius,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      errorCode: 'LOCATION_INACTIVE',
      reason: 'Your assigned office location is currently marked Inactive. Contact HR or Admin.',
    };
  }

  if (!isValidCoordinatePair(input.officeLatitude, input.officeLongitude)) {
    return {
      accepted: false,
      gpsValidationStatus: 'Rejected',
      distanceMeters: 0,
      allowedRadiusMeters: allowedRadius,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      errorCode: 'INVALID_OFFICE_COORDS',
      reason: 'Assigned office GPS coordinates are not configured. Contact Admin to configure office latitude and longitude.',
    };
  }

  if (!isValidCoordinatePair(input.employeeLatitude, input.employeeLongitude)) {
    return {
      accepted: false,
      gpsValidationStatus: 'Rejected',
      distanceMeters: 0,
      allowedRadiusMeters: allowedRadius,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      errorCode: 'INVALID_EMPLOYEE_COORDS',
      reason: 'Unable to capture valid GPS coordinates. Please enable high-accuracy GPS and retry.',
    };
  }

  // Basic anti-spoofing: reject impossible negative accuracy or unnaturally large reported error
  if (typeof input.gpsAccuracyMeters === 'number') {
    if (!Number.isFinite(input.gpsAccuracyMeters) || input.gpsAccuracyMeters < 0) {
      return {
        accepted: false,
        gpsValidationStatus: 'Rejected',
        distanceMeters: 0,
        allowedRadiusMeters: allowedRadius,
        gpsAccuracyMeters: input.gpsAccuracyMeters,
        errorCode: 'SUSPICIOUS_GPS',
        reason: 'Suspicious GPS telemetry detected (invalid accuracy). Please disable mock location apps and retry.',
      };
    }
    if (input.gpsAccuracyMeters > maxAccuracy) {
      return {
        accepted: false,
        gpsValidationStatus: 'Rejected',
        distanceMeters: calculateHaversineDistanceMeters(
          input.employeeLatitude,
          input.employeeLongitude,
          input.officeLatitude,
          input.officeLongitude
        ),
        allowedRadiusMeters: allowedRadius,
        gpsAccuracyMeters: input.gpsAccuracyMeters,
        errorCode: 'POOR_GPS_ACCURACY',
        reason: `GPS signal accuracy is too weak (±${Math.round(input.gpsAccuracyMeters)}m, required ≤${maxAccuracy}m). Move to an open area or enable High Accuracy GPS and retry.`,
      };
    }
  }

  // Anti-spoofing: check impossible travel velocity from recent GPS ping (> 300 km/h)
  if (input.previousCheckPoint && isValidCoordinatePair(input.previousCheckPoint.latitude, input.previousCheckPoint.longitude)) {
    const nowMs = input.currentTimestampMs ?? Date.now();
    const elapsedSeconds = (nowMs - input.previousCheckPoint.timestampMs) / 1000;
    if (elapsedSeconds > 1 && elapsedSeconds < 1800) {
      const jumpMeters = calculateHaversineDistanceMeters(
        input.previousCheckPoint.latitude,
        input.previousCheckPoint.longitude,
        input.employeeLatitude,
        input.employeeLongitude
      );
      const speedKmh = (jumpMeters / 1000) / (elapsedSeconds / 3600);
      if (jumpMeters > 2000 && speedKmh > 300) {
        return {
          accepted: false,
          gpsValidationStatus: 'Rejected',
          distanceMeters: calculateHaversineDistanceMeters(
            input.employeeLatitude,
            input.employeeLongitude,
            input.officeLatitude,
            input.officeLongitude
          ),
          allowedRadiusMeters: allowedRadius,
          gpsAccuracyMeters: input.gpsAccuracyMeters,
          errorCode: 'SUSPICIOUS_GPS',
          reason: 'Suspicious GPS jump detected between consecutive readings. Please turn off any GPS spoofing tools and retry.',
        };
      }
    }
  }

  const distanceMeters = calculateHaversineDistanceMeters(
    input.employeeLatitude,
    input.employeeLongitude,
    input.officeLatitude,
    input.officeLongitude
  );

  if (distanceMeters > allowedRadius) {
    return {
      accepted: false,
      gpsValidationStatus: 'Rejected',
      distanceMeters,
      allowedRadiusMeters: allowedRadius,
      gpsAccuracyMeters: input.gpsAccuracyMeters,
      errorCode: 'OUTSIDE_GEOFENCE',
      reason: formatOutsideGeofenceMessage(allowedRadius),
    };
  }

  return {
    accepted: true,
    gpsValidationStatus: 'Accepted',
    distanceMeters,
    allowedRadiusMeters: allowedRadius,
    gpsAccuracyMeters: input.gpsAccuracyMeters,
    reason: `GPS verified within ${Math.round(distanceMeters)}m of assigned office (limit: ${Math.round(allowedRadius)}m).`,
  };
}

/**
 * Parses "HH:mm" or "HH:mm AM/PM" into minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim().toUpperCase();
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const period = ampmMatch[3];
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const h = Number(match24[1]);
    const m = Number(match24[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return h * 60 + m;
    }
  }
  return null;
}

export function formatMinutesAsHHmm(totalMinutes: number): string {
  const clamped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats a time string ("HH:mm", "HH:mm:ss", or "hh:mm AM/PM") into 12-hour AM/PM format (e.g. "06:30 PM").
 * Returns empty string if input is empty or invalid.
 */
export function formatTime12Hour(timeStr?: string | null): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === '—' || trimmed === '--:--') return '';
  const mins = parseTimeToMinutes(trimmed);
  if (mins === null) return trimmed;
  const clamped = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Converts a time string ("HH:mm", "HH:mm:ss", or "hh:mm AM/PM") to canonical 24-hour "HH:mm".
 */
export function toTime24Hour(timeStr?: string | null): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return '';
  return formatMinutesAsHHmm(mins);
}

export function formatLateDuration(lateMinutes: number): string {
  if (!lateMinutes || lateMinutes <= 0) return 'On Time';
  const hrs = Math.floor(lateMinutes / 60);
  const mins = lateMinutes % 60;
  if (hrs > 0) return `${hrs}h ${mins}m late`;
  return `${mins} min late`;
}

export interface ShiftCalculationResult {
  status: AttendanceStatus;
  isLate: boolean;
  lateDurationMinutes: number;
  totalWorkingHours: number;
  overtimeHours: number;
}

export function calculateNetWorkingHours(
  checkInTime?: string | null,
  checkOutTime?: string | null
): number {
  const checkInMins = parseTimeToMinutes(checkInTime || undefined);
  const checkOutMins = parseTimeToMinutes(checkOutTime || undefined);
  if (checkInMins === null || checkOutMins === null) return 0;
  const diffMins =
    checkOutMins >= checkInMins
      ? checkOutMins - checkInMins
      : checkOutMins + 1440 - checkInMins;
  const lunchDeductMins = diffMins >= 300 ? 60 : 0;
  const netMins = Math.max(0, diffMins - lunchDeductMins);
  return Math.round((netMins / 60) * 100) / 100;
}

export function calculateShiftAttendanceStatus(params: {
  checkInTime: string;
  checkOutTime?: string;
  shiftStartTime?: string;
  gracePeriodMinutes?: number;
  standardDailyHours?: number;
}): ShiftCalculationResult {
  const shiftStartMins = parseTimeToMinutes(params.shiftStartTime || DEFAULT_SHIFT_START_TIME) ?? 9 * 60;
  const graceMins =
    typeof params.gracePeriodMinutes === 'number' && params.gracePeriodMinutes >= 0
      ? params.gracePeriodMinutes
      : DEFAULT_GRACE_PERIOD_MINUTES;
  const standardHours =
    typeof params.standardDailyHours === 'number' && params.standardDailyHours > 0
      ? params.standardDailyHours
      : 8;

  const checkInMins = parseTimeToMinutes(params.checkInTime);
  const checkOutMins = parseTimeToMinutes(params.checkOutTime);

  let lateDurationMinutes = 0;
  let isLate = false;
  if (checkInMins !== null && checkInMins > shiftStartMins + graceMins) {
    isLate = true;
    lateDurationMinutes = checkInMins - shiftStartMins;
  }

  let totalWorkingHours = 0;
  let overtimeHours = 0;
  if (checkInMins !== null && checkOutMins !== null) {
    totalWorkingHours = calculateNetWorkingHours(params.checkInTime, params.checkOutTime);
    if (totalWorkingHours > standardHours) {
      overtimeHours = Math.round((totalWorkingHours - standardHours) * 100) / 100;
    }
  }

  let status: AttendanceStatus = isLate ? 'Late' : 'Present';
  // Half-Day rule: if checked out and total worked hours is strictly under half of standard hours (e.g. < 4 hrs)
  if (checkOutMins !== null && totalWorkingHours > 0 && totalWorkingHours < standardHours / 2) {
    status = 'Half Day';
  }

  return {
    status,
    isLate,
    lateDurationMinutes,
    totalWorkingHours,
    overtimeHours,
  };
}
