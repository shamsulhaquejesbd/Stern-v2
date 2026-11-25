/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Hierarchical Chart of Accounts (COA) Management Tab
 * Unlimited parent & multi-level child accounts across Assets, Liabilities,
 * Equity, Revenue, and Expenses with safe deactivation instead of deletion
 * when transactions exist.
 */

import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  Plus,
  Search,
  Edit3,
  Power,
  Trash2,
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useCashBank } from '../../context/CashBankContext.tsx';
import {
  COAAccount,
  COACategory,
  StatementClassification,
} from '../../types/accounting.ts';
import { formatBDT } from '../../utils/accountingEngine.ts';

const CLASSIFICATIONS_BY_CATEGORY: Record<COACategory, StatementClassification[]> = {
  Asset: ['Current Asset', 'Non-Current Asset', 'Contra Asset'],
  Liability: ['Current Liability', 'Long-Term Liability'],
  Equity: ['Shareholders Equity'],
  Revenue: ['Operating Revenue', 'Non-Operating Income'],
  Expense: ['Cost of Goods Sold', 'Factory Expense', 'Operating Expense', 'Depreciation & Amortization'],
};

interface ChartOfAccountsTabProps {
  onViewLedger?: (accountId: string) => void;
}

export const ChartOfAccountsTab: React.FC<ChartOfAccountsTabProps> = ({ onViewLedger }) => {
  const {
    coaAccounts,
    getCOAAccountBalance,
    createCOAAccount,
    updateCOAAccount,
    toggleCOAAccountStatus,
    deleteCOAAccount,
  } = useCashBank();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    coaAccounts.filter((a) => a.level <= 2).forEach((a) => {
      init[a.id] = true;
    });
    return init;
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<COAAccount | null>(null);

  // Modal Form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<COACategory>('Asset');
  const [formClassification, setFormClassification] = useState<StatementClassification>('Current Asset');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formIsGroup, setFormIsGroup] = useState(false);
  const [formIsContra, setFormIsContra] = useState(false);
  const [formDescription, setFormDescription] = useState('');

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const openCreateModal = (defaultParent?: COAAccount) => {
    setEditingAccount(null);
    setFormCode('');
    setFormName('');
    const cat = defaultParent ? defaultParent.category : 'Asset';
    setFormCategory(cat);
    setFormClassification(
      defaultParent ? defaultParent.classification : CLASSIFICATIONS_BY_CATEGORY[cat][0]
    );
    setFormParentId(defaultParent ? defaultParent.id : '');
    setFormIsGroup(false);
    setFormIsContra(Boolean(defaultParent?.isContra));
    setFormDescription('');
    setShowModal(true);
  };

  const openEditModal = (acc: COAAccount) => {
    setEditingAccount(acc);
    setFormCode(acc.code);
    setFormName(acc.name);
    setFormCategory(acc.category);
    setFormClassification(acc.classification);
    setFormParentId(acc.parentId || '');
    setFormIsGroup(acc.isGroup);
    setFormIsContra(Boolean(acc.isContra));
    setFormDescription(acc.description || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      const res = updateCOAAccount(editingAccount.id, {
        code: formCode,
        name: formName,
        classification: formClassification,
        description: formDescription,
      });
      if (res.success) {
        setShowModal(false);
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
      return;
    }

    const res = createCOAAccount({
      code: formCode,
      name: formName,
      category: formCategory,
      classification: formClassification,
      parentId: formParentId || null,
      isGroup: formIsGroup,
      isContra: formIsContra,
      description: formDescription,
    });
    if (res.success) {
      if (formParentId) setExpandedIds((prev) => ({ ...prev, [formParentId]: true }));
      setShowModal(false);
      showToast('success', res.message);
    } else {
      showToast('error', res.message);
    }
  };

  const groupAccounts = useMemo(
    () => coaAccounts.filter((a) => a.isGroup).sort((a, b) => a.code.localeCompare(b.code)),
    [coaAccounts]
  );

  // Build ordered hierarchical rows or filtered flat list when searching
  const isFiltering = Boolean(search.trim()) || categoryFilter !== 'All' || statusFilter !== 'All';

  const displayRows = useMemo(() => {
    const sorted = [...coaAccounts].sort((a, b) => a.code.localeCompare(b.code));
    if (isFiltering) {
      const q = search.trim().toLowerCase();
      return sorted.filter((a) => {
        if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
        if (statusFilter === 'Active' && !a.isActive) return false;
        if (statusFilter === 'Inactive' && a.isActive) return false;
        if (
          q &&
          !a.code.toLowerCase().includes(q) &&
          !a.name.toLowerCase().includes(q) &&
          !a.classification.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
    }

    const ordered: COAAccount[] = [];
    const visit = (parentId: string | null) => {
      sorted
        .filter((a) => (a.parentId || null) === parentId)
        .forEach((node) => {
          ordered.push(node);
          if (node.isGroup && expandedIds[node.id]) {
            visit(node.id);
          }
        });
    };
    visit(null);
    return ordered;
  }, [coaAccounts, isFiltering, search, categoryFilter, statusFilter, expandedIds]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { Asset: 0, Liability: 0, Equity: 0, Revenue: 0, Expense: 0 };
    coaAccounts.forEach((a) => {
      if (!a.isGroup) map[a.category] = (map[a.category] || 0) + 1;
    });
    return map;
  }, [coaAccounts]);

  const toggleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    coaAccounts.filter((a) => a.isGroup).forEach((a) => {
      next[a.id] = expand;
    });
    setExpandedIds(next);
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-semibold ${
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

      {/* Header & Summary Category Chips */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderTree className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              <span>Chart of Accounts (Hierarchical COA)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Create unlimited parent groups and multi-level sub-accounts across Assets, Liabilities, Equity, Revenue, and Expenses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => toggleExpandAll(true)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Expand All
            </button>
            <button
              onClick={() => toggleExpandAll(false)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Collapse All
            </button>
            <button
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Account / Group</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="relative md:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by account code, name, or classification..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
          >
            <option value="All">All 5 Categories ({coaAccounts.filter((a) => !a.isGroup).length} Ledgers)</option>
            {(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as COACategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({categoryCounts[cat] || 0})
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Hierarchical COA Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Code</th>
                <th className="px-4 py-2.5 text-left font-semibold">Account Hierarchy / Name</th>
                <th className="px-4 py-2.5 text-left font-semibold">Category & Classification</th>
                <th className="px-4 py-2.5 text-center font-semibold">Normal</th>
                <th className="px-4 py-2.5 text-right font-semibold">Live GL Balance (BDT)</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayRows.map((acc) => {
                const bal = getCOAAccountBalance(acc.id);
                const indentPx = isFiltering ? 0 : Math.max(0, (acc.level - 1) * 18);
                const isExpanded = Boolean(expandedIds[acc.id]);

                return (
                  <tr
                    key={acc.id}
                    className={`transition-colors ${
                      acc.isGroup
                        ? 'bg-slate-50/70 dark:bg-slate-800/30 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    } ${!acc.isActive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {acc.code}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${indentPx}px` }}>
                        {acc.isGroup ? (
                          <button
                            onClick={() =>
                              setExpandedIds((prev) => ({ ...prev, [acc.id]: !prev[acc.id] }))
                            }
                            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4 inline-block" />
                        )}
                        {acc.isGroup ? (
                          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                        <span className="text-slate-900 dark:text-white">{acc.name}</span>
                        {acc.linkedCashBankAccountId && (
                          <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">
                            Cash/Bank Linked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{acc.category}</span>
                      <span className="text-slate-400 mx-1">•</span>
                      <span className="text-slate-500 dark:text-slate-400">{acc.classification}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          acc.normalBalance === 'Debit'
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                        }`}
                      >
                        {acc.normalBalance}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {!acc.isGroup && onViewLedger ? (
                        <button
                          onClick={() => onViewLedger(acc.id)}
                          className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                          title="Open General Ledger for this account"
                        >
                          {formatBDT(bal)}
                        </button>
                      ) : (
                        formatBDT(bal)
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          acc.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {acc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {acc.isGroup && (
                          <button
                            onClick={() => openCreateModal(acc)}
                            className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 cursor-pointer"
                            title="Add Child Account under this Parent"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(acc)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                          title="Edit Account"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const res = toggleCOAAccountStatus(acc.id);
                            showToast(res.success ? 'success' : 'error', res.message);
                          }}
                          className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 cursor-pointer"
                          title={acc.isActive ? 'Deactivate Account' : 'Activate Account'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        {!acc.isSystem && (
                          <button
                            onClick={() => {
                              const res = deleteCOAAccount(acc.id);
                              showToast(res.success ? 'success' : 'error', res.message);
                            }}
                            className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer"
                            title="Delete Account (blocked if posted entries exist)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit COA Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingAccount
                  ? `Edit Account: ${editingAccount.code} - ${editingAccount.name}`
                  : 'Create New Chart of Accounts Head'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
              {!editingAccount && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Account Category *
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => {
                        const c = e.target.value as COACategory;
                        setFormCategory(c);
                        setFormClassification(CLASSIFICATIONS_BY_CATEGORY[c][0]);
                        setFormParentId('');
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as COACategory[]).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Parent Group (Optional)
                    </label>
                    <select
                      value={formParentId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setFormParentId(pid);
                        const p = coaAccounts.find((a) => a.id === pid);
                        if (p) {
                          setFormCategory(p.category);
                          setFormClassification(p.classification);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value="">-- Top Level Root --</option>
                      {groupAccounts
                        .filter((g) => g.category === formCategory)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.code} - {g.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Code
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="Auto if blank"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Factory Generator Fuel / BRAC Bank PLC"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Financial Statement Classification *
                </label>
                <select
                  value={formClassification}
                  onChange={(e) => setFormClassification(e.target.value as StatementClassification)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {CLASSIFICATIONS_BY_CATEGORY[formCategory].map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              {!editingAccount && (
                <div className="flex items-center gap-6 py-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsGroup}
                      onChange={(e) => setFormIsGroup(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Is Parent Group Header (contains child accounts)
                    </span>
                  </label>
                  {formCategory === 'Asset' && (
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsContra}
                        onChange={(e) => setFormIsContra(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Contra Asset (Credit normal)
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional usage notes for accounting team..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
