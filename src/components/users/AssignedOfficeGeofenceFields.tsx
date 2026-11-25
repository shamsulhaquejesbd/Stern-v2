import React, { useState } from 'react';
import { Crosshair, Navigation } from 'lucide-react';
import type { OfficeLocation } from '../../types/payroll.ts';
import { DEFAULT_ALLOWED_RADIUS_METERS, isValidCoordinatePair } from '../../lib/geofence.ts';

export interface UserGeofenceFormState {
  assignedOfficeId: string;
  assignedOfficeName: string;
  officeLatitude: string;
  officeLongitude: string;
  allowedRadiusMeters: number | '';
  officeAddress: string;
  locationStatus: 'Active' | 'Inactive' | '';
  shiftStartTime: string;
  shiftEndTime: string;
  gracePeriodMinutes: number | '';
}

export const EMPTY_USER_GEOFENCE_FORM: UserGeofenceFormState = {
  assignedOfficeId: '',
  assignedOfficeName: '',
  officeLatitude: '',
  officeLongitude: '',
  allowedRadiusMeters: '',
  officeAddress: '',
  locationStatus: '',
  shiftStartTime: '',
  shiftEndTime: '',
  gracePeriodMinutes: '',
};

export function userToGeofenceFormState(
  user?: {
    assignedOfficeId?: string;
    assignedOfficeName?: string;
    officeLatitude?: number;
    officeLongitude?: number;
    allowedRadiusMeters?: number;
    officeAddress?: string;
    locationStatus?: 'Active' | 'Inactive';
    shiftStartTime?: string;
    shiftEndTime?: string;
    gracePeriodMinutes?: number;
  } | null,
  officeLocations: OfficeLocation[] = []
): UserGeofenceFormState {
  if (!user) return { ...EMPTY_USER_GEOFENCE_FORM };
  const matchedOffice =
    user.assignedOfficeId && user.assignedOfficeId !== 'custom'
      ? officeLocations.find((o) => o.id === user.assignedOfficeId)
      : undefined;

  return {
    assignedOfficeId: user.assignedOfficeId || '',
    assignedOfficeName: user.assignedOfficeName || matchedOffice?.name || '',
    officeLatitude:
      user.officeLatitude !== undefined && user.officeLatitude !== null
        ? String(user.officeLatitude)
        : matchedOffice
        ? String(matchedOffice.latitude)
        : '',
    officeLongitude:
      user.officeLongitude !== undefined && user.officeLongitude !== null
        ? String(user.officeLongitude)
        : matchedOffice
        ? String(matchedOffice.longitude)
        : '',
    allowedRadiusMeters:
      user.allowedRadiusMeters !== undefined && user.allowedRadiusMeters !== null
        ? Number(user.allowedRadiusMeters)
        : matchedOffice?.allowedRadiusMeters ?? '',
    officeAddress: user.officeAddress || matchedOffice?.address || '',
    locationStatus: (user.locationStatus as 'Active' | 'Inactive') || matchedOffice?.status || '',
    shiftStartTime: user.shiftStartTime || '',
    shiftEndTime: user.shiftEndTime || '',
    gracePeriodMinutes:
      user.gracePeriodMinutes !== undefined && user.gracePeriodMinutes !== null
        ? Number(user.gracePeriodMinutes)
        : '',
  };
}

