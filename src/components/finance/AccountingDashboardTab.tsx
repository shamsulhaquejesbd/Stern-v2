/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Accounting Executive Dashboard Tab
 * Real-time Double-Entry KPIs, Balance Sheet Snapshot, Inventory/WIP Valuation,
 * Revenue vs Expense Trend SVG Chart, Cash & Bank Trend, and Drill-Down Actions.
 */

import React, { useState, useMemo } from 'react';
import {
  Landmark,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Factory,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import { formatBDT, buildBalanceSheet, buildProfitLoss, ROUND2 } from '../../utils/accountingEngine.ts';
import { COA_IDS } from '../../mock/accountingDefaults.ts';

interface AccountingDashboardTabProps {
  onSelectTab: (tab: string) => void;
  onSyncERP: () => void;
}

export const AccountingDashboardTab: React.FC<AccountingDashboardTabProps> = ({
  onSelectTab,
  onSyncERP,
}) => {
  const {
    coaAccounts,
    glEntries,
    vouchers,
    financialYears,
    accountingKPIs,
    arControlBalance,
    apControlBalance,
    optimumControlBalance,
    receivableSubLedger,
    payableSubLedger,
  } = useCashBank();

  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));

  const balanceSheetSnapshot = useMemo(
    () => buildBalanceSheet(coaAccounts, glEntries, asOfDate, financialYears),
    [coaAccounts, glEntries, asOfDate, financialYears]
  );

  const monthStart = `${asOfDate.slice(0, 7)}-01`;
  const monthPL = useMemo(
    () => buildProfitLoss(coaAccounts, glEntries, monthStart, asOfDate),
    [coaAccounts, glEntries, monthStart, asOfDate]
  );

  // Build 6-month trend for Revenue vs Expense and Cash & Bank Net Flow from actual GL
  const monthlySeries = useMemo(() => {
    const baseDate = new Date(`${asOfDate}T00:00:00`);
    const months: Array<{
      ym: string;
      label: string;
      revenue: number;
      expense: number;
      cashNet: number;
    }> = [];

    const cashBankIds = new Set(
      coaAccounts
        .filter(
          (a) =>
            !a.isGroup &&
            (a.parentId === COA_IDS.CASH_IN_HAND_GROUP ||
              a.parentId === COA_IDS.CASH_AT_BANK_GROUP ||
              Boolean(a.linkedCashBankAccountId))
        )
        .map((a) => a.id)
    );

    for (let i = 5; i >= 0; i--) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short' });
      const mStart = `${ym}-01`;
      const mLast = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mEnd = `${ym}-${String(mLast.getDate()).padStart(2, '0')}`;

      const pl = buildProfitLoss(coaAccounts, glEntries, mStart, mEnd);
      const cashDelta = ROUND2(
        glEntries
          .filter((e) => cashBankIds.has(e.accountId) && e.entryDate >= mStart && e.entryDate <= mEnd)
          .reduce((s, e) => s + (e.debit - e.credit), 0)
      );

      months.push({
        ym,
        label,
        revenue: pl.totalRevenue,
        expense: pl.totalExpenses,
        cashNet: cashDelta,
      });
    }
    return months;
  }, [coaAccounts, glEntries, asOfDate]);

  const maxRevExp = Math.max(
    1,
    ...monthlySeries.flatMap((m) => [m.revenue, m.expense])
  );

  const subLedgerAR = ROUND2(receivableSubLedger.reduce((s, r) => s + r.outstandingBalance, 0));
  const subLedgerAP = ROUND2(
    payableSubLedger.filter((p) => p.partyType !== 'Optimum JV').reduce((s, r) => s + r.outstandingBalance, 0)
  );

  const activeFY = financialYears.find((f) => f.isActive) || financialYears[0];

  return (
    <div className="space-y-4">
      {/* Filter & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold">As-Of Reporting Date:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
          </div>
          {activeFY && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Active FY: {activeFY.name} ({activeFY.status})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
              balanceSheetSnapshot.isBalanced
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
            }`}
          >
            {balanceSheetSnapshot.isBalanced ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>
              {balanceSheetSnapshot.isBalanced
                ? 'Balance Sheet Equation Balanced (A = L + E)'
                : `Out of Balance: ${formatBDT(balanceSheetSnapshot.difference)}`}
            </span>
          </span>

          <button
            onClick={onSyncERP}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync ERP to GL</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (10 Core Financial Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Total Assets',
            value: balanceSheetSnapshot.totalAssets,
            sub: `Current + Fixed Assets (Net)`,
            icon: Scale,
            tone: 'text-blue-600 dark:text-blue-400',
            tab: 'balance-sheet',
          },
          {
            label: 'Total Liabilities',
            value: balanceSheetSnapshot.totalLiabilities,
            sub: `Payables, Loans & Optimum JV`,
            icon: ArrowUpRight,
            tone: 'text-amber-600 dark:text-amber-400',
            tab: 'balance-sheet',
          },
          {
            label: 'Total Equity',
            value: balanceSheetSnapshot.totalEquity,
            sub: `Capital + Retained + Net P&L`,
            icon: Landmark,
            tone: 'text-indigo-600 dark:text-indigo-400',
            tab: 'balance-sheet',
          },
          {
            label: 'Cash in Hand',
            value: accountingKPIs.cashInHand,
            sub: `GL Control 1110`,
            icon: Wallet,
            tone: 'text-emerald-600 dark:text-emerald-400',
            tab: 'cash-book',
          },
          {
            label: 'Cash at Bank',
            value: accountingKPIs.cashAtBank,
            sub: `GL Control 1120`,
            icon: Landmark,
            tone: 'text-cyan-600 dark:text-cyan-400',
            tab: 'bank-book',
          },
          {
            label: 'Accounts Receivable',
            value: arControlBalance,
            sub: `Sub-ledger Invoices: ${formatBDT(subLedgerAR)}`,
            icon: ArrowDownLeft,
            tone: 'text-teal-600 dark:text-teal-400',
            tab: 'receivables',
          },
          {
            label: 'Accounts Payable',
            value: ROUND2(apControlBalance + optimumControlBalance),
            sub: `Suppliers: ${formatBDT(subLedgerAP)} | Optimum: ${formatBDT(optimumControlBalance)}`,
            icon: ArrowUpRight,
            tone: 'text-orange-600 dark:text-orange-400',
            tab: 'payables',
          },
          {
            label: 'Monthly Revenue',
            value: monthPL.totalRevenue,
            sub: `${asOfDate.slice(0, 7)} Posted Sales & Service`,
            icon: TrendingUp,
            tone: 'text-emerald-600 dark:text-emerald-400',
            tab: 'profit-loss',
          },
          {
            label: 'Monthly Expenses',
            value: monthPL.totalExpenses,
            sub: `COGS + Factory + Operating`,
            icon: TrendingDown,
            tone: 'text-rose-600 dark:text-rose-400',
            tab: 'profit-loss',
          },
          {
            label: 'Monthly Net Profit / Loss',
            value: monthPL.netProfitLoss,
            sub: `Net Margin: ${monthPL.netMarginPct.toFixed(1)}%`,
            icon: FileSpreadsheet,
            tone:
              monthPL.netProfitLoss >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400',
            tab: 'profit-loss',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              onClick={() => onSelectTab(card.tab)}
              className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-xl p-3.5 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <Icon className={`w-4 h-4 ${card.tone}`} />
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {formatBDT(card.value)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {card.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Inventory & Production WIP / Optimum JV Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Raw Materials Inventory (1150)',
            val: accountingKPIs.rmInventoryValue,
            icon: Boxes,
          },
          {
            label: 'Work in Progress WIP (1160)',
            val: accountingKPIs.wipInventoryValue,
            icon: Factory,
          },
          {
            label: 'Finished Goods Inventory (1170)',
            val: accountingKPIs.fgInventoryValue,
            icon: Boxes,
          },
          {
            label: 'Optimum JV Clearing Payable (2130)',
            val: optimumControlBalance,
            icon: BookOpen,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {item.label}
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatBDT(item.val)}
                </div>
              </div>
              <Icon className="w-5 h-5 text-slate-400" />
            </div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Revenue vs Expense Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Monthly Revenue vs Expense (6 Months)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Computed strictly from Posted General Ledger Revenue & Expense accounts
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                Revenue
              </span>
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                Expenses
              </span>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-2 items-end h-44 pt-4 border-b border-slate-200 dark:border-slate-800 pb-2">
            {monthlySeries.map((m) => {
              const revH = Math.max(4, Math.round((m.revenue / maxRevExp) * 130));
              const expH = Math.max(4, Math.round((m.expense / maxRevExp) * 130));
              return (
                <div key={m.ym} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="flex items-end gap-1 h-34">
                    <div
                      title={`Revenue (${m.label}): ${formatBDT(m.revenue)}`}
                      style={{ height: `${m.revenue > 0 ? revH : 2}px` }}
                      className="w-4 rounded-t bg-emerald-500/85 hover:bg-emerald-500 transition-all"
                    />
                    <div
                      title={`Expense (${m.label}): ${formatBDT(m.expense)}`}
                      style={{ height: `${m.expense > 0 ? expH : 2}px` }}
                      className="w-4 rounded-t bg-rose-500/80 hover:bg-rose-500 transition-all"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Balance Sheet Structural Ratio & Cash Flow Summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Balance Sheet Composition & Voucher Pipeline
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Real-time Asset backing vs Liabilities + Equity and GL voucher status
              </p>
            </div>
            <button
              onClick={() => onSelectTab('journal-vouchers')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Open Vouchers →
            </button>
          </div>

          <div className="space-y-3">
            {[
              {
                label: 'Total Assets',
                val: balanceSheetSnapshot.totalAssets,
                color: 'bg-blue-600',
              },
              {
                label: 'Total Liabilities',
                val: balanceSheetSnapshot.totalLiabilities,
                color: 'bg-amber-500',
              },
              {
                label: 'Total Equity (Incl. Current Net P&L)',
                val: balanceSheetSnapshot.totalEquity,
                color: 'bg-indigo-600',
              },
            ].map((bar) => {
              const denom = Math.max(
                1,
                balanceSheetSnapshot.totalAssets,
                balanceSheetSnapshot.totalLiabilities + Math.abs(balanceSheetSnapshot.totalEquity)
              );
              const pct = Math.min(100, Math.max(2, Math.round((Math.abs(bar.val) / denom) * 100)));
              return (
                <div key={bar.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300">{bar.label}</span>
                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatBDT(bar.val)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Posted Vouchers</div>
              <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
                {accountingKPIs.postedVouchersCount}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Pending Approval</div>
              <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">
                {accountingKPIs.pendingVouchersCount}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">GL Entries</div>
              <div className="text-base font-bold font-mono text-blue-600 dark:text-blue-400">
                {glEntries.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Posted GL Vouchers Quick Preview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Latest Posted Double-Entry Vouchers
          </h3>
          <button
            onClick={() => onSelectTab('general-ledger')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            View General Ledger →
          </button>
        </div>
        {vouchers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No General Ledger vouchers posted yet. Post Opening Balances, Cash/Bank Transactions, Journal Vouchers, or click <b>Sync ERP to GL</b>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Voucher No</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Type / Source</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Debit / Credit</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vouchers.slice(0, 8).map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {v.voucherNo}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-300">
                      {v.voucherDate}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                      {v.voucherType}
                      {v.sourceModule ? ` • ${v.sourceModule}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-md truncate">
                      {v.description}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatBDT(v.totalDebit)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          v.status === 'Posted'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : v.status === 'Reversed'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
