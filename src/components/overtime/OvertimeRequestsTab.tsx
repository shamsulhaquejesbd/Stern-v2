/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Overtime Request Management Tab
 * Implements Section 2: Requisitions linked to existing Employee Master & Production Batches,
 * and Section 8: 4-tier approval workflow (Supervisor -> Prod. Mgr -> HR -> Final).
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useERP } from '../../context/ERPContext.tsx';
import {
  Search,
  Filter,
  PlusCircle,
  Clock,
  User,
  Cpu,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Trash2,
  Edit,
  ArrowRight,
  Layers,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { OvertimeRequest, OvertimeStatus } from '../../types/overtime.ts';
import { formatTime12Hour } from '../../lib/geofence.ts';

interface OvertimeRequestsTabProps {
  onOpenNewRequest: () => void;
  onOpenEditRequest: (request: OvertimeRequest) => void;
  onOpenApprovalModal: (request: OvertimeRequest) => void;
  onOpenBatchSplitModal: (request: OvertimeRequest) => void;
}

export const OvertimeRequestsTab: React.FC<OvertimeRequestsTabProps> = ({
  onOpenNewRequest,
  onOpenEditRequest,
  onOpenApprovalModal,
  onOpenBatchSplitModal,
}) => {
  const {
    overtimeRequests,
    deleteOvertimeRequest,
    currentUser,
    hasPageAction,
    formatCurrency,
  } = useERP();

  const canViewPage = hasPageAction ? hasPageAction('overtime-management', 'view_requests') : currentUser.role === 'Super Admin';
  const canCreateRequest = (hasPageAction ? hasPageAction('overtime-management', 'create_request') : currentUser.role === 'Super Admin') && canViewPage;
  const canEditRequest = (hasPageAction ? hasPageAction('overtime-management', 'edit_request') : currentUser.role === 'Super Admin') && canViewPage;
  const canAllocateBatch = hasPageAction ? hasPageAction('overtime-management', 'allocate_batch') : currentUser.role === 'Super Admin';
  const canViewCost = hasPageAction ? hasPageAction('overtime-management', 'view_cost') : currentUser.role === 'Super Admin';
  const canApproveSupervisor = hasPageAction ? hasPageAction('overtime-management', 'approve_supervisor') : currentUser.role === 'Super Admin';
  const canApproveProduction = hasPageAction ? hasPageAction('overtime-management', 'approve_production') : currentUser.role === 'Super Admin';
  const canVerifyHrAccounts = hasPageAction ? hasPageAction('overtime-management', 'verify_hr_accounts') : currentUser.role === 'Super Admin';
  const canApproveFinal = hasPageAction ? hasPageAction('overtime-management', 'approve_final') : currentUser.role === 'Super Admin';

  const canActOnRequestStep = (status: OvertimeStatus): boolean => {
    if (status === 'Pending Supervisor') return canApproveSupervisor || canApproveFinal;
    if (status === 'Supervisor Approved') return canApproveProduction || canApproveFinal;
    if (status === 'Production Approved') return canVerifyHrAccounts || canApproveFinal;
    if (status === 'HR Verified') return canApproveFinal;
    return false;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<OvertimeRequest | null>(null);
  const PAGE_SIZE = 10;

  // Filtered List
  const filteredRequests = useMemo(() => {
    return overtimeRequests.filter((req) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesEmp = req.employeeName.toLowerCase().includes(q) || req.employeeCode.toLowerCase().includes(q);
        const matchesReq = req.requestNumber.toLowerCase().includes(q);
        const matchesRequisition = (req.requisitionNumber || '').toLowerCase().includes(q);
        const matchesBatch = (req.productionBatchNumber || '').toLowerCase().includes(q);
        const matchesPurpose = (req.projectPurpose || '').toLowerCase().includes(q);
        if (!matchesEmp && !matchesReq && !matchesRequisition && !matchesBatch && !matchesPurpose) return false;
      }

      // Status
      if (statusFilter !== 'all' && req.status !== statusFilter) {
        return false;
      }

      // Department
      if (departmentFilter !== 'all' && req.department !== departmentFilter) {
        return false;
      }

      // Batch
      if (batchFilter !== 'all' && req.productionBatchNumber !== batchFilter) {
        return false;
      }

      return true;
    });
  }, [overtimeRequests, searchQuery, statusFilter, departmentFilter, batchFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, departmentFilter, batchFilter]);

  const pagination = useMemo(() => {
    const totalRequests = filteredRequests.length;
    const totalPages = Math.max(1, Math.ceil(totalRequests / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;
    const paginatedRequests = filteredRequests.slice(startIndex, startIndex + PAGE_SIZE);
    const startRecord = totalRequests === 0 ? 0 : startIndex + 1;
    const endRecord = Math.min(safePage * PAGE_SIZE, totalRequests);

    const pageNumbers: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else if (safePage <= 4) {
      for (let i = 1; i <= 5; i++) pageNumbers.push(i);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    } else if (safePage >= totalPages - 3) {
      pageNumbers.push(1);
      pageNumbers.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(1);
      pageNumbers.push('...');
      pageNumbers.push(safePage - 1);
      pageNumbers.push(safePage);
      pageNumbers.push(safePage + 1);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    }

    return {
      totalRequests,
      totalPages,
      safePage,
      paginatedRequests,
      startRecord,
      endRecord,
      pageNumbers,
    };
  }, [filteredRequests, currentPage]);

  useEffect(() => {
    if (currentPage > pagination.totalPages) {
      setCurrentPage(pagination.totalPages);
    }
  }, [currentPage, pagination.totalPages]);

  // Unique departments and batches for filter dropdowns
  const departments = useMemo(() => {
    return Array.from(new Set(overtimeRequests.map((r) => r.department))).filter(Boolean);
  }, [overtimeRequests]);

  const batches = useMemo(() => {
    return Array.from(new Set(overtimeRequests.map((r) => r.productionBatchNumber))).filter(Boolean);
  }, [overtimeRequests]);

  const getStatusBadge = (status: OvertimeStatus) => {
    switch (status) {
      case 'Final Approved':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'HR Verified':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800';
      case 'Production Approved':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800';
      case 'Supervisor Approved':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Pending Supervisor':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'Rejected':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case 'Cancelled':
        return 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300';
    }
  };

  if (!canViewPage) {
    return (
      <div className="p-8 max-w-md mx-auto mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          OT Requests Access Restricted
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your account lacks <strong>OT Requests</strong> page permission under Overtime Management Hub. Contact your administrator to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Header & Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search request #, employee name, code, batch number, or purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
          >
            <option value="all">All Approval Statuses</option>
            <option value="Pending Supervisor">Pending Supervisor (Step 1)</option>
            <option value="Supervisor Approved">Supervisor Approved (Step 2)</option>
            <option value="Production Approved">Production Approved (Step 3)</option>
            <option value="HR Verified">HR Verified (Step 4)</option>
            <option value="Final Approved">Final Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Batch Filter */}
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                Batch: {b}
              </option>
            ))}
          </select>

          {canCreateRequest && (
            <button
              onClick={onOpenNewRequest}
              className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create OT Request</span>
            </button>
          )}
        </div>
      </div>

      {/* Requests Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Request # &amp; Date</th>
                <th className="p-3">Employee Details</th>
                <th className="p-3">Production Batch &amp; Purpose</th>
                <th className="p-3 text-center">Expected Time</th>
                <th className="p-3 text-right">{canViewCost ? 'Hours & Cost' : 'OT Hours'}</th>
                <th className="p-3 text-center">Approval Workflow</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagination.paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No overtime requests match your search and filter criteria.
                  </td>
                </tr>
              ) : (
                pagination.paginatedRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">
                        {req.requestNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {req.overtimeDate}
                      </span>
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {req.employeeName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {req.employeeCode} • {req.designation}
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        {req.department}
                      </span>
                    </td>

                    <td className="p-3 max-w-[240px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {req.sourceType === 'QR_ATTENDANCE_AUTO' && (
                          <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                            QR Auto
                          </span>
                        )}
                        {req.sourceType === 'ATTENDANCE_AUTO' && (
                          <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            Attendance Auto
                          </span>
                        )}
                        {req.requisitionNumber && (
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Req: {req.requisitionNumber}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                          {req.productionBatchNumber || 'General Overhead'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          req.purposeCategory === 'Direct Production'
                            ? 'bg-blue-50 dark:bg-blue-950 text-blue-600'
                            : 'bg-amber-50 dark:bg-amber-950 text-amber-600'
                        }`}>
                          {req.purposeCategory}
                        </span>
                      </div>
                      {req.projectPurpose && req.projectPurpose.trim() ? (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-1 font-medium" title={req.projectPurpose}>
                          {req.projectPurpose}
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 italic font-medium">
                          Purpose pending (Select on approval)
                        </p>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block whitespace-nowrap">
                        {formatTime12Hour(req.expectedStartTime) || '—'} – {formatTime12Hour(req.expectedEndTime) || '—'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Requested by {req.requestedBy.split(' ')[0]}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <span className="font-mono font-bold text-slate-900 dark:text-white block">
                        {req.actualOvertimeHours || req.expectedHours} hrs
                      </span>
                      {canViewCost ? (
                        <>
                          <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-xs">
                            {formatCurrency(req.calculatedOvertimeAmountBDT || 0)}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {req.overtimeMultiplier ?? 2.0}x Multiplier
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Financials Restricted</span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-block ${getStatusBadge(req.status)}`}>
                        {req.status}
                      </span>
                      {req.status === 'Cancelled' && (req.cancellationReason || req.rejectionReason) ? (
                        <span
                          className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-[190px] mx-auto truncate"
                          title={req.cancellationReason || req.rejectionReason}
                        >
                          {req.cancellationReason || req.rejectionReason}
                        </span>
                      ) : req.rejectionReason ? (
                        <span className="block text-[10px] text-rose-500 mt-0.5" title={req.rejectionReason}>
                          Reason: {req.rejectionReason.slice(0, 24)}...
                        </span>
                      ) : null}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {req.status !== 'Final Approved' &&
                          req.status !== 'Rejected' &&
                          req.status !== 'Cancelled' &&
                          canActOnRequestStep(req.status) && (
                          <button
                            onClick={() => onOpenApprovalModal(req)}
                            title="Review & Advance Approval"
                            className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Sign Off</span>
                          </button>
                        )}

                        {!req.isPayrollProcessed &&
                          req.status !== 'Final Approved' &&
                          req.status !== 'Rejected' &&
                          req.status !== 'Cancelled' &&
                          canEditRequest && (
                            <button
                              onClick={() => onOpenEditRequest(req)}
                              title="Edit Planned Hours & Purpose"
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                        {canAllocateBatch && (
                          <button
                            onClick={() => onOpenBatchSplitModal(req)}
                            title="Allocate & Split Hours across Batches"
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 transition-colors"
                          >
                            <Cpu className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {!req.isPayrollProcessed &&
                          ((canEditRequest && req.status !== 'Final Approved' && req.status !== 'Rejected') || canApproveFinal) && (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteRequest(req)}
                              title="Delete Request"
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 text-xs">
          <div className="text-slate-600 dark:text-slate-400">
            {pagination.totalRequests === 0 ? (
              <span>Showing <b>0</b> of <b>0</b> requests</span>
            ) : (
              <span>
                Showing <b>{pagination.startRecord}–{pagination.endRecord}</b> of{' '}
                <b>{pagination.totalRequests}</b> requests
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={pagination.safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {pagination.pageNumbers.map((pageItem, idx) =>
              pageItem === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400 select-none">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${pageItem}`}
                  type="button"
                  onClick={() => setCurrentPage(Number(pageItem))}
                  className={`min-w-[30px] px-2.5 py-1.5 rounded-lg border font-bold transition-colors ${
                    pagination.safePage === pageItem
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {pageItem}
                </button>
              )
            )}

            <button
              type="button"
              disabled={pagination.safePage >= pagination.totalPages}
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDeleteRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setPendingDeleteRequest(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Confirm Delete Overtime Request
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteRequest(null)}
                aria-label="Close confirmation dialog"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to delete overtime request{' '}
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {pendingDeleteRequest.requestNumber}
                </span>
                ?
              </p>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Employee:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {pendingDeleteRequest.employeeName} ({pendingDeleteRequest.employeeCode})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Overtime Date:</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {pendingDeleteRequest.overtimeDate}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">OT Hours:</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {pendingDeleteRequest.actualOvertimeHours || pendingDeleteRequest.expectedHours} hrs
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {pendingDeleteRequest.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingDeleteRequest(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const idToDelete = pendingDeleteRequest.id;
                  setPendingDeleteRequest(null);
                  deleteOvertimeRequest(idToDelete);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Request</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
