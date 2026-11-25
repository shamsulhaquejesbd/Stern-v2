/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - General Ledger (GL) Account Statement Tab
 * Account selector, date presets (Today, This Month, Previous Month, Financial Year, Custom),
 * Opening Balance, Running Balance, Closing Balance, Voucher drill-down, and CSV export.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { BookOpen, Download, Eye, X } from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import {
  formatBDT,
  computeAccountNormalBalance,
  ROUND2,
} from '../../utils/accountingEngine.ts';
import { COA_IDS } from '../../mock/accountingDefaults.ts';
import { JournalVoucher } from '../../types/accounting.ts';

interface GeneralLedgerTabProps {
  initialAccountId?: string;
}

export const GeneralLedgerTab: React.FC<GeneralLedgerTabProps> = ({ initialAccountId }) => {
  const { coaAccounts, glEntries, vouchers, financialYears } = useCashBank();

  const postableAccounts = useMemo(
    () => coaAccounts.filter((a) => !a.isGroup).sort((a, b) => a.code.localeCompare(b.code)),
    [coaAccounts]
  );

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || COA_IDS.MAIN_CASH
  );

  useEffect(() => {
    if (initialAccountId) setSelectedAccountId(initialAccountId);
  }, [initialAccountId]);

  const today = new Date().toISOString().slice(0, 10);
  const activeFY = financialYears.find((f) => f.isActive) || financialYears[0];
  const [preset, setPreset] = useState<'today' | 'this_month' | 'prev_month' | 'fy' | 'custom'>('fy');
  const [fromDate, setFromDate] = useState(activeFY?.startDate || `${today.slice(0, 4)}-01-01`);
  const [toDate, setToDate] = useState(activeFY?.endDate || today);
  const [drillVoucher, setDrillVoucher] = useState<JournalVoucher | null>(null);

  const applyPreset = (p: typeof preset) => {
    setPreset(p);
    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (p === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (p === 'this_month') {
      setFromDate(`${today.slice(0, 7)}-01`);
      setToDate(today);
    } else if (p === 'prev_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(fmt(first));
      setToDate(fmt(last));
    } else if (p === 'fy' && activeFY) {
      setFromDate(activeFY.startDate);
      setToDate(activeFY.endDate);
    }
  };

  const selectedAccount = postableAccounts.find((a) => a.id === selectedAccountId) || postableAccounts[0];

  const ledgerData = useMemo(() => {
    if (!selectedAccount) {
      return { openingBalance: 0, rows: [], totalDebit: 0, totalCredit: 0, closingBalance: 0 };
    }

    const accountEntries = glEntries
      .filter((e) => e.accountId === selectedAccount.id && e.entryDate <= toDate)
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));

    let openDr = 0;
    let openCr = 0;
    const periodEntries: typeof accountEntries = [];

    accountEntries.forEach((e) => {
      const isOpening =
        e.entryDate < fromDate || (e.entryDate === fromDate && e.voucherType === 'Opening Journal');
      if (isOpening) {
        openDr = ROUND2(openDr + e.debit);
        openCr = ROUND2(openCr + e.credit);
      } else if (e.entryDate >= fromDate && e.entryDate <= toDate) {
        periodEntries.push(e);
      }
    });

    const openingBalance = computeAccountNormalBalance(selectedAccount, openDr, openCr);
    let running = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const rows = periodEntries.map((e) => {
      const delta =
        selectedAccount.normalBalance === 'Debit'
          ? ROUND2(e.debit - e.credit)
          : ROUND2(e.credit - e.debit);
      running = ROUND2(running + delta);
      totalDebit = ROUND2(totalDebit + e.debit);
      totalCredit = ROUND2(totalCredit + e.credit);
      return {
        ...e,
        runningBalance: running,
      };
    });

    return {
      openingBalance,
      rows,
      totalDebit,
      totalCredit,
      closingBalance: running,
    };
  }, [selectedAccount, glEntries, fromDate, toDate]);

  const exportCSV = () => {
    if (!selectedAccount) return;
    const header = ['Date', 'Voucher No', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance'];
    const lines = [
      header.join(','),
      `${fromDate},OPENING,Opening Balance,,Opening Balance Brought Forward,,,${ledgerData.openingBalance}`,
      ...ledgerData.rows.map((r) =>
        [
          r.entryDate,
          r.voucherNo,
          `"${r.voucherType}"`,
          `"${r.referenceNo || ''}"`,
          `"${(r.description || '').replace(/"/g, '""')}"`,
          r.debit,
          r.credit,
          r.runningBalance,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GL_${selectedAccount.code}_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              <span>General Ledger (Account Statement)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Inspect running account balances with full source voucher drill-down.
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs items-end">
          <div className="lg:col-span-5">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Account Head
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
            >
              {postableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name} ({a.category})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3 flex flex-wrap gap-1">
            {[
              { id: 'today', label: 'Today' },
              { id: 'this_month', label: 'This Month' },
              { id: 'prev_month', label: 'Prev Month' },
              { id: 'fy', label: 'Full FY' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id as any)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                  preset === p.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPreset('custom');
                setFromDate(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPreset('custom');
                setToDate(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Opening Balance', val: ledgerData.openingBalance },
          { label: 'Period Total Debit', val: ledgerData.totalDebit },
          { label: 'Period Total Credit', val: ledgerData.totalCredit },
          { label: 'Closing Balance', val: ledgerData.closingBalance },
        ].map((box) => (
          <div
            key={box.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3"
          >
            <div className="text-[11px] font-semibold uppercase text-slate-500">{box.label}</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {formatBDT(box.val)}
            </div>
          </div>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                <th className="px-4 py-2.5 text-left font-semibold">Voucher No</th>
                <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                <th className="px-4 py-2.5 text-right font-semibold">Debit (BDT)</th>
                <th className="px-4 py-2.5 text-right font-semibold">Credit (BDT)</th>
                <th className="px-4 py-2.5 text-right font-semibold">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr className="bg-blue-50/40 dark:bg-blue-950/20 font-semibold">
                <td className="px-4 py-2.5 font-mono">{fromDate}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">OPENING</td>
                <td className="px-4 py-2.5">Opening Balance Brought Forward</td>
                <td className="px-4 py-2.5 text-right font-mono">—</td>
                <td className="px-4 py-2.5 text-right font-mono">—</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold">
                  {formatBDT(ledgerData.openingBalance)}
                </td>
              </tr>

              {ledgerData.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No posted General Ledger activity for {selectedAccount?.name} in this date range.
                  </td>
                </tr>
              ) : (
                ledgerData.rows.map((r) => {
                  const foundV = vouchers.find((v) => v.id === r.voucherId);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {r.entryDate}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => foundV && setDrillVoucher(foundV)}
                          className="inline-flex items-center gap-1 font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <span>{r.voucherNo}</span>
                          {foundV && <Eye className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200 max-w-md">
                        <div className="truncate">{r.description}</div>
                        {r.partyName && (
                          <div className="text-[10px] text-slate-400">
                            {r.partyName} {r.referenceNo ? `• Ref: ${r.referenceNo}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {r.debit > 0 ? formatBDT(r.debit) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                        {r.credit > 0 ? formatBDT(r.credit) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatBDT(r.runningBalance)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 font-bold">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right">
                  Closing Total ({selectedAccount?.normalBalance} Normal):
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{formatBDT(ledgerData.totalDebit)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{formatBDT(ledgerData.totalCredit)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">
                  {formatBDT(ledgerData.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Voucher Drill-Down Modal */}
      {drillVoucher && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                Voucher Breakdown: {drillVoucher.voucherNo}
              </span>
              <button onClick={() => setDrillVoucher(null)} className="text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-slate-700 dark:text-slate-300">
                <b>{drillVoucher.voucherType}</b> • {drillVoucher.voucherDate} • {drillVoucher.description}
              </div>
              <table className="w-full border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {drillVoucher.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.accountCode} — {l.accountName}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.debit > 0 ? formatBDT(l.debit) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.credit > 0 ? formatBDT(l.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