export function geofenceFormStateToUserFields(form: UserGeofenceFormState) {
  const latNum = form.officeLatitude.trim() !== '' ? Number(form.officeLatitude) : undefined;
  const lngNum = form.officeLongitude.trim() !== '' ? Number(form.officeLongitude) : undefined;
  const radiusNum =
    form.allowedRadiusMeters !== '' && Number(form.allowedRadiusMeters) > 0
      ? Number(form.allowedRadiusMeters)
      : undefined;
  const graceNum =
    form.gracePeriodMinutes !== '' && Number(form.gracePeriodMinutes) >= 0
      ? Number(form.gracePeriodMinutes)
      : undefined;

  return {
    assignedOfficeId: form.assignedOfficeId.trim() || undefined,
    assignedOfficeName: form.assignedOfficeName.trim() || undefined,
    officeLatitude: latNum !== undefined && Number.isFinite(latNum) ? latNum : undefined,
    officeLongitude: lngNum !== undefined && Number.isFinite(lngNum) ? lngNum : undefined,
    allowedRadiusMeters: radiusNum,
    officeAddress: form.officeAddress.trim() || undefined,
    locationStatus: (form.locationStatus || undefined) as 'Active' | 'Inactive' | undefined,
    shiftStartTime: form.shiftStartTime.trim() || undefined,
    shiftEndTime: form.shiftEndTime.trim() || undefined,
    gracePeriodMinutes: graceNum,
  };
}

export function validateUserGeofenceForm(form: UserGeofenceFormState): string | null {
  const hasAnyGpsInput = Boolean(
    form.assignedOfficeId.trim() ||
      form.assignedOfficeName.trim() ||
      form.officeLatitude.trim() ||
      form.officeLongitude.trim() ||
      form.allowedRadiusMeters !== '' ||
      form.locationStatus
  );

  if (!hasAnyGpsInput) {
    return null;
  }

  if (form.officeLatitude.trim() !== '' || form.officeLongitude.trim() !== '') {
    const lat = Number(form.officeLatitude);
    const lng = Number(form.officeLongitude);
    if (!isValidCoordinatePair(lat, lng)) {
      return 'Please enter valid Office Latitude (-90 to 90) and Office Longitude (-180 to 180) coordinates.';
    }
  }

  if (form.assignedOfficeId && !form.assignedOfficeName.trim()) {
    return 'Please enter an Assigned Office Display Name.';
  }

  if (form.allowedRadiusMeters !== '') {
    const rad = Number(form.allowedRadiusMeters);
    if (!Number.isFinite(rad) || rad < 10 || rad > 5000) {
      return 'Allowed Attendance Radius must be between 10 and 5000 meters.';
    }
  }

  if (form.gracePeriodMinutes !== '') {
    const grace = Number(form.gracePeriodMinutes);
    if (!Number.isFinite(grace) || grace < 0 || grace > 120) {
      return 'Late Grace Period must be between 0 and 120 minutes.';
    }
  }

  return null;
}

interface AssignedOfficeGeofenceFieldsProps {
  value: UserGeofenceFormState;
  onChange: (next: UserGeofenceFormState) => void;
  officeLocations: OfficeLocation[];
  userLabel?: string;
  validationError?: string | null;
}

