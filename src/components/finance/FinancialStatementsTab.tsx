/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Financial Statements Suite
 * Strictly calculated from Posted General Ledger Entries:
 * 1. Trial Balance (Opening Dr/Cr, Period Dr/Cr, Closing Dr/Cr, Total Dr = Total Cr)
 * 2. Balance Sheet (As-Of Date, Assets = Liabilities + Equity + Current Net P&L)
 * 3. Profit & Loss / Income Statement (Monthly, Quarterly, Yearly, Custom Date Range)
 * 4. Cash Flow Statement (Indirect Method, reconciling Opening -> Closing Cash & Bank)
 */

import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Scale,
  TrendingUp,
  ArrowLeftRight,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import {
  formatBDT,
  buildTrialBalance,
  buildBalanceSheet,
  buildProfitLoss,
  buildCashFlowStatement,
} from '../../utils/accountingEngine.ts';

interface FinancialStatementsTabProps {
  statement: 'trial-balance' | 'balance-sheet' | 'profit-loss' | 'cash-flow';
}

export const FinancialStatementsTab: React.FC<FinancialStatementsTabProps> = ({ statement }) => {
  const { coaAccounts, glEntries, financialYears, accountingSettings } = useCashBank();
  const activeFY = financialYears.find((f) => f.isActive) || financialYears[0];
  const today = new Date().toISOString().slice(0, 10);

  const [asOfDate, setAsOfDate] = useState(today);
  const [fromDate, setFromDate] = useState(activeFY?.startDate || `${today.slice(0, 4)}-01-01`);
  const [toDate, setToDate] = useState(activeFY?.endDate || today);
  const [rangePreset, setRangePreset] = useState<'monthly' | 'quarterly' | 'yearly' | 'custom'>('yearly');

  const applyRangePreset = (preset: typeof rangePreset) => {
    setRangePreset(preset);
    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (preset === 'monthly') {
      setFromDate(`${today.slice(0, 7)}-01`);
      setToDate(today);
    } else if (preset === 'quarterly') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      setFromDate(fmt(start));
      setToDate(today);
    } else if (preset === 'yearly') {
      setFromDate(activeFY?.startDate || `${today.slice(0, 4)}-01-01`);
      setToDate(activeFY?.endDate || today);
    }
  };

  const trialBalance = useMemo(
    () => buildTrialBalance(coaAccounts, glEntries, fromDate, toDate),
    [coaAccounts, glEntries, fromDate, toDate]
  );

  const balanceSheet = useMemo(
    () => buildBalanceSheet(coaAccounts, glEntries, asOfDate, financialYears),
    [coaAccounts, glEntries, asOfDate, financialYears]
  );

  const profitLoss = useMemo(
    () => buildProfitLoss(coaAccounts, glEntries, fromDate, toDate),
    [coaAccounts, glEntries, fromDate, toDate]
  );

  const cashFlow = useMemo(
    () => buildCashFlowStatement(coaAccounts, glEntries, fromDate, toDate),
    [coaAccounts, glEntries, fromDate, toDate]
  );

  const exportStatementCSV = () => {
    let lines: string[] = [];
    let filename = `${statement}.csv`;

    if (statement === 'trial-balance') {
      filename = `Trial_Balance_${fromDate}_${toDate}.csv`;
      lines = [
        'Code,Account Name,Category,Opening Debit,Opening Credit,Period Debit,Period Credit,Closing Debit,Closing Credit',
        ...trialBalance.rows.map((r) =>
          [
            r.accountCode,
            `"${r.accountName}"`,
            r.category,
            r.openingDebit,
            r.openingCredit,
            r.periodDebit,
            r.periodCredit,
            r.closingDebit,
            r.closingCredit,
          ].join(',')
        ),
        `TOTALS,,,${trialBalance.totalOpeningDebit},${trialBalance.totalOpeningCredit},${trialBalance.totalPeriodDebit},${trialBalance.totalPeriodCredit},${trialBalance.totalClosingDebit},${trialBalance.totalClosingCredit}`,
      ];
    } else if (statement === 'balance-sheet') {
      filename = `Balance_Sheet_${asOfDate}.csv`;
      lines = [
        'Section,Code,Account Name,Amount (BDT)',
        ...balanceSheet.currentAssets.map((l) => `Current Assets,${l.accountCode},"${l.accountName}",${l.amount}`),
        `Total Current Assets,,,${balanceSheet.totalCurrentAssets}`,
        ...balanceSheet.nonCurrentAssets.map((l) => `Non-Current Assets,${l.accountCode},"${l.accountName}",${l.amount}`),
        ...balanceSheet.contraAssets.map((l) => `Less: Accum Depreciation,${l.accountCode},"${l.accountName}",-${l.amount}`),
        `TOTAL ASSETS,,,${balanceSheet.totalAssets}`,
        ...balanceSheet.currentLiabilities.map((l) => `Current Liabilities,${l.accountCode},"${l.accountName}",${l.amount}`),
        ...balanceSheet.longTermLiabilities.map((l) => `Long-Term Liabilities,${l.accountCode},"${l.accountName}",${l.amount}`),
        `Total Liabilities,,,${balanceSheet.totalLiabilities}`,
        ...balanceSheet.equityLines.map((l) => `Equity,${l.accountCode},"${l.accountName}",${l.amount}`),
        `TOTAL LIABILITIES & EQUITY,,,${balanceSheet.totalLiabilitiesAndEquity}`,
      ];
    } else if (statement === 'profit-loss') {
      filename = `Profit_Loss_${fromDate}_${toDate}.csv`;
      lines = [
        'Section,Code,Account Name,Amount (BDT)',
        ...profitLoss.revenueLines.map((l) => `Revenue,${l.accountCode},"${l.accountName}",${l.amount}`),
        `Total Revenue,,,${profitLoss.totalRevenue}`,
        ...profitLoss.cogsLines.map((l) => `COGS,${l.accountCode},"${l.accountName}",${l.amount}`),
        `Gross Profit,,,${profitLoss.grossProfit}`,
        ...profitLoss.factoryExpenseLines.map((l) => `Factory Expenses,${l.accountCode},"${l.accountName}",${l.amount}`),
        ...profitLoss.operatingExpenseLines.map((l) => `Operating Expenses,${l.accountCode},"${l.accountName}",${l.amount}`),
        ...profitLoss.depreciationLines.map((l) => `Depreciation,${l.accountCode},"${l.accountName}",${l.amount}`),
        `NET PROFIT / (LOSS),,,${profitLoss.netProfitLoss}`,
      ];
    } else {
      filename = `Cash_Flow_${fromDate}_${toDate}.csv`;
      lines = [
        'Category,Line Item,Amount (BDT)',
        `Operating,Net Profit,${cashFlow.netProfit}`,
        ...cashFlow.operatingAdjustments.map((x) => `Operating,"${x.label}",${x.amount}`),
        ...cashFlow.workingCapitalChanges.map((x) => `Operating,"${x.label}",${x.amount}`),
        `Operating,Net Cash From Operating,${cashFlow.netCashFromOperating}`,
        ...cashFlow.investingActivities.map((x) => `Investing,"${x.label}",${x.amount}`),
        `Investing,Net Cash From Investing,${cashFlow.netCashFromInvesting}`,
        ...cashFlow.financingActivities.map((x) => `Financing,"${x.label}",${x.amount}`),
        `Financing,Net Cash From Financing,${cashFlow.netCashFromFinancing}`,
        `Summary,Opening Cash & Bank,${cashFlow.openingCashAndBank}`,
        `Summary,Closing Cash & Bank,${cashFlow.closingCashAndBankComputed}`,
      ];
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const titleMap = {
    'trial-balance': { title: 'Trial Balance', icon: Scale, sub: 'Verification that Total Debit equals Total Credit across all posted accounts' },
    'balance-sheet': { title: 'Statement of Financial Position (Balance Sheet)', icon: FileSpreadsheet, sub: 'Assets, Liabilities & Equity strictly generated from Posted GL balances' },
    'profit-loss': { title: 'Statement of Profit or Loss (Income Statement)', icon: TrendingUp, sub: 'Revenue, COGS, Gross Profit, Operating Expenses & Net Profit' },
    'cash-flow': { title: 'Cash Flow Statement (Indirect Method)', icon: ArrowLeftRight, sub: 'Operating, Investing & Financing cash flows reconciling Opening to Closing Cash & Bank' },
  }[statement];

  const TitleIcon = titleMap.icon;

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {accountingSettings.companyLegalName}
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
              <TitleIcon className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              <span>{titleMap.title}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{titleMap.sub}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportStatementCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {statement === 'balance-sheet' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">As-Of Date:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border font-semibold ${
                balanceSheet.isBalanced
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}
            >
              {balanceSheet.isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>
                {balanceSheet.isBalanced
                  ? `Balanced: Assets (${formatBDT(balanceSheet.totalAssets)}) = Liabilities + Equity (${formatBDT(balanceSheet.totalLiabilitiesAndEquity)})`
                  : `Discrepancy Detected: ${formatBDT(balanceSheet.difference)}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'monthly', label: 'Monthly' },
                { id: 'quarterly', label: 'Quarterly' },
                { id: 'yearly', label: 'Financial Year' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyRangePreset(p.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
                    rangePreset === p.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setRangePreset('custom');
                  setFromDate(e.target.value);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
              <span className="font-semibold text-slate-500">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setRangePreset('custom');
                  setToDate(e.target.value);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 1. TRIAL BALANCE VIEW */}
      {statement === 'trial-balance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Accounts with Activity: {trialBalance.rows.length}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 font-bold ${
                trialBalance.isBalanced ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {trialBalance.isBalanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              <span>
                {trialBalance.isBalanced ? 'Trial Balance Tied (Total Debit = Total Credit)' : `Diff: ${formatBDT(trialBalance.difference)}`}
              </span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5 text-left">Code</th>
                  <th className="px-3 py-2.5 text-left">Account Name</th>
                  <th className="px-3 py-2.5 text-right">Opening Dr</th>
                  <th className="px-3 py-2.5 text-right">Opening Cr</th>
                  <th className="px-3 py-2.5 text-right">Period Dr</th>
                  <th className="px-3 py-2.5 text-right">Period Cr</th>
                  <th className="px-3 py-2.5 text-right">Closing Dr</th>
                  <th className="px-3 py-2.5 text-right">Closing Cr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {trialBalance.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No posted General Ledger entries exist in this period.
                    </td>
                  </tr>
                ) : (
                  trialBalance.rows.map((r) => (
                    <tr key={r.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-mono font-bold text-slate-600 dark:text-slate-300">{r.accountCode}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{r.accountName}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.openingDebit > 0 ? formatBDT(r.openingDebit) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.openingCredit > 0 ? formatBDT(r.openingCredit) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.periodDebit > 0 ? formatBDT(r.periodDebit) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.periodCredit > 0 ? formatBDT(r.periodCredit) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{r.closingDebit > 0 ? formatBDT(r.closingDebit) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{r.closingCredit > 0 ? formatBDT(r.closingCredit) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase">Grand Totals</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatBDT(trialBalance.totalOpeningDebit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatBDT(trialBalance.totalOpeningCredit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatBDT(trialBalance.totalPeriodDebit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatBDT(trialBalance.totalPeriodCredit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">{formatBDT(trialBalance.totalClosingDebit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">{formatBDT(trialBalance.totalClosingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 2. BALANCE SHEET VIEW */}
      {statement === 'balance-sheet' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ASSETS COLUMN */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-4 py-3 bg-blue-50/70 dark:bg-blue-950/30 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-blue-800 dark:text-blue-300">
                ASSETS (As of {asOfDate})
              </div>
              <div className="p-4 space-y-4 text-xs">
                <div>
                  <div className="font-bold uppercase text-[11px] text-slate-500 mb-2">Current Assets</div>
                  <div className="space-y-1.5">
                    {balanceSheet.currentAssets.length === 0 ? (
                      <div className="text-slate-400 italic">No current asset balances</div>
                    ) : (
                      balanceSheet.currentAssets.map((l) => (
                        <div key={l.accountId} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/70">
                          <span><span className="font-mono text-slate-400 mr-1.5">{l.accountCode}</span>{l.accountName}</span>
                          <span className="font-mono font-semibold tabular-nums">{formatBDT(l.amount)}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between pt-1.5 font-bold text-slate-800 dark:text-slate-200">
                      <span>Total Current Assets</span>
                      <span className="font-mono">{formatBDT(balanceSheet.totalCurrentAssets)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-bold uppercase text-[11px] text-slate-500 mb-2">Non-Current Assets (Fixed Assets)</div>
                  <div className="space-y-1.5">
                    {balanceSheet.nonCurrentAssets.length === 0 && balanceSheet.contraAssets.length === 0 ? (
                      <div className="text-slate-400 italic">No non-current asset balances</div>
                    ) : (
                      <>
                        {balanceSheet.nonCurrentAssets.map((l) => (
                          <div key={l.accountId} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/70">
                            <span><span className="font-mono text-slate-400 mr-1.5">{l.accountCode}</span>{l.accountName}</span>
                            <span className="font-mono font-semibold tabular-nums">{formatBDT(l.amount)}</span>
                          </div>
                        ))}
                        {balanceSheet.contraAssets.map((l) => (
                          <div key={l.accountId} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/70 text-rose-600 dark:text-rose-400">
                            <span><span className="font-mono mr-1.5">{l.accountCode}</span>Less: {l.accountName}</span>
                            <span className="font-mono font-semibold tabular-nums">({formatBDT(l.amount)})</span>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="flex justify-between pt-1.5 font-bold text-slate-800 dark:text-slate-200">
                      <span>Total Non-Current Assets (Net)</span>
                      <span className="font-mono">{formatBDT(balanceSheet.totalNonCurrentAssetsNet)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-bold">
              <span>TOTAL ASSETS</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">{formatBDT(balanceSheet.totalAssets)}</span>
            </div>
          </div>

          {/* LIABILITIES & EQUITY COLUMN */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-4 py-3 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-indigo-800 dark:text-indigo-300">
                LIABILITIES & EQUITY (As of {asOfDate})
              </div>
              <div className="p-4 space-y-4 text-xs">
                <div>
                  <div className="font-bold uppercase text-[11px] text-slate-500 mb-2">Current Liabilities</div>
                  <div className="space-y-1.5">
                    {balanceSheet.currentLiabilities.length === 0 ? (
                      <div className="text-slate-400 italic">No current liability balances</div>
                    ) : (
                      balanceSheet.currentLiabilities.map((l) => (
                        <div key={l.accountId} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/70">
                          <span><span className="font-mono text-slate-400 mr-1.5">{l.accountCode}</span>{l.accountName}</span>
                          <span className="font-mono font-semibold tabular-nums">{formatBDT(l.amount)}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between pt-1.5 font-bold">
                      <span>Total Current Liabilities</span>
                      <span className="font-mono">{formatBDT(balanceSheet.totalCurrentLiabilities)}</span>
                    </div>
                  </div>
                </div>

                {balanceSheet.longTermLiabilities.length > 0 && (
                  <div>
                    <div className="font-bold uppercase text-[11px] text-slate-500 mb-2">Long-Term Liabilities</div>
                    <div className="space-y-1.5">
                      {balanceSheet.longTermLiabilities.map((l) => (
                        <div key={l.accountId} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/70">
                          <span><span className="font-mono text-slate-400 mr-1.5">{l.accountCode}</span>{l.accountName}</span>
                          <span className="font-mono font-semibold tabular-nums">{formatBDT(l.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-1.5 font-bold">
                        <span>Total Long-Term Liabilities</span>
                        <span className="font-mono">{formatBDT(balanceSheet.totalLongTermLiabilities)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="font-bold uppercase text-[11px] text-slate-500 mb-2">Shareholders&apos; Equity</div>
                  <div className="space-y-1.5">
                    {balanceSheet.equityLines.map((l) => (
                      <div key={l.accountId} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/70">
                        <span>
                          <span className="font-mono text-slate-400 mr-1.5">{l.accountCode}</span>
                          {l.accountName}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">{formatBDT(l.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1.5 font-bold">
                      <span>Total Equity</span>
                      <span className="font-mono">{formatBDT(balanceSheet.totalEquity)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-bold">
              <span>TOTAL LIABILITIES + EQUITY</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {formatBDT(balanceSheet.totalLiabilitiesAndEquity)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. PROFIT & LOSS STATEMENT */}
      {statement === 'profit-loss' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex justify-between font-bold text-sm">
            <span>Income Statement ({fromDate} to {toDate})</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              Gross Margin: {profitLoss.grossMarginPct.toFixed(1)}% • Net Margin: {profitLoss.netMarginPct.toFixed(1)}%
            </span>
          </div>
          <div className="p-5 space-y-5">
            {/* Revenue */}
            <div>
              <div className="font-bold uppercase text-[11px] text-emerald-600 dark:text-emerald-400 mb-2">Revenue / Operating Income</div>
              {profitLoss.revenueLines.length === 0 ? (
                <div className="text-slate-400 italic">No posted revenue in selected period</div>
              ) : (
                profitLoss.revenueLines.map((l) => (
                  <div key={l.accountId} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span><span className="font-mono text-slate-400 mr-2">{l.accountCode}</span>{l.accountName}</span>
                    <span className="font-mono font-semibold">{formatBDT(l.amount)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between pt-2 font-bold text-slate-900 dark:text-white">
                <span>Total Revenue</span>
                <span className="font-mono">{formatBDT(profitLoss.totalRevenue)}</span>
              </div>
            </div>

            {/* COGS */}
            <div>
              <div className="font-bold uppercase text-[11px] text-amber-600 dark:text-amber-400 mb-2">Less: Cost of Goods Sold (COGS)</div>
              {profitLoss.cogsLines.length === 0 ? (
                <div className="text-slate-400 italic">No posted COGS in selected period</div>
              ) : (
                profitLoss.cogsLines.map((l) => (
                  <div key={l.accountId} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span><span className="font-mono text-slate-400 mr-2">{l.accountCode}</span>{l.accountName}</span>
                    <span className="font-mono font-semibold">{formatBDT(l.amount)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between pt-2 px-3 py-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 font-bold text-sm text-blue-800 dark:text-blue-300 mt-2">
                <span>GROSS PROFIT</span>
                <span className="font-mono">{formatBDT(profitLoss.grossProfit)}</span>
              </div>
            </div>

            {/* Factory & Operating Expenses */}
            <div>
              <div className="font-bold uppercase text-[11px] text-rose-600 dark:text-rose-400 mb-2">Less: Factory, Operating & Depreciation Expenses</div>
              {[...profitLoss.factoryExpenseLines, ...profitLoss.operatingExpenseLines, ...profitLoss.depreciationLines].length === 0 ? (
                <div className="text-slate-400 italic">No posted operating/factory expenses in selected period</div>
              ) : (
                [...profitLoss.factoryExpenseLines, ...profitLoss.operatingExpenseLines, ...profitLoss.depreciationLines].map((l) => (
                  <div key={l.accountId} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span><span className="font-mono text-slate-400 mr-2">{l.accountCode}</span>{l.accountName} <span className="text-[10px] text-slate-400">({l.classification})</span></span>
                    <span className="font-mono font-semibold">{formatBDT(l.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-bold">
            <span>NET PROFIT / (LOSS)</span>
            <span className={`font-mono ${profitLoss.netProfitLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatBDT(profitLoss.netProfitLoss)}
            </span>
          </div>
        </div>
      )}

      {/* 4. CASH FLOW STATEMENT (INDIRECT METHOD) */}
      {statement === 'cash-flow' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="font-bold text-sm">Cash Flow Statement — Indirect Method ({fromDate} to {toDate})</span>
            <span
              className={`inline-flex items-center gap-1.5 font-bold ${
                cashFlow.isReconciled ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {cashFlow.isReconciled ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>
                {cashFlow.isReconciled
                  ? 'Reconciled with Cash & Bank GL'
                  : `Variance: ${formatBDT(cashFlow.difference)}`}
              </span>
            </span>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <div className="font-bold uppercase text-[11px] text-blue-600 dark:text-blue-400 mb-2">A. Cash Flows from Operating Activities</div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-semibold">
                <span>Net Profit / (Loss) for the Period</span>
                <span className="font-mono">{formatBDT(cashFlow.netProfit)}</span>
              </div>
              {[...cashFlow.operatingAdjustments, ...cashFlow.workingCapitalChanges].map((item, idx) => (
                <div key={idx} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <span>{item.label}</span>
                  <span className="font-mono">{formatBDT(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-bold">
                <span>Net Cash Provided by Operating Activities</span>
                <span className="font-mono">{formatBDT(cashFlow.netCashFromOperating)}</span>
              </div>
            </div>

            <div>
              <div className="font-bold uppercase text-[11px] text-purple-600 dark:text-purple-400 mb-2">B. Cash Flows from Investing Activities</div>
              {cashFlow.investingActivities.length === 0 ? (
                <div className="text-slate-400 italic py-1">No fixed asset purchases or disposals in this period</div>
              ) : (
                cashFlow.investingActivities.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span>{item.label}</span>
                    <span className="font-mono">{formatBDT(item.amount)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between pt-2 font-bold">
                <span>Net Cash Used in Investing Activities</span>
                <span className="font-mono">{formatBDT(cashFlow.netCashFromInvesting)}</span>
              </div>
            </div>

            <div>
              <div className="font-bold uppercase text-[11px] text-amber-600 dark:text-amber-400 mb-2">C. Cash Flows from Financing Activities</div>
              {cashFlow.financingActivities.length === 0 ? (
                <div className="text-slate-400 italic py-1">No loan or capital movements in this period</div>
              ) : (
                cashFlow.financingActivities.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span>{item.label}</span>
                    <span className="font-mono">{formatBDT(item.amount)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between pt-2 font-bold">
                <span>Net Cash Provided by Financing Activities</span>
                <span className="font-mono">{formatBDT(cashFlow.netCashFromFinancing)}</span>
              </div>
            </div>
          </div>

          <div className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between">
              <span className="font-semibold">Net Increase / (Decrease) in Cash & Bank</span>
              <span className="font-mono font-bold">{formatBDT(cashFlow.netChangeInCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Opening Cash & Bank Balance</span>
              <span className="font-mono font-bold">{formatBDT(cashFlow.openingCashAndBank)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-300 dark:border-slate-700">
              <span>Closing Cash & Bank Balance (Reconciled with Ledger: {formatBDT(cashFlow.closingCashAndBankLedger)})</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatBDT(cashFlow.closingCashAndBankComputed)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
