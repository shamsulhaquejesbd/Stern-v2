/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Financial Year, Period Locking, Year-End Closing & Accounting Controls Tab
 */

import React, { useState } from 'react';
import {
  CalendarClock,
  Lock,
  Unlock,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Archive,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import { formatBDT } from '../../utils/accountingEngine.ts';

export const FinancialYearTab: React.FC = () => {
  const {
    financialYears,
    accountingSettings,
    accountingAuditLogs,
    createFinancialYear,
    setActiveFinancialYear,
    updatePeriodStatus,
    performYearEndClosing,
    updateAccountingSettings,
  } = useCashBank();

  const [showNewFY, setShowNewFY] = useState(false);
  const [fyName, setFyName] = useState(`FY ${new Date().getFullYear() + 1}`);
  const [fyStart, setFyStart] = useState(`${new Date().getFullYear() + 1}-01-01`);
  const [fyEnd, setFyEnd] = useState(`${new Date().getFullYear() + 1}-12-31`);
  const [fySetActive, setFySetActive] = useState(false);

  const [closingTargetId, setClosingTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const notify = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5500);
  };

  const handleCreateFY = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createFinancialYear({
      name: fyName,
      startDate: fyStart,
      endDate: fyEnd,
      setActive: fySetActive,
    });
    if (res.success) {
      setShowNewFY(false);
      notify('success', res.message);
    } else {
      notify('error', res.message);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Accounting Policy Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarClock className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              <span>Financial Year Management & Period Locking</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Control open/closed fiscal periods, execute Year-End Closing transfers to Retained Earnings, and configure accounting guardrails.
            </p>
          </div>
          <button
            onClick={() => setShowNewFY(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Financial Year</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 text-xs">
          {[
            {
              key: 'enforcePeriodLocking' as const,
              label: 'Enforce Closed Period Lock',
              desc: 'Block voucher posting in Closed/Locked dates',
            },
            {
              key: 'autoSyncERPEvents' as const,
              label: 'Auto-Sync ERP Modules to GL',
              desc: 'Sync Sales, GRN, Production & Payroll automatically',
            },
            {
              key: 'requireVoucherApproval' as const,
              label: 'Require Voucher Approval',
              desc: 'Manual journals save as Draft before GL post',
            },
            {
              key: 'allowNegativeCashBank' as const,
              label: 'Allow Overdraft / Negative Cash',
              desc: 'Permit Cash/Bank balance below zero',
            },
          ].map((ctl) => (
            <label
              key={ctl.key}
              className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={Boolean(accountingSettings[ctl.key])}
                onChange={(e) => updateAccountingSettings({ [ctl.key]: e.target.checked })}
                className="mt-0.5 rounded border-slate-300"
              />
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">{ctl.label}</div>
                <div className="text-[11px] text-slate-500">{ctl.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Fiscal Years & Monthly Periods */}
      {financialYears.map((fy) => (
        <div
          key={fy.id}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{fy.name}</span>
              <span className="font-mono text-slate-500">
                {fy.startDate} → {fy.endDate}
              </span>
              {fy.isActive && (
                <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                  ACTIVE FY
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  fy.status === 'Open'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {fy.status}
              </span>
              {fy.retainedEarningsTransferredBDT !== undefined && fy.status === 'Closed' && (
                <span className="text-[11px] font-mono text-slate-500">
                  Retained Earnings Transfer: {formatBDT(fy.retainedEarningsTransferredBDT)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!fy.isActive && fy.status === 'Open' && (
                <button
                  onClick={() => {
                    const r = setActiveFinancialYear(fy.id);
                    notify(r.success ? 'success' : 'error', r.message);
                  }}
                  className="px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                >
                  Set Active
                </button>
              )}
              {fy.status === 'Open' && (
                <button
                  onClick={() => setClosingTargetId(fy.id)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Year-End Close</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {fy.periods.map((p) => (
              <div
                key={p.id}
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {p.startDate} .. {p.endDate}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.status === 'Open'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {p.status}
                  </span>
                  {fy.status === 'Open' && (
                    <button
                      onClick={() => {
                        const next = p.status === 'Open' ? 'Closed' : 'Open';
                        const res = updatePeriodStatus(fy.id, p.id, next);
                        notify(res.success ? 'success' : 'error', res.message);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title={p.status === 'Open' ? 'Close / Lock Period' : 'Reopen Period'}
                    >
                      {p.status === 'Open' ? (
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Recent Accounting Audit Logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Accounting & General Ledger Audit Trail
          </h3>
        </div>
        {accountingAuditLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No accounting audit events recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto text-xs">
            {accountingAuditLogs.slice(0, 25).map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 mr-2">
                    {log.action}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{log.details}</span>
                </div>
                <div className="text-[11px] text-slate-400 whitespace-nowrap">
                  {log.performedBy} • {log.performedAt.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create New Financial Year Modal */}
      {showNewFY && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold">Create New Financial Year</h3>
              <button onClick={() => setShowNewFY(false)} className="text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateFY} className="p-5 space-y-3">
              <div>
                <label className="block font-semibold mb-1">Financial Year Name *</label>
                <input
                  type="text"
                  required
                  value={fyName}
                  onChange={(e) => setFyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={fyStart}
                    onChange={(e) => setFyStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={fyEnd}
                    onChange={(e) => setFyEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fySetActive}
                  onChange={(e) => setFySetActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Set as Active Financial Year immediately</span>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewFY(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  Create FY
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Year-End Closing Confirmation Modal */}
      {closingTargetId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Confirm Year-End Financial Closing
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Closing this Financial Year will generate a balanced Year-End Closing Journal transferring all Revenue & Expense balances into <b>Retained Earnings (3300)</b>, lock all 12 monthly periods, and carry forward all Asset, Liability, and Equity balances.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClosingTargetId(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const res = performYearEndClosing(closingTargetId);
                  setClosingTargetId(null);
                  notify(res.success ? 'success' : 'error', res.message);
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 hover:opacity-90 text-white font-semibold cursor-pointer"
              >
                Execute Year-End Closing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
