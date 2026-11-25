import React, { useState, useEffect } from 'react';
import { useERP } from '../../context/ERPContext';
import { OvertimeRequest } from '../../types/overtime';
import { OvertimeDashboardTab } from './OvertimeDashboardTab';
import { OvertimeRequestsTab } from './OvertimeRequestsTab';
import { OvertimeAttendanceTab } from './OvertimeAttendanceTab';
import { OvertimeBatchAllocationTab } from './OvertimeBatchAllocationTab';
import { OvertimePayrollCostingTab } from './OvertimePayrollCostingTab';
import { OvertimePolicySettingsTab } from './OvertimePolicySettingsTab';
import { OvertimeReportsTab } from './OvertimeReportsTab';
import { OvertimeRequisitionTab } from './OvertimeRequisitionTab';

// Modals
import { NewOvertimeRequestModal } from './NewOvertimeRequestModal';
import { OvertimeApprovalModal } from './OvertimeApprovalModal';
import { OvertimeBatchSplitModal } from './OvertimeBatchSplitModal';
import { OvertimeAttendanceModal } from './OvertimeAttendanceModal';

import { 
  LayoutDashboard, 
  FileText, 
  ClipboardList,
  Clock, 
  Layers, 
  ArrowRightLeft, 
  Settings2, 
  FileSpreadsheet,
  Plus,
  ShieldAlert,
} from 'lucide-react';

interface OvertimeModuleProps {
  initialSubTab?: string;
}

