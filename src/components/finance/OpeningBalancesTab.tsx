/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Balanced Account Opening Balances Tab
 * Enforces Total Opening Debit = Total Opening Credit via balanced Opening Journals
 * across Cash, Bank, Customer Receivables, Supplier Payables, Inventory, Fixed Assets,
 * Loans, Capital, and Other Accounts.
 */

import React, { useState, useMemo } from 'react';
import {
  Scale,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import { COA_IDS } from '../../mock/accountingDefaults.ts';
import { formatBDT, ROUND2 } from '../../utils/accountingEngine.ts';

interface OpeningRowInput {
  key: string;
  accountId: string;
  openingDebit: string;
  openingCredit: string;
  partyName: string;
  description: string;
}

export const OpeningBalancesTab: React.FC = () => {
  const { coaAccounts, openingBalanceBatches, postOpeningBalanceBatch } = useCashBank();

  const postableAccounts = useMemo(
    () => coaAccounts.filter((a) => !a.isGroup && a.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [coaAccounts]
  );

  const [effectiveDate, setEffectiveDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [referenceNo, setReferenceNo] = useState(`OB-${new Date().getFullYear()}`);
  const [description, setDescription] = useState('Company Opening Balances Brought Forward');
  const [rows, setRows] = useState<OpeningRowInput[]>([
    { key: 'r1', accountId: COA_IDS.MAIN_CASH, openingDebit: '', openingCredit: '', partyName: '', description: '' },
    { key: 'r2', accountId: COA_IDS.OWNERS_CAPITAL, openingDebit: '', openingCredit: '', partyName: '', description: '' },
  ]);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const totals = useMemo(() => {
    const dr = ROUND2(rows.reduce((s, r) => s + (parseFloat(r.openingDebit) || 0), 0));
    const cr = ROUND2(rows.reduce((s, r) => s + (parseFloat(r.openingCredit) || 0), 0));
    const diff = ROUND2(dr - cr);
    const isBalanced = dr > 0 && Math.abs(diff) <= 0.01;
    return { dr, cr, diff, isBalanced };
  }, [rows]);

  const addRow = (presetAccountId?: string) => {
    setRows((prev) => [
      ...prev,
      {
        key: `r-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        accountId: presetAccountId || postableAccounts[0]?.id || '',
        openingDebit: '',
        openingCredit: '',
        partyName: '',
        description: '',
      },
    ]);
  };

  const loadStandardTemplate = () => {
    setRows([
      { key: 't1', accountId: COA_IDS.MAIN_CASH, openingDebit: '', openingCredit: '', partyName: '', description: 'Cash in Hand' },
      { key: 't2', accountId: COA_IDS.BANK_DBBL, openingDebit: '', openingCredit: '', partyName: '', description: 'Cash at Bank' },
      { key: 't3', accountId: COA_IDS.ACCOUNTS_RECEIVABLE, openingDebit: '', openingCredit: '', partyName: '', description: 'Customer Receivables' },
      { key: 't4', accountId: COA_IDS.RM_INVENTORY, openingDebit: '', openingCredit: '', partyName: '', description: 'Raw Material Stock' },
      { key: 't5', accountId: COA_IDS.FG_INVENTORY, openingDebit: '', openingCredit: '', partyName: '', description: 'Finished Goods Stock' },
      { key: 't6', accountId: COA_IDS.MACHINERY, openingDebit: '', openingCredit: '', partyName: '', description: 'Plant & Machinery' },
      { key: 't7', accountId: COA_IDS.SUPPLIER_PAYABLES, openingDebit: '', openingCredit: '', partyName: '', description: 'Supplier Payables' },
      { key: 't8', accountId: COA_IDS.BANK_LOANS, openingDebit: '', openingCredit: '', partyName: '', description: 'Bank Loans' },
      { key: 't9', accountId: COA_IDS.SHARE_CAPITAL, openingDebit: '', openingCredit: '', partyName: '', description: 'Share / Owner Capital' },
    ]);
  };

  const autoBalanceEquityLine = () => {
    if (Math.abs(totals.diff) <= 0.01) return;
    const eqId = COA_IDS.OPENING_BALANCE_EQUITY;
    const drAdd = totals.diff < 0 ? String(Math.abs(totals.diff)) : '';
    const crAdd = totals.diff > 0 ? String(totals.diff) : '';
    setRows((prev) => [
      ...prev,
      {
        key: `r-bal-${Date.now()}`,
        accountId: eqId,
        openingDebit: drAdd,
        openingCredit: crAdd,
        partyName: 'Opening Equity Offset',
        description: 'Auto-balancing Opening Balance Equity offset',
      },
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = rows
      .filter((r) => (parseFloat(r.openingDebit) || 0) > 0 || (parseFloat(r.openingCredit) || 0) > 0)
      .map((r) => ({
        accountId: r.accountId,
        openingDebit: parseFloat(r.openingDebit) || 0,
        openingCredit: parseFloat(r.openingCredit) || 0,
        partyName: r.partyName || undefined,
        description: r.description || undefined,
      }));

    const res = postOpeningBalanceBatch({
      effectiveDate,
      referenceNo,
      description,
      lines: cleaned,
    });

    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setRows([
        { key: 'r1', accountId: COA_IDS.MAIN_CASH, openingDebit: '', openingCredit: '', partyName: '', description: '' },
        { key: 'r2', accountId: COA_IDS.OWNERS_CAPITAL, openingDebit: '', openingCredit: '', partyName: '', description: '' },
      ]);
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Balanced Opening Journal Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              <span>Account Opening Balances (Balanced Opening Journal)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter opening balances across Cash, Bank, Receivables, Payables, Inventory, Fixed Assets, Loans, and Capital. Unbalanced entries cannot be posted.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStandardTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Load Asset/Liab/Capital Template</span>
            </button>
            <button
              type="button"
              onClick={() => addRow()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Effective Date *
            </label>
            <input
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reference *
            </label>
            <input
              type="text"
              required
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g., OB-2026-INIT"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description *
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Multi-line Entry Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">#</th>
                <th className="px-3 py-2 text-left font-semibold">Chart of Accounts Head *</th>
                <th className="px-3 py-2 text-left font-semibold">Party / Notes</th>
                <th className="px-3 py-2 text-right font-semibold">Opening Debit (BDT)</th>
                <th className="px-3 py-2 text-right font-semibold">Opening Credit (BDT)</th>
                <th className="px-3 py-2 text-center font-semibold">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, idx) => (
                <tr key={row.key}>
                  <td className="px-3 py-2 font-mono text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2 min-w-64">
                    <select
                      value={row.accountId}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, accountId: e.target.value } : r))
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {postableAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} — {acc.name} ({acc.category})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 min-w-44">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, description: e.target.value } : r))
                        )
                      }
                      placeholder="Optional line detail"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </td>
                  <td className="px-3 py-2 w-40">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.openingDebit}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? {
                                  ...r,
                                  openingDebit: e.target.value,
                                  openingCredit: e.target.value ? '' : r.openingCredit,
                                }
                              : r
                          )
                        )
                      }
                      placeholder="0.00"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 w-40">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.openingCredit}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? {
                                  ...r,
                                  openingCredit: e.target.value,
                                  openingDebit: e.target.value ? '' : r.openingDebit,
                                }
                              : r
                          )
                        )
                      }
                      placeholder="0.00"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={rows.length <= 2}
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 font-bold">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">
                  Total Opening Balance Check:
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {formatBDT(totals.dr)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-purple-600 dark:text-purple-400">
                  {formatBDT(totals.cr)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {totals.isBalanced ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">BALANCED</span>
                  ) : (
                    <span className="text-[10px] text-rose-600 dark:text-rose-400">
                      Δ {formatBDT(Math.abs(totals.diff))}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {!totals.isBalanced && totals.dr + totals.cr > 0 && (
              <button
                type="button"
                onClick={autoBalanceEquityLine}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                + Insert Balancing Line to Opening Balance Equity (3250) for {formatBDT(Math.abs(totals.diff))}
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!totals.isBalanced}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold cursor-pointer"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Post Balanced Opening Journal</span>
          </button>
        </div>
      </form>

      {/* Posted Opening Batches History */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Posted Opening Balance Journals ({openingBalanceBatches.length})
          </h3>
        </div>
        {openingBalanceBatches.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No multi-line opening balance batches posted yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {openingBalanceBatches.map((b) => (
              <div key={b.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {b.voucherNo}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">{b.effectiveDate}</span>
                    <span className="text-slate-400">•</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{b.description}</span>
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    Dr = Cr = {formatBDT(b.totalDebit)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {b.lines.map((l) => (
                    <div
                      key={l.id}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-[11px]"
                    >
                      <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                        {l.accountCode} {l.accountName}
                      </span>
                      <span className="font-mono font-bold ml-2">
                        {l.openingDebit > 0
                          ? `Dr ${formatBDT(l.openingDebit)}`
                          : `Cr ${formatBDT(l.openingCredit)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
