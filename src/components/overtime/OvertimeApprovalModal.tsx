/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Overtime Multi-Step Approval Modal
 * Workflow Engine: Supervisor → Production Manager → HR/Accounts → Final Approval.
 */

import React, { useMemo, useState } from 'react';
import { useERP } from '../../context/ERPContext.tsx';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  ShieldCheck,
  FileCheck,
  Building,
  DollarSign,
  ArrowRight,
  FastForward,
  Info,
  Tag,
} from 'lucide-react';
import { OvertimeRequest } from '../../types/overtime.ts';
import { DEFAULT_OVERTIME_PURPOSES } from '../../mock/payrollData.ts';
import { formatTime12Hour } from '../../lib/geofence.ts';

interface OvertimeApprovalModalProps {
  request: OvertimeRequest;
  onClose: () => void;
  onSuccess?: () => void;
}

export const OvertimeApprovalModal: React.FC<OvertimeApprovalModalProps> = ({
  request,
  onClose,
  onSuccess,
}) => {
  const {
    payrollSettings,
    advanceOvertimeWorkflow,
    rejectOvertimeRequest,
    currentUser,
    hasPageAction,
    formatCurrency,
  } = useERP();

  const canViewCost = hasPageAction ? hasPageAction('overtime-management', 'view_cost') : currentUser.role === 'Super Admin';
  const canApproveSupervisor = hasPageAction ? hasPageAction('overtime-management', 'approve_supervisor') : currentUser.role === 'Super Admin';
  const canApproveProduction = hasPageAction ? hasPageAction('overtime-management', 'approve_production') : currentUser.role === 'Super Admin';
  const canVerifyHrAccounts = hasPageAction ? hasPageAction('overtime-management', 'verify_hr_accounts') : currentUser.role === 'Super Admin';
  const canApproveFinal = hasPageAction ? hasPageAction('overtime-management', 'approve_final') : currentUser.role === 'Super Admin';

  // Determine current active step in workflow
  let currentStep: 'SUPERVISOR' | 'PRODUCTION' | 'HR' | 'FINAL' = 'SUPERVISOR';
  let stepTitle = 'Step 1: Supervisor Review & Approval';
  let nextStatus = 'Supervisor Approved';

  if (request.status === 'Pending Supervisor') {
    currentStep = 'SUPERVISOR';
    stepTitle = 'Step 1: Supervisor Review & Approval';
    nextStatus = 'Supervisor Approved';
  } else if (request.status === 'Supervisor Approved') {
    currentStep = 'PRODUCTION';
    stepTitle = 'Step 2: Production Manager Approval';
    nextStatus = 'Production Approved';
  } else if (request.status === 'Production Approved') {
    currentStep = 'HR';
    stepTitle = 'Step 3: HR & Accounts Wage Verification';
    nextStatus = 'HR Verified';
  } else if (request.status === 'HR Verified') {
    currentStep = 'FINAL';
    stepTitle = 'Step 4: Final Executive Approval';
    nextStatus = 'Final Approved';
  }

  const canApproveCurrentStep =
    currentStep === 'SUPERVISOR'
      ? canApproveSupervisor
      : currentStep === 'PRODUCTION'
      ? canApproveProduction
      : currentStep === 'HR'
      ? canVerifyHrAccounts
      : canApproveFinal;

  const canSkipToFinal = currentStep !== 'FINAL' && canApproveFinal;
  const canRejectCurrent = canApproveCurrentStep || canApproveFinal;

  const [mode, setMode] = useState<'APPROVE' | 'JUMP_FINAL' | 'REJECT'>(() => {
    if (canApproveCurrentStep) return 'APPROVE';
    if (canSkipToFinal) return 'JUMP_FINAL';
    return 'REJECT';
  });
  const [remarks, setRemarks] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [selectedPurpose, setSelectedPurpose] = useState<string>(
    () => (request.projectPurpose || '').trim()
  );

  const activePurposeOptions = useMemo(() => {
    const raw =
      Array.isArray(payrollSettings?.overtimePurposes) &&
      payrollSettings.overtimePurposes.length > 0
        ? payrollSettings.overtimePurposes
        : DEFAULT_OVERTIME_PURPOSES;
    const active = raw.filter((p) => p.isActive !== false);
    const existingText = (request.projectPurpose || '').trim();
    if (
      existingText &&
      !active.some((p) => p.name.trim().toLowerCase() === existingText.toLowerCase())
    ) {
      return [
        { id: request.purposeId || 'otp-existing', name: existingText, isActive: true },
        ...active,
      ];
    }
    return active;
  }, [payrollSettings?.overtimePurposes, request.projectPurpose, request.purposeId]);

  const matchedPurposeOption = useMemo(
    () =>
      activePurposeOptions.find(
        (p) => p.name.trim().toLowerCase() === selectedPurpose.trim().toLowerCase()
      ),
    [activePurposeOptions, selectedPurpose]
  );

  const hasValidPurpose = Boolean(selectedPurpose.trim());

  const handleApprove = () => {
    if (!canApproveCurrentStep || !hasValidPurpose) return;
    advanceOvertimeWorkflow(
      request.id,
      currentStep,
      remarks.trim() || undefined,
      false,
      {
        projectPurpose: selectedPurpose.trim(),
        purposeId: matchedPurposeOption?.id,
      }
    );
    if (onSuccess) onSuccess();
    onClose();
  };

  const handleJumpToFinalApprove = () => {
    if (!canSkipToFinal || !hasValidPurpose) return;
    advanceOvertimeWorkflow(
      request.id,
      'FINAL',
      remarks.trim() || undefined,
      true,
      {
        projectPurpose: selectedPurpose.trim(),
        purposeId: matchedPurposeOption?.id,
      }
    );
    if (onSuccess) onSuccess();
    onClose();
  };

  const handleReject = () => {
    if (!canRejectCurrent || !rejectionReason.trim()) return;
    rejectOvertimeRequest(request.id, rejectionReason.trim());
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">Overtime Approval Review</h2>
              <p className="text-xs text-indigo-300 font-mono">{request.requestNumber} • {stepTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Stepper Progress Bar */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
            <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
              <div className={`p-2 rounded-lg font-bold ${
                request.status !== 'Pending Supervisor'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : mode === 'JUMP_FINAL'
                  ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-blue-600 text-white'
              }`}>
                {mode === 'JUMP_FINAL' && request.status === 'Pending Supervisor' ? '1. Skip' : '1. Supervisor'}
              </div>
              <div className={`p-2 rounded-lg font-bold ${
                request.status === 'Production Approved' || request.status === 'HR Verified' || request.status === 'Final Approved'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : mode === 'JUMP_FINAL'
                  ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  : request.status === 'Supervisor Approved'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}>
                {mode === 'JUMP_FINAL' && (request.status === 'Pending Supervisor' || request.status === 'Supervisor Approved') ? '2. Skip' : '2. Prod. Mgr'}
              </div>
              <div className={`p-2 rounded-lg font-bold ${
                request.status === 'HR Verified' || request.status === 'Final Approved'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : mode === 'JUMP_FINAL'
                  ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  : request.status === 'Production Approved'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}>
                {mode === 'JUMP_FINAL' ? '3. Skip' : '3. HR / Accts'}
              </div>
              <div className={`p-2 rounded-lg font-bold ${
                request.status === 'Final Approved'
                  ? 'bg-emerald-600 text-white'
                  : mode === 'JUMP_FINAL'
                  ? 'bg-amber-500 text-white ring-2 ring-amber-300 dark:ring-amber-700'
                  : request.status === 'HR Verified'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}>
                4. Final
              </div>
            </div>
          </div>

          {/* Details Card */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Employee Name
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {request.employeeName}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Employee ID
                </span>
                <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                  {request.employeeCode} • {request.department}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px]">Attendance Date:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{request.overtimeDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Overtime Start Time:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {formatTime12Hour(request.expectedStartTime) || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Overtime End Time:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {formatTime12Hour(request.expectedEndTime) || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Total Overtime Duration:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {request.actualOvertimeHours || request.expectedHours} Hours
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Production Batch:</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{request.productionBatchNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Estimated Cost:</span>
                <span className="font-mono font-black text-amber-600 dark:text-amber-400">
                  {canViewCost ? formatCurrency(request.calculatedOvertimeAmountBDT || 0) : 'Restricted'}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-[11px] space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <strong>Selected Purpose:</strong>
                {selectedPurpose ? (
                  <span className="font-semibold text-slate-900 dark:text-white">{selectedPurpose}</span>
                ) : (
                  <span className="italic text-amber-600 dark:text-amber-400 font-medium">
                    Blank (Select from Overtime Purpose dropdown below before approving)
                  </span>
                )}
                {request.sourceType === 'QR_ATTENDANCE_AUTO' && (
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-[10px] font-bold">
                    QR Attendance Auto
                  </span>
                )}
                {request.sourceType === 'ATTENDANCE_AUTO' && (
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[10px] font-bold">
                    Attendance Auto
                  </span>
                )}
              </div>
              <div>
                <strong>Reason:</strong> {request.overtimeReason || '—'}
              </div>
            </div>
          </div>

          {!canApproveCurrentStep && !canSkipToFinal && !canRejectCurrent ? (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                You do not have approval clearance for <strong>{stepTitle}</strong> or Final Executive Approval.
              </span>
            </div>
          ) : (
            <>
              {/* Action Choice Tabs */}
              <div
                className={`grid gap-2 ${
                  [canApproveCurrentStep, canSkipToFinal, canRejectCurrent].filter(Boolean).length === 3
                    ? 'grid-cols-1 sm:grid-cols-3'
                    : [canApproveCurrentStep, canSkipToFinal, canRejectCurrent].filter(Boolean).length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1'
                }`}
              >
                {canApproveCurrentStep && (
                  <button
                    type="button"
                    onClick={() => setMode('APPROVE')}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      mode === 'APPROVE'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Approve ({stepTitle.split(':')[0]})</span>
                  </button>
                )}
                {canSkipToFinal && (
                  <button
                    type="button"
                    onClick={() => setMode('JUMP_FINAL')}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      mode === 'JUMP_FINAL'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <FastForward className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Jump to Final Approve</span>
                  </button>
                )}
                {canRejectCurrent && (
                  <button
                    type="button"
                    onClick={() => setMode('REJECT')}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      mode === 'REJECT'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Reject Request</span>
                  </button>
                )}
              </div>

              {(mode === 'APPROVE' || mode === 'JUMP_FINAL') && (
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Overtime Purpose (From Payroll &amp; HR Settings) *</span>
                  </label>
                  <select
                    value={selectedPurpose}
                    onChange={(e) => setSelectedPurpose(e.target.value)}
                    required
                    className={`w-full py-2 px-3 rounded-xl border bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold ${
                      hasValidPurpose
                        ? 'border-slate-200 dark:border-slate-700'
                        : 'border-amber-400 dark:border-amber-700 ring-1 ring-amber-300/60'
                    }`}
                  >
                    <option value="">-- Select Overtime Purpose --</option>
                    {activePurposeOptions.map((purpose) => (
                      <option key={purpose.id} value={purpose.name}>
                        {purpose.name}
                      </option>
                    ))}
                  </select>
                  {!hasValidPurpose && (
                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      Please select an Overtime Purpose before approving this request.
                    </p>
                  )}
                </div>
              )}

              {mode === 'APPROVE' && canApproveCurrentStep ? (
                <div className="space-y-2">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Approval Remarks / Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter remarks for the next stage or audit trail..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  />
                  <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900 text-[11px] flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0 text-blue-500" />
                    <span>
                      Clicking Approve will advance this request to <strong>{nextStatus}</strong> by {currentUser.name}.
                    </span>
                  </div>
                </div>
              ) : mode === 'JUMP_FINAL' && canSkipToFinal ? (
                <div className="space-y-2">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Direct Final Approval Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter optional remarks for direct final executive approval..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 text-slate-900 dark:text-white font-medium"
                  />
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] flex items-center gap-2">
                    <FastForward className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      <strong>Skip First 3 Approvals:</strong> Confirming will bypass intermediate approval steps and jump directly to <strong>Final Approved</strong> by {currentUser.name}.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="font-bold text-rose-700 dark:text-rose-400">
                    Reason for Rejection *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Specify reason for rejecting this overtime request..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 text-slate-900 dark:text-white font-medium"
                  />
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            {mode === 'APPROVE' && canApproveCurrentStep ? (
              <button
                type="button"
                disabled={!hasValidPurpose}
                onClick={handleApprove}
                className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm &amp; Sign Off</span>
              </button>
            ) : mode === 'JUMP_FINAL' && canSkipToFinal ? (
              <button
                type="button"
                disabled={!hasValidPurpose}
                onClick={handleJumpToFinalApprove}
                className="py-2 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <FastForward className="w-4 h-4" />
                <span>Skip Steps &amp; Final Approve</span>
              </button>
            ) : canRejectCurrent ? (
              <button
                type="button"
                disabled={!rejectionReason.trim()}
                onClick={handleReject}
                className="py-2 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirm Rejection</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
