/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Explicit 12-Hour (AM / PM) Time Selector Component
 * Displays and edits time strictly in 12-hour format (HH:MM AM/PM) regardless of OS locale,
 * while emitting canonical 24-hour "HH:mm" strings for database compatibility.
 */

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { parseTimeToMinutes } from '../../lib/geofence.ts';

interface Time12HourInputProps {
  value: string;
  onChange: (nextHHmm24: string) => void;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export const Time12HourInput: React.FC<Time12HourInputProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  allowClear = false,
  compact = false,
  ariaLabel,
  className = '',
}) => {
  const parsed = useMemo(() => {
    const mins = parseTimeToMinutes(value);
    if (mins === null) {
      return { hour12: '', minute: '', period: 'AM' as 'AM' | 'PM', hasValue: false };
    }
    const clamped = ((mins % 1440) + 1440) % 1440;
    const h24 = Math.floor(clamped / 60);
    const m = clamped % 60;
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return {
      hour12: String(h12).padStart(2, '0'),
      minute: String(m).padStart(2, '0'),
      period,
      hasValue: true,
    };
  }, [value]);

  const emitTime = (nextHour12: string, nextMinute: string, nextPeriod: 'AM' | 'PM') => {
    if (!nextHour12 && !nextMinute) {
      onChange('');
      return;
    }
    const hNum = Math.min(12, Math.max(1, Number(nextHour12) || 9));
    const mNum = Math.min(59, Math.max(0, Number(nextMinute) || 0));
    let h24 = hNum % 12;
    if (nextPeriod === 'PM') h24 += 12;
    onChange(`${String(h24).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`);
  };

  const selectBaseClass = compact
    ? 'bg-transparent text-[11px] font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer disabled:cursor-not-allowed'
    : 'bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer disabled:cursor-not-allowed';

  return (
    <div
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${
        compact ? 'px-1.5 py-1 gap-0.5' : 'px-2.5 py-1.5 gap-1 w-full justify-between'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="inline-flex items-center gap-0.5">
        <select
          aria-label={ariaLabel ? `${ariaLabel} Hour` : 'Hour'}
          disabled={disabled}
          required={required}
          value={parsed.hour12}
          onChange={(e) => {
            const h = e.target.value;
            if (!h) {
              onChange('');
              return;
            }
            emitTime(h, parsed.minute || '00', parsed.period);
          }}
          className={selectBaseClass}
        >
          {!required && <option value="">--</option>}
          {HOURS_12.map((h) => (
            <option key={h} value={h} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
              {h}
            </option>
          ))}
        </select>
        <span className="text-slate-400 font-mono font-bold text-[11px]">:</span>
        <select
          aria-label={ariaLabel ? `${ariaLabel} Minute` : 'Minute'}
          disabled={disabled}
          required={required}
          value={parsed.minute}
          onChange={(e) => {
            const m = e.target.value;
            if (!m) {
              onChange('');
              return;
            }
            emitTime(parsed.hour12 || '09', m, parsed.period);
          }}
          className={selectBaseClass}
        >
          {!required && <option value="">--</option>}
          {MINUTES_60.map((m) => (
            <option key={m} value={m} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="inline-flex items-center gap-0.5">
        <select
          aria-label={ariaLabel ? `${ariaLabel} AM/PM` : 'AM/PM'}
          disabled={disabled}
          value={parsed.period}
          onChange={(e) => {
            const nextPeriod = (e.target.value === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM';
            if (!parsed.hasValue) {
              emitTime(nextPeriod === 'PM' ? '05' : '09', '00', nextPeriod);
            } else {
              emitTime(parsed.hour12, parsed.minute, nextPeriod);
            }
          }}
          className={`${
            compact ? 'text-[10px]' : 'text-[11px]'
          } font-mono font-bold rounded px-1 py-0.5 cursor-pointer focus:outline-none ${
            parsed.period === 'PM'
              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
          }`}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>

        {allowClear && parsed.hasValue && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear time"
            className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