export const OvertimeModule: React.FC<OvertimeModuleProps> = ({ initialSubTab = 'dashboard' }) => {
  const { overtimeRequests, overtimeAttendances, overtimeRequisitions, hasPageAction, currentUser } = useERP();

  const canView = hasPageAction ? hasPageAction('overtime-management', 'view') : currentUser.role === 'Super Admin';
  const canViewRequests = hasPageAction ? hasPageAction('overtime-management', 'view_requests') : currentUser.role === 'Super Admin';
  const canViewRequisition = hasPageAction ? hasPageAction('overtime-management', 'view_requisition') : currentUser.role === 'Super Admin';
  const canApproveRequisition = hasPageAction ? hasPageAction('overtime-management', 'approve_requisition') : currentUser.role === 'Super Admin';
  const canAccessRequisitionTab = canViewRequisition || canApproveRequisition;
  const canViewAttendance = hasPageAction ? hasPageAction('overtime-management', 'view_attendance') : currentUser.role === 'Super Admin';
  const canViewBatchAllocation = hasPageAction ? hasPageAction('overtime-management', 'view_batch_allocation') : currentUser.role === 'Super Admin';
  const canViewPayrollSync = hasPageAction ? hasPageAction('overtime-management', 'view_payroll_sync') : currentUser.role === 'Super Admin';
  const canViewPolicies = hasPageAction ? hasPageAction('overtime-management', 'view_policies') : currentUser.role === 'Super Admin';
  const canViewReports = hasPageAction ? hasPageAction('overtime-management', 'view_reports') : currentUser.role === 'Super Admin';

  const canCreateRequest = (hasPageAction ? hasPageAction('overtime-management', 'create_request') : currentUser.role === 'Super Admin') && canViewRequests;
  const canEditRequest = (hasPageAction ? hasPageAction('overtime-management', 'edit_request') : currentUser.role === 'Super Admin') && canViewRequests;
  const canRecordAttendance = (hasPageAction ? hasPageAction('overtime-management', 'record_attendance') : currentUser.role === 'Super Admin') && canViewAttendance;
  const canAllocateBatch = (hasPageAction ? hasPageAction('overtime-management', 'allocate_batch') : currentUser.role === 'Super Admin') && canViewBatchAllocation;

  const [currentTab, setCurrentTab] = useState<string>(initialSubTab);

  useEffect(() => {
    setCurrentTab(initialSubTab);
  }, [initialSubTab]);

  // Modal states
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<OvertimeRequest | null>(null);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [approvalModalRequest, setApprovalModalRequest] = useState<OvertimeRequest | null>(null);
  const [batchSplitModalRequest, setBatchSplitModalRequest] = useState<OvertimeRequest | null>(null);

  if (!canView) {
    return (
      <div className="p-8 max-w-md mx-auto mt-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Overtime Hub Access Restricted
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your account does not have <strong>View Overtime Hub</strong> clearance. Contact your Super Admin to enable permissions under Users &amp; Permissions.
        </p>
      </div>
    );
  }

  // Pending counts for badges
  const pendingRequestsCount = overtimeRequests.filter(r => r.status !== 'Final Approved' && r.status !== 'Rejected' && r.status !== 'Cancelled').length;
  const pendingRequisitionsCount = overtimeRequisitions.filter(r => r.status === 'Pending Approval').length;
  const pendingAttendancesCount = overtimeAttendances.filter(a => !a.isVerified).length;

  const allTabs = [
    { id: 'dashboard', label: 'OT Dashboard', icon: LayoutDashboard, allowed: true },
    { id: 'requests', label: 'OT Requests', icon: FileText, badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined, allowed: canViewRequests },
    { id: 'requisition', label: 'Overtime Requisition', icon: ClipboardList, badge: canApproveRequisition && pendingRequisitionsCount > 0 ? pendingRequisitionsCount : undefined, allowed: canAccessRequisitionTab },
    { id: 'attendance', label: 'OT Attendance & Bio-Punches', icon: Clock, badge: pendingAttendancesCount > 0 ? pendingAttendancesCount : undefined, allowed: canViewAttendance },
    { id: 'batch_allocation', label: 'Batch Allocation & Split', icon: Layers, allowed: canViewBatchAllocation },
    { id: 'payroll_costing_sync', label: 'Payroll & Costing Dual-Sync', icon: ArrowRightLeft, allowed: canViewPayrollSync },
    { id: 'policies', label: 'Policy Configuration', icon: Settings2, allowed: canViewPolicies },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet, allowed: canViewReports },
  ];

  const tabs = allTabs.filter((t) => t.allowed);

  const isTabAllowed = (tabId: string): boolean => {
    const found = allTabs.find((t) => t.id === tabId);
    return found ? found.allowed : false;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 -mt-6 -mx-6 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Overtime Management System</h1>
          
          </div>
          
        </div>

        <div className="flex items-center gap-2.5">
          {canRecordAttendance && (
            <button
              onClick={() => setIsAttendanceModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-slate-600" />
              Quick Punch / Log
            </button>
          )}
          
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'border-blue-600 text-blue-700 font-bold bg-blue-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-amber-100 text-amber-800'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab View */}
      <div>
        {!isTabAllowed(currentTab) && (
          <div className="p-8 max-w-md mx-auto mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Overtime Page Access Restricted
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Your account does not have permission to access this Overtime Management page. Contact your Super Admin to enable the corresponding page-wise permission under Users &amp; Permissions.
            </p>
          </div>
        )}

        {currentTab === 'dashboard' && (
          <OvertimeDashboardTab
            onOpenNewRequest={() => {
              if (!canCreateRequest) return;
              setEditingRequest(null);
              setIsNewRequestModalOpen(true);
            }}
            onOpenAttendanceModal={() => {
              if (!canRecordAttendance) return;
              setIsAttendanceModalOpen(true);
            }}
            onNavigateTab={(tab) => {
              const target = tab === 'costing' ? 'payroll_costing_sync' : tab;
              if (isTabAllowed(target)) {
                setCurrentTab(target);
              }
            }}
          />
        )}

        {currentTab === 'requests' && canViewRequests && (
          <OvertimeRequestsTab
            onOpenNewRequest={() => {
              if (!canCreateRequest) return;
              setEditingRequest(null);
              setIsNewRequestModalOpen(true);
            }}
            onOpenEditRequest={(req) => {
              if (!canEditRequest) return;
              setEditingRequest(req);
            }}
            onOpenApprovalModal={(req) => {
              if (!canViewRequests) return;
              setApprovalModalRequest(req);
            }}
            onOpenBatchSplitModal={(req) => {
              if (!canAllocateBatch) return;
              setBatchSplitModalRequest(req);
            }}
          />
        )}

        {currentTab === 'requisition' && canAccessRequisitionTab && (
          <OvertimeRequisitionTab />
        )}

        {currentTab === 'attendance' && canViewAttendance && (
          <OvertimeAttendanceTab
            onRecordNewAttendance={() => {
              if (!canRecordAttendance) return;
              setIsAttendanceModalOpen(true);
            }}
          />
        )}

        {currentTab === 'batch_allocation' && canViewBatchAllocation && (
          <OvertimeBatchAllocationTab
            onOpenSplitModal={(req) => {
              if (!canAllocateBatch) return;
              setBatchSplitModalRequest(req);
            }}
          />
        )}

        {currentTab === 'payroll_costing_sync' && canViewPayrollSync && (
          <OvertimePayrollCostingTab />
        )}

        {currentTab === 'policies' && canViewPolicies && (
          <OvertimePolicySettingsTab />
        )}

        {currentTab === 'reports' && canViewReports && (
          <OvertimeReportsTab />
        )}
      </div>

      {/* Modals */}
      {((isNewRequestModalOpen && canCreateRequest) || (editingRequest && canEditRequest)) && (
        <NewOvertimeRequestModal
          editingRequest={editingRequest}
          onClose={() => {
            setIsNewRequestModalOpen(false);
            setEditingRequest(null);
          }}
        />
      )}

      {canRecordAttendance && (
        <OvertimeAttendanceModal
          isOpen={isAttendanceModalOpen}
          onClose={() => setIsAttendanceModalOpen(false)}
        />
      )}

      {approvalModalRequest && canViewRequests && (
        <OvertimeApprovalModal
          onClose={() => setApprovalModalRequest(null)}
          request={approvalModalRequest}
        />
      )}

      {batchSplitModalRequest && canAllocateBatch && (
        <OvertimeBatchSplitModal
          onClose={() => setBatchSplitModalRequest(null)}
          request={batchSplitModalRequest}
        />
      )}
    </div>
  );
};
