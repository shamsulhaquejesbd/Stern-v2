/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Double-Entry Journal Voucher Management Tab
 * Supports General, Payment, Receipt, Contra, and Adjustment Vouchers,
 * multi-line Debit/Credit builder, Draft -> Approval -> Post workflow,
 * strict immutability once Posted, and audited Reversal Vouchers.
 */

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  Send,
  ShieldCheck,
  RotateCcw,
  Trash2,
  X,
  AlertCircle,
  Printer,
  Edit3,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import { JournalVoucher, VoucherType, VoucherStatus } from '../../types/accounting.ts';
import { formatBDT, ROUND2 } from '../../utils/accountingEngine.ts';

interface VoucherLineDraft {
  key: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  partyName: string;
  costCenter: string;
}

const VOUCHER_TYPES: VoucherType[] = [
  'General Journal',
  'Payment Voucher',
  'Receipt Voucher',
  'Contra Voucher',
  'Adjustment Voucher',
];

export const JournalVouchersTab: React.FC = () => {
  const {
    coaAccounts,
    vouchers,
    saveVoucher,
    submitVoucherForApproval,
    approveVoucher,
    postVoucher,
    reverseVoucher,
  } = useCashBank();

  const postableAccounts = useMemo(
    () => coaAccounts.filter((a) => !a.isGroup && a.isActive).sort((a, b) => a.code.localeCompare(b.code)),
    [coaAccounts]
  );

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Builder Modal State
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [voucherType, setVoucherType] = useState<VoucherType>('General Journal');
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState('');
  const [partyName, setPartyName] = useState('');
  const [description, setDescription] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [lines, setLines] = useState<VoucherLineDraft[]>([]);

  // Detail & Reversal Modals
  const [viewVoucher, setViewVoucher] = useState<JournalVoucher | null>(null);
  const [reverseTarget, setReverseTarget] = useState<JournalVoucher | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const toast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5500);
  };

  const openNewVoucherModal = () => {
    setEditingId(undefined);
    setVoucherType('General Journal');
    setVoucherDate(new Date().toISOString().slice(0, 10));
    setReferenceNo('');
    setPartyName('');
    setDescription('');
    setAttachmentName('');
    setLines([
      { key: 'l1', accountId: postableAccounts[0]?.id || '', description: '', debit: '', credit: '', partyName: '', costCenter: '' },
      { key: 'l2', accountId: postableAccounts[1]?.id || postableAccounts[0]?.id || '', description: '', debit: '', credit: '', partyName: '', costCenter: '' },
    ]);
    setShowBuilder(true);
  };

  const openEditDraftModal = (v: JournalVoucher) => {
    setEditingId(v.id);
    setVoucherType(v.voucherType);
    setVoucherDate(v.voucherDate);
    setReferenceNo(v.referenceNo);
    setPartyName(v.partyName || '');
    setDescription(v.description);
    setAttachmentName(v.attachmentName || '');
    setLines(
      v.lines.map((l, idx) => ({
        key: `ed-${idx}-${l.id}`,
        accountId: l.accountId,
        description: l.description || '',
        debit: l.debit > 0 ? String(l.debit) : '',
        credit: l.credit > 0 ? String(l.credit) : '',
        partyName: l.partyName || '',
        costCenter: l.costCenter || '',
      }))
    );
    setShowBuilder(true);
  };

  const draftTotals = useMemo(() => {
    const dr = ROUND2(lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0));
    const cr = ROUND2(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0));
    const diff = ROUND2(Math.abs(dr - cr));
    return { dr, cr, diff, balanced: dr > 0 && diff <= 0.01 };
  }, [lines]);

  const handleSaveDraftOrPost = (postNow: boolean) => {
    const res = saveVoucher({
      id: editingId,
      voucherType,
      voucherDate,
      referenceNo,
      description: description || `${voucherType} dated ${voucherDate}`,
      partyName: partyName || undefined,
      attachmentName: attachmentName || undefined,
      postImmediately: postNow,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        partyName: l.partyName || partyName || undefined,
        costCenter: l.costCenter || undefined,
      })),
    });

    if (res.success) {
      setShowBuilder(false);
      toast('success', res.message);
    } else {
      toast('error', res.message);
    }
  };

  const filteredVouchers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (typeFilter !== 'All' && v.voucherType !== typeFilter) return false;
      if (statusFilter !== 'All' && v.status !== statusFilter) return false;
      if (
        q &&
        !v.voucherNo.toLowerCase().includes(q) &&
        !v.description.toLowerCase().includes(q) &&
        !(v.referenceNo || '').toLowerCase().includes(q) &&
        !(v.partyName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [vouchers, search, typeFilter, statusFilter]);

  const statusBadge = (st: VoucherStatus) => {
    const cls =
      st === 'Posted'
        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
        : st === 'Reversed'
        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        : st === 'Approved'
        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
        : st === 'Pending Approval'
        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{st}</span>;
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
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              <span>Double-Entry Journal Voucher Management</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Prepare, approve, post, and audit-reverse General, Payment, Receipt, Contra, and Adjustment vouchers. Posted entries are immutable.
            </p>
          </div>
          <button
            onClick={openNewVoucherModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Journal Voucher</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="relative md:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher no, reference, party, or description..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          >
            <option value="All">All Voucher Types</option>
            {[
              ...VOUCHER_TYPES,
              'Opening Journal',
              'Sales Journal',
              'Purchase Journal',
              'Inventory & Production Journal',
              'Payroll Journal',
              'Year-End Closing Journal',
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          >
            <option value="All">All Workflow Statuses</option>
            {(['Draft', 'Pending Approval', 'Approved', 'Posted', 'Reversed'] as VoucherStatus[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredVouchers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No vouchers match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Voucher No</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Type & Source</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Description / Party</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total Debit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total Credit</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredVouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {v.voucherNo}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {v.voucherDate}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{v.voucherType}</div>
                      <div className="text-[10px] text-slate-400">{v.sourceModule || 'Manual'}</div>
                    </td>
                    <td className="px-4 py-2.5 max-w-sm">
                      <div className="truncate text-slate-800 dark:text-slate-200">{v.description}</div>
                      {v.partyName && (
                        <div className="text-[10px] text-slate-500">Party: {v.partyName}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatBDT(v.totalDebit)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatBDT(v.totalCredit)}
                    </td>
                    <td className="px-4 py-2.5 text-center">{statusBadge(v.status)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setViewVoucher(v)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Inspect Voucher Lines"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {v.status === 'Draft' && (
                          <>
                            <button
                              onClick={() => openEditDraftModal(v)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 cursor-pointer"
                              title="Edit Draft"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                const r = submitVoucherForApproval(v.id);
                                toast(r.success ? 'success' : 'error', r.message);
                              }}
                              className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-600 cursor-pointer"
                              title="Submit for Approval"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {(v.status === 'Draft' || v.status === 'Pending Approval') && (
                          <button
                            onClick={() => {
                              const r = approveVoucher(v.id);
                              toast(r.success ? 'success' : 'error', r.message);
                            }}
                            className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 cursor-pointer"
                            title="Approve Voucher"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {(v.status === 'Draft' || v.status === 'Approved') && (
                          <button
                            onClick={() => {
                              const r = postVoucher(v.id);
                              toast(r.success ? 'success' : 'error', r.message);
                            }}
                            className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 cursor-pointer"
                            title="Post to General Ledger"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {v.status === 'Posted' && !v.reversedByVoucherId && (
                          <button
                            onClick={() => {
                              setReverseTarget(v);
                              setReverseReason('');
                            }}
                            className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 cursor-pointer"
                            title="Reverse Posted Voucher"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Multi-line Journal Voucher Builder Modal */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingId ? 'Edit Draft Journal Voucher' : 'Create Multi-Line Journal Voucher'}
              </h3>
              <button onClick={() => setShowBuilder(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Voucher Type *
                  </label>
                  <select
                    value={voucherType}
                    onChange={(e) => setVoucherType(e.target.value as VoucherType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {VOUCHER_TYPES.map((vt) => (
                      <option key={vt} value={vt}>
                        {vt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Voucher Date *
                  </label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reference No
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Bill / Slip / Memo #"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Party / Counterparty
                  </label>
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="Customer / Vendor / Staff"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Narration / Description *
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the accounting transaction..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Supporting Document Name
                  </label>
                  <input
                    type="text"
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                    placeholder="e.g., Invoice_Scan_104.pdf"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left">Account Head *</th>
                      <th className="px-3 py-2 text-left">Line Narration</th>
                      <th className="px-3 py-2 text-right">Debit (BDT)</th>
                      <th className="px-3 py-2 text-right">Credit (BDT)</th>
                      <th className="px-3 py-2 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lines.map((line) => (
                      <tr key={line.key}>
                        <td className="px-3 py-2 min-w-64">
                          <select
                            value={line.accountId}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x) => (x.key === line.key ? { ...x, accountId: e.target.value } : x))
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            {postableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} — {a.name} ({a.category})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 min-w-44">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x) => (x.key === line.key ? { ...x, description: e.target.value } : x))
                              )
                            }
                            placeholder="Line note"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </td>
                        <td className="px-3 py-2 w-36">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === line.key ? { ...x, debit: e.target.value, credit: e.target.value ? '' : x.credit } : x
                                )
                              )
                            }
                            placeholder="0.00"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-mono"
                          />
                        </td>
                        <td className="px-3 py-2 w-36">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.key === line.key ? { ...x, credit: e.target.value, debit: e.target.value ? '' : x.debit } : x
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
                            disabled={lines.length <= 2}
                            onClick={() => setLines((prev) => prev.filter((x) => x.key !== line.key))}
                            className="p-1 text-rose-500 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 font-bold">
                    <tr>
                      <td colSpan={2} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) => [
                              ...prev,
                              {
                                key: `l-${Date.now()}`,
                                accountId: postableAccounts[0]?.id || '',
                                description: '',
                                debit: '',
                                credit: '',
                                partyName: '',
                                costCenter: '',
                              },
                            ])
                          }
                          className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          + Add Accounting Line
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatBDT(draftTotals.dr)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatBDT(draftTotals.cr)}</td>
                      <td className="px-3 py-2 text-center text-[10px]">
                        {draftTotals.balanced ? (
                          <span className="text-emerald-600">BALANCED</span>
                        ) : (
                          <span className="text-rose-600">Δ {formatBDT(draftTotals.diff)}</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draftTotals.balanced}
                onClick={() => handleSaveDraftOrPost(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={!draftTotals.balanced}
                onClick={() => handleSaveDraftOrPost(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                Post to General Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Voucher Modal */}
      {viewVoucher && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                  {viewVoucher.voucherNo}
                </span>
                <span className="ml-2 text-xs text-slate-500">{viewVoucher.voucherType}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Print Voucher"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setViewVoucher(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                <div><span className="text-slate-500">Date:</span> <b className="font-mono">{viewVoucher.voucherDate}</b></div>
                <div><span className="text-slate-500">Status:</span> {statusBadge(viewVoucher.status)}</div>
                <div><span className="text-slate-500">Reference:</span> <b>{viewVoucher.referenceNo || 'N/A'}</b></div>
                <div><span className="text-slate-500">Source:</span> <b>{viewVoucher.sourceModule || 'Manual'}</b></div>
                <div className="col-span-2"><span className="text-slate-500">Description:</span> <b>{viewVoucher.description}</b></div>
                <div><span className="text-slate-500">Prepared By:</span> {viewVoucher.preparedBy}</div>
                <div><span className="text-slate-500">Approved / Posted:</span> {viewVoucher.postedBy || viewVoucher.approvedBy || 'Pending'}</div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Line Note</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {viewVoucher.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-medium">
                          <span className="font-mono text-slate-500 mr-1.5">{l.accountCode}</span>
                          {l.accountName}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{l.description}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {l.debit > 0 ? formatBDT(l.debit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {l.credit > 0 ? formatBDT(l.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold border-t border-slate-200 dark:border-slate-800">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right">Totals</td>
                      <td className="px-3 py-2 text-right font-mono">{formatBDT(viewVoucher.totalDebit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatBDT(viewVoucher.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Posted Voucher Modal */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
                Reverse Posted Voucher: {reverseTarget.voucherNo}
              </h3>
              <button onClick={() => setReverseTarget(null)} className="text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Per audit controls, posted vouchers are immutable and cannot be deleted. Reversing will post an equal-and-opposite Adjustment Voucher mirroring all Debit/Credit lines.
            </p>
            <div>
              <label className="block font-semibold mb-1">Reversal Reason (min 5 characters) *</label>
              <textarea
                rows={3}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="State reason for reversal..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReverseTarget(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const res = reverseVoucher(reverseTarget.id, reverseReason);
                  if (res.success) {
                    setReverseTarget(null);
                    toast('success', res.message);
                  } else {
                    toast('error', res.message);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