export const AssignedOfficeGeofenceFields: React.FC<AssignedOfficeGeofenceFieldsProps> = ({
  value,
  onChange,
  officeLocations,
  userLabel,
  validationError,
}) => {
  const [gpsCaptureStatus, setGpsCaptureStatus] = useState<string>('');

  return (
    <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 dark:border-emerald-900/40 pb-3">
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>6. Assigned Office GPS Location &amp; Shift Geofence</span>
          </h3>
          {userLabel && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              User: <strong className="text-slate-800 dark:text-slate-200">{userLabel}</strong> — Attendance is validated against these coordinates.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!navigator.geolocation) {
              setGpsCaptureStatus('Browser Geolocation is not supported on this device.');
              return;
            }
            setGpsCaptureStatus('Detecting current GPS coordinates...');
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                onChange({
                  ...value,
                  assignedOfficeId: value.assignedOfficeId || 'custom',
                  officeLatitude: pos.coords.latitude.toFixed(6),
                  officeLongitude: pos.coords.longitude.toFixed(6),
                });
                setGpsCaptureStatus(
                  `Captured current coordinates (±${Math.round(pos.coords.accuracy)}m accuracy).`
                );
              },
              (err) => setGpsCaptureStatus(`GPS capture failed: ${err.message}`),
              { enableHighAccuracy: true, timeout: 10000 }
            );
          }}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 self-start cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Use My Current GPS</span>
        </button>
      </div>

      {gpsCaptureStatus && (
        <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-3 py-1.5 rounded-lg">
          {gpsCaptureStatus}
        </div>
      )}

      {validationError && (
        <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3 py-1.5 rounded-lg">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Assigned Office / Headquarters *
          </label>
          <select
            value={value.assignedOfficeId}
            onChange={(e) => {
              const val = e.target.value;
              const matched = officeLocations.find((o) => o.id === val);
              if (matched) {
                onChange({
                  ...value,
                  assignedOfficeId: val,
                  assignedOfficeName: matched.name,
                  officeLatitude: String(matched.latitude),
                  officeLongitude: String(matched.longitude),
                  allowedRadiusMeters:
                    matched.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_METERS,
                  officeAddress: matched.address || '',
                  locationStatus: matched.status || 'Active',
                });
              } else if (val === '') {
                onChange({
                  ...value,
                  assignedOfficeId: '',
                  assignedOfficeName: '',
                  officeLatitude: '',
                  officeLongitude: '',
                  allowedRadiusMeters: '',
                  officeAddress: '',
                  locationStatus: '',
                });
              } else {
                onChange({ ...value, assignedOfficeId: val });
              }
            }}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
          >
            <option value="">-- Select Assigned Office / HQ --</option>
            {officeLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.allowedRadiusMeters}m){' '}
                {loc.status === 'Inactive' ? '[Inactive]' : ''}
              </option>
            ))}
            <option value="custom">-- Custom Office Coordinates --</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Assigned Office Display Name *
          </label>
          <input
            type="text"
            value={value.assignedOfficeName}
            onChange={(e) => onChange({ ...value, assignedOfficeName: e.target.value })}
            placeholder="e.g. Head Office (Gulshan HQ)"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Location Status *
          </label>
          <select
            value={value.locationStatus}
            onChange={(e) =>
              onChange({
                ...value,
                locationStatus: e.target.value as 'Active' | 'Inactive' | '',
              })
            }
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
          >
            <option value="">-- Select Location Status --</option>
            <option value="Active">Active (Geofence Enforced)</option>
            <option value="Inactive">Inactive (Blocked)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Office Latitude *
          </label>
          <input
            type="number"
            step="any"
            value={value.officeLatitude}
            onChange={(e) => onChange({ ...value, officeLatitude: e.target.value })}
            placeholder="23.8103"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Office Longitude *
          </label>
          <input
            type="number"
            step="any"
            value={value.officeLongitude}
            onChange={(e) => onChange({ ...value, officeLongitude: e.target.value })}
            placeholder="90.4125"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Allowed Attendance Radius (Meters) *
          </label>
          <input
            type="number"
            min={10}
            max={5000}
            value={value.allowedRadiusMeters}
            onChange={(e) =>
              onChange({
                ...value,
                allowedRadiusMeters: e.target.value === '' ? '' : Number(e.target.value),
              })
            }
            placeholder="200"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold tabular-nums"
          />
          <span className="text-[10px] text-slate-400">Default: 200 Meters</span>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Office Address
          </label>
          <input
            type="text"
            value={value.officeAddress}
            onChange={(e) => onChange({ ...value, officeAddress: e.target.value })}
            placeholder="Full office address for attendance audit logs"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Shift Start Time
          </label>
          <input
            type="time"
            value={value.shiftStartTime}
            onChange={(e) => onChange({ ...value, shiftStartTime: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Shift End Time
          </label>
          <input
            type="time"
            value={value.shiftEndTime}
            onChange={(e) => onChange({ ...value, shiftEndTime: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Late Grace Period (Minutes)
          </label>
          <input
            type="number"
            min={0}
            max={120}
            value={value.gracePeriodMinutes}
            onChange={(e) =>
              onChange({
                ...value,
                gracePeriodMinutes:
                  e.target.value === '' ? '' : Math.max(0, Number(e.target.value)),
              })
            }
            placeholder="15"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
          />
        </div>
      </div>
    </div>
  );
};
