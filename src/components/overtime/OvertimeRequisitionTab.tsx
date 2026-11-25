/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Overtime Requisition Page
 * Factory capacity requisition workflow -> Head Office Approval -> Overtime Granted.
 * Approval authorizes overtime capacity only and does NOT auto-create attendance or payroll entries.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useERP } from '../../context/ERPContext.tsx';
import {
  OvertimeRequisition,
  OvertimeRequisitionPurposeItem,
  OvertimeRequisitionStatus,
} from '../../types/overtime.ts';
import {
  computeOvertimeRequisitionSummary,
  doesActorMatchRequester,
  filterOvertimeRequisitions,
  generateNextRequisitionNumber,
  getTodayIsoDate,
  validateOvertimeRequisitionPayload,
  type RequisitionDecisionAction,
} from '../../lib/overtimeRequisitionEngine.ts';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Edit3,
  Eye,
  Filter,
  History,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';

function formatDisplayDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getRequisitionStatusBadgeClass(status: OvertimeRequisitionStatus): string {
  switch (status) {
    case 'Approved':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    case 'Rejected':
      return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    case 'Returned for Correction':
      return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    case 'Pending Approval':
    default:
      return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
  }
}

export const OvertimeRequisitionTab: React.FC = () => {
  const {
    currentUser,
    hasPageAction,
    payrollSettings,
    overtimeRequisitions,
    refreshOvertimeRequisitions,
    clearOvertimeRequisitionsLocalData,
    createOvertimeRequisition,
    updateOvertimeRequisition,
    decideOvertimeRequisition,
  } = useERP();

  const canAccessRequisition = hasPageAction
    ? hasPageAction('overtime-management', 'view_requisition')
    : currentUser.role === 'Super Admin';
  const canApproveRequisition = hasPageAction
    ? hasPageAction('overtime-management', 'approve_requisition')
    : currentUser.role === 'Super Admin';

  // Master Overtime Purposes from Payroll Settings (strictly live settings, no mock fallback)
  const activePayrollPurposes = useMemo(() => {
    const raw = Array.isArray(payrollSettings?.overtimePurposes)
      ? payrollSettings.overtimePurposes
      : [];
    return raw.filter((p) => p.isActive !== false);
  }, [payrollSettings?.overtimePurposes]);

  // Form State (Create or Edit/Resubmit Returned Requisition)
  const [editingRequisition, setEditingRequisition] = useState<OvertimeRequisition | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [overtimeDate, setOvertimeDate] = useState<string>(() => getTodayIsoDate());
  const [requiredWorkers, setRequiredWorkers] = useState<string>('');
  const [requestedHours, setRequestedHours] = useState<string>('');
  const [selectedPurposes, setSelectedPurposes] = useState<OvertimeRequisitionPurposeItem[]>([]);
  const [isPurposeDropdownOpen, setIsPurposeDropdownOpen] = useState<boolean>(false);
  const [purposeSearch, setPurposeSearch] = useState<string>('');
  const [manualPurposeInput, setManualPurposeInput] = useState<string>('');
  const [editingCustomPurposeId, setEditingCustomPurposeId] = useState<string | null>(null);
  const [editingCustomPurposeText, setEditingCustomPurposeText] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmittingForm, setIsSubmittingForm] = useState<boolean>(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Filters & Table State
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [overtimeDateFilter, setOvertimeDateFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [requestedByFilter, setRequestedByFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Purge any local/session storage memory and fetch authoritative requisitions from Supabase on mount/user switch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      for (const store of [localStorage, sessionStorage]) {
        try {
          for (let i = store.length - 1; i >= 0; i--) {
            const key = store.key(i);
            if (
              key &&
              (key.startsWith('ensec_overtime_requisition') ||
                key.startsWith('ensec_granted_overtime_requisition'))
            ) {
              store.removeItem(key);
            }
          }
        } catch {}
      }
    }

    if ((!canAccessRequisition && !canApproveRequisition) || !currentUser?.id || currentUser.id === 'guest') {
      return;
    }
    let cancelled = false;
    setIsRefreshing(true);
    setLoadError(null);
    void refreshOvertimeRequisitions()
      .then((res) => {
        if (!cancelled && res && !res.success && res.error) {
          setLoadError(res.error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, canAccessRequisition, canApproveRequisition]);

  // Detail & Head Office Decision Modal State
  const [activeModalReqId, setActiveModalReqId] = useState<string | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState<string>('');
  const [decisionFeedback, setDecisionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);

  const todayDate = getTodayIsoDate();
  const previewRequisitionNumber = useMemo(
    () =>
      editingRequisition
        ? editingRequisition.requisitionNumber
        : generateNextRequisitionNumber(overtimeRequisitions),
    [editingRequisition, overtimeRequisitions]
  );

  // Scope visible records: Head Office approvers see all; Factory users without approval see their own
  const scopedRequisitions = useMemo(() => {
    if (canApproveRequisition) return overtimeRequisitions;
    return overtimeRequisitions.filter((r) => doesActorMatchRequester(r, currentUser));
  }, [overtimeRequisitions, canApproveRequisition, currentUser]);

  const summaryCounts = useMemo(
    () => computeOvertimeRequisitionSummary(scopedRequisitions),
    [scopedRequisitions]
  );

  const requestersList = useMemo(() => {
    const names = new Set<string>();
    scopedRequisitions.forEach((r) => {
      if (r.requestedByName) names.add(r.requestedByName);
    });
    return Array.from(names).sort();
  }, [scopedRequisitions]);

  const filteredRequisitions = useMemo(
    () =>
      filterOvertimeRequisitions(scopedRequisitions, {
        dateFrom,
        dateTo,
        overtimeDate: overtimeDateFilter,
        status: statusFilter,
        requestedBy: requestedByFilter,
        search: searchQuery,
      }),
    [scopedRequisitions, dateFrom, dateTo, overtimeDateFilter, statusFilter, requestedByFilter, searchQuery]
  );

  const activeModalReq = useMemo(
    () => overtimeRequisitions.find((r) => r.id === activeModalReqId) || null,
    [overtimeRequisitions, activeModalReqId]
  );

  const filteredDropdownPurposes = useMemo(() => {
    const q = purposeSearch.trim().toLowerCase();
    if (!q) return activePayrollPurposes;
    return activePayrollPurposes.filter((p) => p.name.toLowerCase().includes(q));
  }, [activePayrollPurposes, purposeSearch]);

  if (!canAccessRequisition && !canApproveRequisition) {
    return (
      <div className="p-8 max-w-md mx-auto mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-3">
        <div className="w-11 h-11 mx-auto rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Overtime Requisition Access Restricted
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your account requires <strong>Overtime Requisition</strong> or{' '}
          <strong>Overtime Requisition Approval</strong> permission under Users &amp; Permissions.
        </p>
      </div>
    );
  }

  const togglePayrollPurpose = (purposeId: string, purposeName: string) => {
    setSelectedPurposes((prev) => {
      const exists = prev.some(
        (p) =>
          (p.payrollPurposeId && p.payrollPurposeId === purposeId) ||
          p.purposeName.trim().toLowerCase() === purposeName.trim().toLowerCase()
      );
      if (exists) {
        return prev.filter(
          (p) =>
            p.payrollPurposeId !== purposeId &&
            p.purposeName.trim().toLowerCase() !== purposeName.trim().toLowerCase()
        );
      }
      return [
        ...prev,
        {
          id: `otrp-set-${purposeId}-${Date.now()}`,
          payrollPurposeId: purposeId,
          purposeName: purposeName.trim(),
          isCustom: false,
        },
      ];
    });
  };

  const handleAddManualPurpose = () => {
    const clean = manualPurposeInput.trim();
    if (!clean) return;
    const exists = selectedPurposes.some(
      (p) => p.purposeName.trim().toLowerCase() === clean.toLowerCase()
    );
    if (exists) {
      setManualPurposeInput('');
      return;
    }
    setSelectedPurposes((prev) => [
      ...prev,
      {
        id: `otrp-custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        purposeName: clean,
        isCustom: true,
      },
    ]);
    setManualPurposeInput('');
  };

  const handleSaveCustomPurposeEdit = (id: string) => {
    const clean = editingCustomPurposeText.trim();
    if (!clean) return;
    const duplicate = selectedPurposes.some(
      (p) => p.id !== id && p.purposeName.trim().toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      setFormFeedback({
        type: 'error',
        message: `Purpose "${clean}" is already listed in this requisition.`,
      });
      return;
    }
    setSelectedPurposes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, purposeName: clean } : p))
    );
    setEditingCustomPurposeId(null);
    setEditingCustomPurposeText('');
  };

  const handleRemoveSelectedPurpose = (id: string) => {
    setSelectedPurposes((prev) => prev.filter((p) => p.id !== id));
    if (editingCustomPurposeId === id) {
      setEditingCustomPurposeId(null);
      setEditingCustomPurposeText('');
    }
  };

  const resetForm = () => {
    setEditingRequisition(null);
    setOvertimeDate(getTodayIsoDate());
    setRequiredWorkers('');
    setRequestedHours('');
    setSelectedPurposes([]);
    setManualPurposeInput('');
    setEditingCustomPurposeId(null);
    setEditingCustomPurposeText('');
    setRemarks('');
    setIsPurposeDropdownOpen(false);
  };

  const startEditReturnedRequisition = (req: OvertimeRequisition) => {
    if (req.status !== 'Returned for Correction') return;
    setEditingRequisition(req);
    setIsFormOpen(true);
    setOvertimeDate(req.overtimeDate);
    setRequiredWorkers(String(req.requiredWorkers));
    setRequestedHours(String(req.requestedHours));
    setSelectedPurposes(
      (req.purposes || []).map((p) => ({
        ...p,
        id: p.id || `otrp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      }))
    );
    setRemarks(req.remarks || '');
    setFormFeedback(null);
    setActiveModalReqId(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAccessRequisition || isSubmittingForm) return;
    setFormFeedback(null);

    const validation = validateOvertimeRequisitionPayload({
      overtimeDate,
      requiredWorkers,
      requestedHours,
      purposes: selectedPurposes,
      remarks,
    });

    if (!validation.valid) {
      setFormFeedback({ type: 'error', message: validation.error || 'Invalid requisition inputs.' });
      return;
    }

    setIsSubmittingForm(true);
    try {
      const payload = {
        overtimeDate: validation.overtimeDate!,
        requiredWorkers: validation.requiredWorkers!,
        requestedHours: validation.requestedHours!,
        purposes: validation.purposes!,
        remarks: validation.remarks,
      };

      const res = editingRequisition
        ? await updateOvertimeRequisition(editingRequisition.id, payload)
        : await createOvertimeRequisition(payload);

      if (!res.success || !res.dbSynced || !res.requisition) {
        setFormFeedback({
          type: 'error',
          message:
            res.error ||
            'Could not save overtime requisition in Supabase. Please check your connection and try again.',
        });
        return;
      }

      const actionLabel = editingRequisition
        ? `Resubmitted ${res.requisition.requisitionNumber} to Head Office for approval and saved to Supabase.`
        : `Submitted ${res.requisition.requisitionNumber} for Head Office approval and saved to Supabase.`;

      setFormFeedback({
        type: 'success',
        message: actionLabel,
      });
      setLoadError(null);
      resetForm();
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleDecision = async (decision: RequisitionDecisionAction) => {
    if (!activeModalReq || !canApproveRequisition || isSubmittingDecision) return;
    setDecisionFeedback(null);

    const cleanRemarks = decisionRemarks.trim();
    if ((decision === 'REJECT' || decision === 'RETURN') && !cleanRemarks) {
      setDecisionFeedback({
        type: 'error',
        message:
          decision === 'REJECT'
            ? 'Please enter remarks explaining why this requisition is rejected.'
            : 'Please enter correction instructions before returning this requisition.',
      });
      return;
    }

    setIsSubmittingDecision(true);
    try {
      const res = await decideOvertimeRequisition(activeModalReq.id, decision, cleanRemarks);
      if (!res.success || !res.dbSynced || !res.requisition) {
        setDecisionFeedback({
          type: 'error',
          message: res.error || 'Failed to save Head Office decision to Supabase.',
        });
        return;
      }

      const msg =
        decision === 'APPROVE'
          ? `${res.requisition.requisitionNumber} approved and marked "Overtime Granted".`
          : decision === 'RETURN'
          ? `${res.requisition.requisitionNumber} returned to requester for correction.`
          : `${res.requisition.requisitionNumber} rejected.`;

      setDecisionFeedback({ type: 'success', message: msg });
      setDecisionRemarks('');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const res = await refreshOvertimeRequisitions();
      if (res && !res.success && res.error) {
        setLoadError(res.error);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearLocalData = async () => {
    setIsRefreshing(true);
    setLoadError(null);
    setSessionNotice(null);
    resetForm();
    setDateFrom('');
    setDateTo('');
    setOvertimeDateFilter('');
    setStatusFilter('all');
    setRequestedByFilter('all');
    setSearchQuery('');
    setActiveModalReqId(null);
    setDecisionRemarks('');
    setDecisionFeedback(null);
    setFormFeedback(null);
    try {
      const res = await clearOvertimeRequisitionsLocalData();
      if (res && !res.success && res.error) {
        setLoadError(res.error);
      } else {
        setSessionNotice('Local session memory cleared. Loaded live records from Supabase.');
        setTimeout(() => setSessionNotice(null), 5000);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Page Header Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Overtime Requisition &amp; Head Office Approval
            </h2>
            
          </div>
          
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canAccessRequisition && (
            <button
              type="button"
              onClick={() => setIsFormOpen((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFormOpen ? 'Hide Request Form' : 'New Requisition'}</span>
            </button>
          )}
          
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {sessionNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">{sessionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSessionNotice(null)}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Load Error Alert (shown only if Supabase fetch fails) */}
      {loadError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/60 hover:bg-rose-200 dark:hover:bg-rose-900 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
            Total Requisitions
          </span>
          <span className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white block">
            {summaryCounts.total}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 block">
            Pending Approval
          </span>
          <span className="mt-1 text-2xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300 block">
            {summaryCounts.pendingApproval}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
            Approved (Granted)
          </span>
          <span className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 block">
            {summaryCounts.approved}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block">
            Returned for Correction
          </span>
          <span className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300 block">
            {summaryCounts.returnedForCorrection}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 block">
            Rejected
          </span>
          <span className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-300 block">
            {summaryCounts.rejected}
          </span>
        </div>
      </div>

      {/* SECTION 1: Factory Overtime Requisition Form */}
      {canAccessRequisition && isFormOpen && (
        <form
          onSubmit={handleSubmitForm}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {editingRequisition ? (
                  <>
                    <Edit3 className="w-4 h-4 text-amber-600" />
                    <span>Edit &amp; Resubmit Returned Requisition ({editingRequisition.requisitionNumber})</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-blue-600" />
                    <span>Factory Overtime Requisition Form</span>
                  </>
                )}
              </h3>
              
            </div>
            {editingRequisition && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {formFeedback && (
            <div
              className={`p-3 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                formFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                  : formFeedback.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                  : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {formFeedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span className="font-medium">{formFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFormFeedback(null)}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Auto Metadata & Core Numeric Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Requisition ID (Auto)
              </label>
              <input
                type="text"
                readOnly
                value={previewRequisitionNumber}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Requisition Date (Auto)
              </label>
              <input
                type="date"
                readOnly
                value={editingRequisition ? editingRequisition.requisitionDate : todayDate}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Overtime Date *
              </label>
              <input
                type="date"
                required
                value={overtimeDate}
                onChange={(e) => setOvertimeDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Required Workers *
              </label>
              <input
                type="number"
                required
                min={1}
                step={1}
                value={requiredWorkers}
                onChange={(e) => setRequiredWorkers(e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Requested OT Hours / Worker *
              </label>
              <input
                type="number"
                required
                min={0.5}
                max={24}
                step={0.5}
                value={requestedHours}
                onChange={(e) => setRequestedHours(e.target.value)}
                placeholder="e.g. 3"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold tabular-nums"
              />
            </div>
          </div>

          {/* Multi-Select Purpose from Payroll Settings + Editable Manual Purpose */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Overtime Purpose (Multi-Select) *</span>
                </label>
                
              </div>
              <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300 tabular-nums shrink-0">
                {selectedPurposes.length} Selected
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Multi-Select Dropdown from Payroll Settings */}
              <div className="relative space-y-1">
                
                <button
                  type="button"
                  onClick={() => setIsPurposeDropdownOpen((o) => !o)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left flex items-center justify-between gap-2 text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                >
                  <span className="truncate">
                    {selectedPurposes.filter((p) => !p.isCustom).length > 0
                      ? `${selectedPurposes.filter((p) => !p.isCustom).length} Payroll Setting purpose(s) selected`
                      : '-- Choose one or more Payroll Settings purposes --'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isPurposeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isPurposeDropdownOpen && (
                  <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2 space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={purposeSearch}
                        onChange={(e) => setPurposeSearch(e.target.value)}
                        placeholder="Filter Payroll Settings purposes..."
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredDropdownPurposes.length === 0 ? (
                        <div className="p-3 text-center text-[11px] text-slate-400">
                          No matching active purposes in Payroll Settings.
                        </div>
                      ) : (
                        filteredDropdownPurposes.map((opt) => {
                          const isChecked = selectedPurposes.some(
                            (p) =>
                              p.payrollPurposeId === opt.id ||
                              p.purposeName.trim().toLowerCase() === opt.name.trim().toLowerCase()
                          );
                          return (
                            <label
                              key={opt.id}
                              className="flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePayrollPurpose(opt.id, opt.name)}
                                  className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer shrink-0"
                                />
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {opt.name}
                                </span>
                              </div>
                              {isChecked && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="flex justify-end pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setIsPurposeDropdownOpen(false)}
                        className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Custom Purpose Entry */}
              <div className="space-y-1">
                
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualPurposeInput}
                    onChange={(e) => setManualPurposeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddManualPurpose();
                      }
                    }}
                    placeholder="Type custom purpose not in dropdown..."
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualPurpose}
                    disabled={!manualPurposeInput.trim()}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Purpose</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Selected Purposes List (Custom purposes are inline editable) */}
            {selectedPurposes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedPurposes.map((item) => {
                  const isEditingThis = editingCustomPurposeId === item.id;
                  if (isEditingThis) {
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-900"
                      >
                        <input
                          type="text"
                          value={editingCustomPurposeText}
                          onChange={(e) => setEditingCustomPurposeText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveCustomPurposeEdit(item.id);
                            } else if (e.key === 'Escape') {
                              setEditingCustomPurposeId(null);
                              setEditingCustomPurposeText('');
                            }
                          }}
                          autoFocus
                          className="px-1.5 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveCustomPurposeEdit(item.id)}
                          className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomPurposeId(null);
                            setEditingCustomPurposeText('');
                          }}
                          className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                        item.isCustom
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200'
                          : 'bg-white border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span>{item.purposeName}</span>
                      <span className="text-[9px] uppercase tracking-wide px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                        {item.isCustom ? 'Manual' : 'Settings'}
                      </span>
                      {item.isCustom && (
                        <button
                          type="button"
                          title="Edit manual purpose"
                          onClick={() => {
                            setEditingCustomPurposeId(item.id);
                            setEditingCustomPurposeText(item.purposeName);
                          }}
                          className="p-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-300 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remove purpose"
                        onClick={() => handleRemoveSelectedPurpose(item.id)}
                        className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Remarks + Auto Requested By & Submission Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 space-y-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                Operational Remarks / Justification (Optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Specify shift line, target batch priority, or factory bottleneck..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-center gap-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Requested By:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {currentUser.name} ({currentUser.role})
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Submission Date &amp; Time:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  Auto-recorded on submit
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Capacity Preview:{' '}
              <strong className="text-slate-900 dark:text-white">
                {Math.max(0, Number(requiredWorkers) || 0)} workers × {Math.max(0, Number(requestedHours) || 0)}h ={' '}
                {Math.round(Math.max(0, Number(requiredWorkers) || 0) * Math.max(0, Number(requestedHours) || 0) * 100) / 100}{' '}
                person-hours
              </strong>
            </div>
            <button
              type="submit"
              disabled={isSubmittingForm}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSubmittingForm
                  ? 'Submitting...'
                  : editingRequisition
                  ? 'Resubmit for Approval'
                  : 'Submit Overtime Requisition'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* SECTION 2: Filter Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>
              {canApproveRequisition
                ? 'Head Office Approval Queue & Requisition Tracking'
                : 'My Submitted Overtime Requisitions'}
            </span>
          </div>
          {(dateFrom || dateTo || overtimeDateFilter || statusFilter !== 'all' || requestedByFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setOvertimeDateFilter('');
                setStatusFilter('all');
                setRequestedByFilter('all');
                setSearchQuery('');
              }}
              className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, purpose..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Req. Date From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Req. Date To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Overtime Date</span>
            <input
              type="date"
              value={overtimeDateFilter}
              onChange={(e) => setOvertimeDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Requisition Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Approved">Approved</option>
              <option value="Returned for Correction">Returned for Correction</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-500 block">Requested By</span>
            <select
              value={requestedByFilter}
              onChange={(e) => setRequestedByFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
            >
              <option value="all">All Requesters</option>
              {requestersList.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 3: Requisitions Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Requisition ID</th>
                <th className="p-3">Overtime Date</th>
                <th className="p-3 text-right">Required Workers</th>
                <th className="p-3 text-right">Requested OT Hours</th>
                <th className="p-3">Purpose</th>
                <th className="p-3">Requested By</th>
                <th className="p-3">Submission Date</th>
                <th className="p-3 text-center">Approval Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRequisitions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No overtime requisitions found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRequisitions.map((req) => {
                  const canEditThisReturned =
                    canAccessRequisition &&
                    req.status === 'Returned for Correction' &&
                    doesActorMatchRequester(req, currentUser);

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">
                          {req.requisitionNumber}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Req Date: {req.requisitionDate}
                        </span>
                      </td>

                      <td className="p-3 whitespace-nowrap font-mono font-semibold text-slate-800 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {req.overtimeDate}
                        </span>
                      </td>

                      <td className="p-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                        {req.requiredWorkers}
                      </td>

                      <td className="p-3 text-right whitespace-nowrap">
                        <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white block">
                          {req.requestedHours} hrs/worker
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-500">
                          {Math.round(req.requiredWorkers * req.requestedHours * 100) / 100} person-hrs
                        </span>
                      </td>

                      <td className="p-3 max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {(req.purposes && req.purposes.length > 0
                            ? req.purposes
                            : req.purpose
                            ? [{ id: 'p0', purposeName: req.purpose, isCustom: false }]
                            : []
                          )
                            .slice(0, 3)
                            .map((p) => (
                              <span
                                key={p.id}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  p.isCustom
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300'
                                    : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {p.purposeName}
                              </span>
                            ))}
                          {req.purposes && req.purposes.length > 3 && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              +{req.purposes.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {req.requestedByName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {req.requestedByDepartment || req.requestedByRole || 'Factory'}
                        </div>
                      </td>

                      <td className="p-3 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {formatDisplayDateTime(req.submittedAt)}
                      </td>

                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getRequisitionStatusBadgeClass(
                              req.status
                            )}`}
                          >
                            {req.status}
                          </span>
                          {req.overtimeGranted && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white">
                              Overtime Granted
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModalReqId(req.id);
                              setDecisionRemarks('');
                              setDecisionFeedback(null);
                            }}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                              canApproveRequisition && req.status === 'Pending Approval'
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {canApproveRequisition && req.status === 'Pending Approval' ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Review</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>Details</span>
                              </>
                            )}
                          </button>

                          {canEditThisReturned && (
                            <button
                              type="button"
                              onClick={() => startEditReturnedRequisition(req)}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit &amp; Resubmit</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL & HEAD OFFICE DECISION MODAL */}
      {activeModalReq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setActiveModalReqId(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {activeModalReq.requisitionNumber}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getRequisitionStatusBadgeClass(
                        activeModalReq.status
                      )}`}
                    >
                      {activeModalReq.status}
                    </span>
                    {activeModalReq.overtimeGranted && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white">
                        Overtime Granted
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Requisition Date: {activeModalReq.requisitionDate} • Submitted {formatDisplayDateTime(activeModalReq.submittedAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalReqId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 block">Overtime Date</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {activeModalReq.overtimeDate}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Required Workers</span>
                  <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    {activeModalReq.requiredWorkers}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Requested Hours</span>
                  <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    {activeModalReq.requestedHours} hrs/worker
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Total Person-Hours</span>
                  <span className="font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">
                    {Math.round(activeModalReq.requiredWorkers * activeModalReq.requestedHours * 100) / 100} hrs
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 block">Requested By</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {activeModalReq.requestedByName} ({activeModalReq.requestedByRole || 'Staff'})
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {activeModalReq.requestedByDepartment || 'Production'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 block">Head Office Reviewer</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {activeModalReq.approvedByName || 'Awaiting Review'}
                  </span>
                  {activeModalReq.approvedAt && (
                    <span className="block text-[10px] font-mono text-slate-500">
                      {formatDisplayDateTime(activeModalReq.approvedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Purposes */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Overtime Purposes
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeModalReq.purposes && activeModalReq.purposes.length > 0
                    ? activeModalReq.purposes
                    : [{ id: 'p0', purposeName: activeModalReq.purpose, isCustom: false }]
                  ).map((p) => (
                    <span
                      key={p.id}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                        p.isCustom
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200'
                          : 'bg-slate-100 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span>{p.purposeName}</span>
                      <span className="text-[9px] uppercase text-slate-500">
                        {p.isCustom ? 'Manual' : 'Settings'}
                      </span>
                    </span>
                  ))}
                </div>
                {activeModalReq.remarks && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                    <strong>Requester Remarks:</strong> {activeModalReq.remarks}
                  </p>
                )}
                {activeModalReq.approvalRemarks && (
                  <p className="text-xs text-slate-700 dark:text-slate-200 pt-1">
                    <strong>Head Office Remarks:</strong> {activeModalReq.approvalRemarks}
                  </p>
                )}
              </div>

              {/* Approval History Timeline */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span>Approval &amp; Submission History</span>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {(!activeModalReq.approvalHistory || activeModalReq.approvalHistory.length === 0) ? (
                    <div className="p-3 text-slate-400 text-[11px]">
                      Submitted by {activeModalReq.requestedByName} on {formatDisplayDateTime(activeModalReq.submittedAt)}
                    </div>
                  ) : (
                    activeModalReq.approvalHistory.map((h) => (
                      <div key={h.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                              {h.action.replace(/_/g, ' ')}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {h.actorName}
                            </span>
                            {h.actorRole && (
                              <span className="text-[10px] text-slate-500">({h.actorRole})</span>
                            )}
                          </div>
                          {h.remarks && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                              {h.remarks}
                            </p>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
                          {formatDisplayDateTime(h.actionAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {decisionFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    decisionFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                  }`}
                >
                  {decisionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-medium">{decisionFeedback.message}</span>
                </div>
              )}

              {/* Head Office Decision Controls (Only when user has approve_requisition & status is Pending Approval) */}
              {canApproveRequisition && activeModalReq.status === 'Pending Approval' && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span>Head Office Decision</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Approving marks this requisition &quot;Overtime Granted&quot; without auto-generating attendance or payroll.
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder="Enter Head Office remarks (required for Reject or Return for Correction; optional for Approve)..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSubmittingDecision}
                      onClick={() => void handleDecision('REJECT')}
                      className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingDecision}
                      onClick={() => void handleDecision('RETURN')}
                      className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Return for Correction</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingDecision}
                      onClick={() => void handleDecision('APPROVE')}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isSubmittingDecision ? 'Processing...' : 'Approve & Grant Overtime'}</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeModalReq.status === 'Approved' || activeModalReq.status === 'Rejected') && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    This requisition is finalized ({activeModalReq.status}) and locked from edits or duplicate approvals.
                  </span>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              {canAccessRequisition &&
              activeModalReq.status === 'Returned for Correction' &&
              doesActorMatchRequester(activeModalReq, currentUser) ? (
                <button
                  type="button"
                  onClick={() => startEditReturnedRequisition(activeModalReq)}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit &amp; Resubmit Requisition</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setActiveModalReqId(null)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
