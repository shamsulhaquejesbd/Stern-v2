/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Accounts Receivable & Accounts Payable Sub-Ledgers Tab
 * Customer/Distributor AR & Supplier/Optimum JV AP reconciled against GL control heads,
 * with direct Receipt Voucher / Payment Voucher settlement actions.
 */

import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import { formatBDT, ROUND2 } from '../../utils/accountingEngine.ts';
import { ReceivableSubLedgerRow, PayableSubLedgerRow } from '../../types/accounting.ts';

interface AccountsReceivablePayableTabProps {
  mode: 'receivables' | 'payables';
}

export const AccountsReceivablePayableTab: React.FC<AccountsReceivablePayableTabProps> = ({ mode }) => {
  const {
    accounts,
    receivableSubLedger,
    payableSubLedger,
    arControlBalance,
    apControlBalance,
    optimumControlBalance,
    recordReceivableCollection,
    recordSupplierPayment,
  } = useCashBank();

  const [search, setSearch] = useState('');
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Settlement Modal State
  const [arModalTarget, setArModalTarget] = useState<ReceivableSubLedgerRow | null>(null);
  const [apModalTarget, setApModalTarget] = useState<PayableSubLedgerRow | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleAccountId, setSettleAccountId] = useState(accounts[0]?.id || '');
  const [settleRef, setSettleRef] = useState('');
  const [settleInvoiceOrGrn, setSettleInvoiceOrGrn] = useState('');
  const [settleRemarks, setSettleRemarks] = useState('');

  const showMsg = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5500);
  };

  const filteredAR = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receivableSubLedger.filter((r) => {
      if (onlyOutstanding && r.outstandingBalance <= 0.01) return false;
      if (q && !r.partyName.toLowerCase().includes(q) && !(r.phone || '').includes(q)) return false;
      return true;
    });
  }, [receivableSubLedger, search, onlyOutstanding]);

  const filteredAP = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payableSubLedger.filter((r) => {
      if (onlyOutstanding && r.outstandingBalance <= 0.01) return false;
      if (q && !r.supplierName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [payableSubLedger, search, onlyOutstanding]);

  const arTotalOutstanding = ROUND2(receivableSubLedger.reduce((s, r) => s + r.outstandingBalance, 0));
  const arTotalOverdue = ROUND2(receivableSubLedger.reduce((s, r) => s + r.overdueAmount, 0));

  const apSuppliersOutstanding = ROUND2(
    payableSubLedger.filter((p) => p.partyType !== 'Optimum JV').reduce((s, r) => s + r.outstandingBalance, 0)
  );
  const apOptimumOutstanding = ROUND2(
    payableSubLedger.filter((p) => p.partyType === 'Optimum JV').reduce((s, r) => s + r.outstandingBalance, 0)
  );

  const handleSubmitAR = (e: React.FormEvent) => {
    e.preventDefault();
    if (!arModalTarget) return;
    const res = recordReceivableCollection({
      partyId: arModalTarget.partyId,
      partyName: arModalTarget.partyName,
      partyType: arModalTarget.partyType,
      invoiceNo: settleInvoiceOrGrn || undefined,
      amount: parseFloat(settleAmount) || 0,
      date: settleDate,
      cashBankAccountId: settleAccountId,
      referenceNo: settleRef,
      remarks: settleRemarks,
    });
    if (res.success) {
      setArModalTarget(null);
      showMsg('success', res.message);
    } else {
      showMsg('error', res.message);
    }
  };

  const handleSubmitAP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apModalTarget) return;
    const res = recordSupplierPayment({
      supplierKey: apModalTarget.supplierKey,
      supplierName: apModalTarget.supplierName,
      partyType: apModalTarget.partyType,
      grnNumber: settleInvoiceOrGrn || undefined,
      amount: parseFloat(settleAmount) || 0,
      date: settleDate,
      cashBankAccountId: settleAccountId,
      referenceNo: settleRef,
      remarks: settleRemarks,
    });
    if (res.success) {
      setApModalTarget(null);
      showMsg('success', res.message);
    } else {
      showMsg('error', res.message);
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
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Reconciliation Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {mode === 'receivables' ? (
                <ArrowDownLeft className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />
              ) : (
                <ArrowUpRight className="w-4.5 h-4.5 text-orange-600 dark:text-orange-400" />
              )}
              <span>
                {mode === 'receivables'
                  ? 'Accounts Receivable (Customer & Distributor Sub-Ledger)'
                  : 'Accounts Payable (Supplier & Optimum JV Sub-Ledger)'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {mode === 'receivables'
                ? 'Tracks customer/distributor invoices, due dates, collections, and GL Receivable Control reconciliation.'
                : 'Tracks raw material GRN payables, Optimum JV clearing obligations, supplier payments, and GL Payable Control reconciliation.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {mode === 'receivables' ? (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Sub-Ledger Total Due</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {formatBDT(arTotalOutstanding)}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Overdue (&gt;30 Days)</div>
                <div className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                  {formatBDT(arTotalOverdue)}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">GL Control (1130 + 1131)</div>
                <div className="text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatBDT(arControlBalance)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">RM Supplier Sub-Ledger Due</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {formatBDT(apSuppliersOutstanding)}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Optimum JV Clearing Due</div>
                <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                  {formatBDT(apOptimumOutstanding)}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">GL Control (2110+2120+2130)</div>
                <div className="text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatBDT(ROUND2(apControlBalance + optimumControlBalance))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="relative flex-1 min-w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === 'receivables' ? 'Search customer or distributor...' : 'Search supplier or Optimum JV...'}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyOutstanding}
              onChange={(e) => setOnlyOutstanding(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Outstanding Balances Only</span>
          </label>
        </div>
      </div>

      {/* AR Table */}
      {mode === 'receivables' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filteredAR.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No Customer/Distributor receivable records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Customer / Distributor</th>
                    <th className="px-4 py-2.5 text-center font-semibold">Invoices</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Invoiced</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Received</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAR.map((row) => {
                    const isOpen = expandedKey === row.partyId;
                    return (
                      <React.Fragment key={row.partyId}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => setExpandedKey(isOpen ? null : row.partyId)}
                              className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white cursor-pointer"
                            >
                              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{row.partyName}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {row.partyType}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono">{row.invoiceCount}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{formatBDT(row.totalInvoiced)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{formatBDT(row.totalReceived)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatBDT(row.outstandingBalance)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => {
                                setArModalTarget(row);
                                setSettleAmount(row.outstandingBalance > 0 ? String(row.outstandingBalance) : '');
                                setSettleInvoiceOrGrn(row.invoices.find((i) => i.outstandingAmount > 0)?.invoiceNo || '');
                                setSettleRef('');
                                setSettleRemarks('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Receive</span>
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td colSpan={6} className="px-6 py-3 space-y-2">
                              <div className="text-[11px] font-bold uppercase text-slate-500">Invoice Breakdown</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {row.invoices.map((inv) => (
                                  <div
                                    key={inv.orderId}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between text-[11px]"
                                  >
                                    <div>
                                      <div className="font-mono font-bold text-blue-600">{inv.invoiceNo}</div>
                                      <div className="text-slate-500">
                                        Inv: {inv.invoiceDate} • Due: {inv.dueDate}
                                      </div>
                                    </div>
                                    <div className="text-right font-mono">
                                      <div>Due: <b>{formatBDT(inv.outstandingAmount)}</b></div>
                                      <div className="text-slate-400">of {formatBDT(inv.totalAmount)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AP Table */}
      {mode === 'payables' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filteredAP.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No Supplier or Optimum JV payable records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Supplier / JV Partner</th>
                    <th className="px-4 py-2.5 text-center font-semibold">GRNs / Bills</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Purchased / Billed</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAP.map((row) => {
                    const isOpen = expandedKey === row.supplierKey;
                    return (
                      <React.Fragment key={row.supplierKey}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => setExpandedKey(isOpen ? null : row.supplierKey)}
                              className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white cursor-pointer"
                            >
                              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{row.supplierName}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {row.partyType}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono">{row.billCount}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{formatBDT(row.totalPurchased)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{formatBDT(row.totalPaid)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatBDT(row.outstandingBalance)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => {
                                setApModalTarget(row);
                                setSettleAmount(row.outstandingBalance > 0 ? String(row.outstandingBalance) : '');
                                setSettleInvoiceOrGrn(row.bills.find((b) => b.outstandingAmount > 0)?.grnNumber || '');
                                setSettleRef('');
                                setSettleRemarks('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Pay</span>
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td colSpan={6} className="px-6 py-3 space-y-2">
                              <div className="text-[11px] font-bold uppercase text-slate-500">GRN / Charge Breakdown</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {row.bills.map((b) => (
                                  <div
                                    key={b.grnId}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between text-[11px]"
                                  >
                                    <div>
                                      <div className="font-mono font-bold text-blue-600">{b.grnNumber}</div>
                                      <div className="text-slate-500">Date: {b.purchaseDate}</div>
                                    </div>
                                    <div className="text-right font-mono">
                                      <div>Due: <b>{formatBDT(b.outstandingAmount)}</b></div>
                                      <div className="text-slate-400">of {formatBDT(b.totalAmount)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settlement Modal (shared UI for AR Collection & AP Payment) */}
      {(arModalTarget || apModalTarget) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {arModalTarget
                  ? `Record Receipt: ${arModalTarget.partyName}`
                  : `Supplier Payment: ${apModalTarget?.supplierName}`}
              </h3>
              <button
                onClick={() => {
                  setArModalTarget(null);
                  setApModalTarget(null);
                }}
                className="text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={arModalTarget ? handleSubmitAR : handleSubmitAP} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Amount (BDT) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {arModalTarget ? 'Deposit Into Cash / Bank Account *' : 'Pay From Cash / Bank Account *'}
                </label>
                <select
                  value={settleAccountId}
                  onChange={(e) => setSettleAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type}) — Bal: {formatBDT(a.currentBalanceBDT)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    {arModalTarget ? 'Invoice Ref' : 'GRN / Bill Ref'}
                  </label>
                  <input
                    type="text"
                    value={settleInvoiceOrGrn}
                    onChange={(e) => setSettleInvoiceOrGrn(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Cheque / Slip Ref *</label>
                  <input
                    type="text"
                    required
                    value={settleRef}
                    onChange={(e) => setSettleRef(e.target.value)}
                    placeholder="Ref / Txn ID"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Remarks</label>
                <input
                  type="text"
                  value={settleRemarks}
                  onChange={(e) => setSettleRemarks(e.target.value)}
                  placeholder="Optional payment note"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setArModalTarget(null);
                    setApModalTarget(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  Post Double-Entry Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
