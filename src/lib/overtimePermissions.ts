/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Shared Overtime Management Hub Authorization Engine
 * Enforces the 6 page-wise Overtime permissions and action-level permissions
 * across both frontend views and Express backend API endpoints.
 */

export const OVERTIME_PAGE_PERMISSION_KEYS = {
  VIEW: 'view',
  VIEW_REQUESTS: 'view_requests',
  VIEW_REQUISITION: 'view_requisition',
  VIEW_ATTENDANCE: 'view_attendance',
  VIEW_BATCH_ALLOCATION: 'view_batch_allocation',
  VIEW_PAYROLL_SYNC: 'view_payroll_sync',
  VIEW_POLICIES: 'view_policies',
  VIEW_REPORTS: 'view_reports',
  CREATE_REQUEST: 'create_request',
  EDIT_REQUEST: 'edit_request',
  RECORD_ATTENDANCE: 'record_attendance',
  VERIFY_ATTENDANCE: 'verify_attendance',
  APPROVE_SUPERVISOR: 'approve_supervisor',
  APPROVE_PRODUCTION: 'approve_production',
  VERIFY_HR_ACCOUNTS: 'verify_hr_accounts',
  APPROVE_FINAL: 'approve_final',
  ALLOCATE_BATCH: 'allocate_batch',
  VIEW_COST: 'view_cost',
  CONFIGURE_POLICY: 'configure_policy',
  EXPORT: 'export',
  APPROVE_REQUISITION: 'approve_requisition',
  REPORT_EMPLOYEE_MONTHLY: 'report_employee_monthly',
  REPORT_DAILY_FACTORY_BILL: 'report_daily_factory_bill',
  REPORT_PRODUCTION_BATCH_COST: 'report_production_batch_cost',
  REPORT_PRODUCTION_ORDER_COST: 'report_production_order_cost',
  REPORT_PAYROLL_RECONCILIATION: 'report_payroll_reconciliation',
  REPORT_PENDING_APPROVAL_WORKFLOW: 'report_pending_approval_workflow',
  REPORT_HOURS_VS_OUTPUT: 'report_hours_vs_output',
} as const;

export type OvertimePageSlug =
  | 'requests'
  | 'requisition'
  | 'attendance'
  | 'batch_allocation'
  | 'payroll_costing_sync'
  | 'policies'
  | 'reports';

export interface OvertimePermissions {
  view: boolean;
  viewRequests: boolean;
  viewRequisition: boolean;
  viewAttendance: boolean;
  viewBatchAllocation: boolean;
  viewPayrollSync: boolean;
  viewPolicies: boolean;
  viewReports: boolean;
  createRequest: boolean;
  editRequest: boolean;
  recordAttendance: boolean;
  verifyAttendance: boolean;
  approveSupervisor: boolean;
  approveProduction: boolean;
  verifyHrAccounts: boolean;
  approveFinal: boolean;
  allocateBatch: boolean;
  viewCost: boolean;
  configurePolicy: boolean;
  exportReports: boolean;
  approveRequisition: boolean;
  reportEmployeeMonthly: boolean;
  reportDailyFactoryBill: boolean;
  reportProductionBatchCost: boolean;
  reportProductionOrderCost: boolean;
  reportPayrollReconciliation: boolean;
  reportPendingApprovalWorkflow: boolean;
  reportHoursVsOutput: boolean;
}

export const ALL_OVERTIME_PERMISSIONS_OFF: OvertimePermissions = {
  view: false,
  viewRequests: false,
  viewRequisition: false,
  viewAttendance: false,
  viewBatchAllocation: false,
  viewPayrollSync: false,
  viewPolicies: false,
  viewReports: false,
  createRequest: false,
  editRequest: false,
  recordAttendance: false,
  verifyAttendance: false,
  approveSupervisor: false,
  approveProduction: false,
  verifyHrAccounts: false,
  approveFinal: false,
  allocateBatch: false,
  viewCost: false,
  configurePolicy: false,
  exportReports: false,
  approveRequisition: false,
  reportEmployeeMonthly: false,
  reportDailyFactoryBill: false,
  reportProductionBatchCost: false,
  reportProductionOrderCost: false,
  reportPayrollReconciliation: false,
  reportPendingApprovalWorkflow: false,
  reportHoursVsOutput: false,
};

export const ALL_OVERTIME_PERMISSIONS_ON: OvertimePermissions = {
  view: true,
  viewRequests: true,
  viewRequisition: true,
  viewAttendance: true,
  viewBatchAllocation: true,
  viewPayrollSync: true,
  viewPolicies: true,
  viewReports: true,
  createRequest: true,
  editRequest: true,
  recordAttendance: true,
  verifyAttendance: true,
  approveSupervisor: true,
  approveProduction: true,
  verifyHrAccounts: true,
  approveFinal: true,
  allocateBatch: true,
  viewCost: true,
  configurePolicy: true,
  exportReports: true,
  approveRequisition: true,
  reportEmployeeMonthly: true,
  reportDailyFactoryBill: true,
  reportProductionBatchCost: true,
  reportProductionOrderCost: true,
  reportPayrollReconciliation: true,
  reportPendingApprovalWorkflow: true,
  reportHoursVsOutput: true,
};

function parseUserPermissions(user: any): { pagePerms?: Record<string, Record<string, boolean>>; allowedModules: string[] } {
  let rawPermissions = user?.permissions;
  if (typeof rawPermissions === 'string') {
    try {
      rawPermissions = JSON.parse(rawPermissions);
    } catch {
      rawPermissions = null;
    }
  }
  const pagePerms =
    rawPermissions?.pagePermissions && typeof rawPermissions.pagePermissions === 'object'
      ? rawPermissions.pagePermissions
      : undefined;
  const allowedModules = Array.isArray(rawPermissions?.allowedModules)
    ? rawPermissions.allowedModules.map((m: any) => String(m))
    : [];
  return { pagePerms, allowedModules };
}

function resolveSubPageFlag(
  otPerms: Record<string, boolean> | undefined,
  allowedModules: string[],
  actionKey: string,
  sidebarModuleId: string
): boolean {
  if (otPerms) {
    if (!otPerms.view) return false;
    if (otPerms[actionKey] !== undefined) {
      return Boolean(otPerms[actionKey]);
    }
    return true; // Backward compatibility for legacy users with overtime-management.view=true
  }
  return allowedModules.includes('overtime-management') || allowedModules.includes(sidebarModuleId);
}

function resolveReportFlag(
  otPerms: Record<string, boolean> | undefined,
  allowedModules: string[],
  actionKey: string,
  viewReports: boolean
): boolean {
  if (!viewReports) return false;
  if (otPerms) {
    if (otPerms[actionKey] !== undefined) {
      return Boolean(otPerms[actionKey]);
    }
    return true;
  }
  return allowedModules.includes('overtime-management') || allowedModules.includes('overtime-reports');
}

export function resolveOvertimePermissions(user: any): OvertimePermissions {
  if (!user || user.status === 'Blocked' || user.status === 'Inactive') {
    return { ...ALL_OVERTIME_PERMISSIONS_OFF };
  }
  if (user.role === 'Super Admin') {
    return { ...ALL_OVERTIME_PERMISSIONS_ON };
  }

  const { pagePerms, allowedModules } = parseUserPermissions(user);
  const otPerms = pagePerms?.['overtime-management'];
  const hasAnySubpageLegacy = allowedModules.some((m) => m.startsWith('overtime-'));
  const view = otPerms ? Boolean(otPerms.view) : hasAnySubpageLegacy;

  if (!view) {
    return { ...ALL_OVERTIME_PERMISSIONS_OFF };
  }

  const viewReports = resolveSubPageFlag(otPerms, allowedModules, 'view_reports', 'overtime-reports');

  return {
    view: true,
    viewRequests: resolveSubPageFlag(otPerms, allowedModules, 'view_requests', 'overtime-requests'),
    viewRequisition: resolveSubPageFlag(otPerms, allowedModules, 'view_requisition', 'overtime-requisition'),
    viewAttendance: resolveSubPageFlag(otPerms, allowedModules, 'view_attendance', 'overtime-attendance'),
    viewBatchAllocation: resolveSubPageFlag(otPerms, allowedModules, 'view_batch_allocation', 'overtime-batch-allocation'),
    viewPayrollSync: resolveSubPageFlag(otPerms, allowedModules, 'view_payroll_sync', 'overtime-sync'),
    viewPolicies: resolveSubPageFlag(otPerms, allowedModules, 'view_policies', 'overtime-policies'),
    viewReports,
    createRequest: Boolean(otPerms?.create_request),
    editRequest: Boolean(otPerms?.edit_request),
    recordAttendance: Boolean(otPerms?.record_attendance),
    verifyAttendance: Boolean(otPerms?.verify_attendance),
    approveSupervisor: Boolean(otPerms?.approve_supervisor),
    approveProduction: Boolean(otPerms?.approve_production),
    verifyHrAccounts: Boolean(otPerms?.verify_hr_accounts),
    approveFinal: Boolean(otPerms?.approve_final),
    allocateBatch: Boolean(otPerms?.allocate_batch),
    viewCost: Boolean(otPerms?.view_cost),
    configurePolicy: Boolean(otPerms?.configure_policy),
    exportReports: Boolean(otPerms?.export),
    approveRequisition: Boolean(otPerms?.approve_requisition),
    reportEmployeeMonthly: resolveReportFlag(otPerms, allowedModules, 'report_employee_monthly', viewReports),
    reportDailyFactoryBill: resolveReportFlag(otPerms, allowedModules, 'report_daily_factory_bill', viewReports),
    reportProductionBatchCost: resolveReportFlag(otPerms, allowedModules, 'report_production_batch_cost', viewReports),
    reportProductionOrderCost: resolveReportFlag(otPerms, allowedModules, 'report_production_order_cost', viewReports),
    reportPayrollReconciliation: resolveReportFlag(otPerms, allowedModules, 'report_payroll_reconciliation', viewReports),
    reportPendingApprovalWorkflow: resolveReportFlag(otPerms, allowedModules, 'report_pending_approval_workflow', viewReports),
    reportHoursVsOutput: resolveReportFlag(otPerms, allowedModules, 'report_hours_vs_output', viewReports),
  };
}

export function authorizeOvertimeSubPage(
  user: any,
  subPage: OvertimePageSlug
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required to access Overtime Management.' };
  }
  const perms = resolveOvertimePermissions(user);
  if (!perms.view) {
    return { allowed: false, reason: 'Access Restricted: View Overtime Hub clearance is required.' };
  }

  const map: Record<OvertimePageSlug, { ok: boolean; label: string }> = {
    requests: { ok: perms.viewRequests, label: 'OT Requests' },
    requisition: { ok: perms.viewRequisition || perms.approveRequisition, label: 'Overtime Requisition' },
    attendance: { ok: perms.viewAttendance, label: 'OT Attendance & Bio-Punches' },
    batch_allocation: { ok: perms.viewBatchAllocation, label: 'Batch Allocation & Split' },
    payroll_costing_sync: { ok: perms.viewPayrollSync, label: 'Payroll & Costing Dual-Sync' },
    policies: { ok: perms.viewPolicies, label: 'Policy Configuration' },
    reports: { ok: perms.viewReports, label: 'Reports & Export' },
  };

  const entry = map[subPage];
  if (!entry || !entry.ok) {
    return {
      allowed: false,
      reason: `Access Restricted: Your account lacks "${entry?.label || subPage}" permission under Overtime Management Hub.`,
    };
  }
  return { allowed: true };
}

export function authorizeOvertimeReport(
  user: any,
  reportIdOrKey?: number | string
): { allowed: boolean; reason?: string } {
  const baseAuth = authorizeOvertimeSubPage(user, 'reports');
  if (!baseAuth.allowed) return baseAuth;

  const perms = resolveOvertimePermissions(user);
  const reportEntries: Array<{ id: number; key: string; label: string; ok: boolean }> = [
    { id: 1, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_EMPLOYEE_MONTHLY, label: 'Employee-wise Monthly Overtime Report', ok: perms.reportEmployeeMonthly },
    { id: 2, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_DAILY_FACTORY_BILL, label: 'Daily Factory Overtime Bill Report', ok: perms.reportDailyFactoryBill },
    { id: 3, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_PRODUCTION_BATCH_COST, label: 'Production Batch-wise Overtime Cost Report', ok: perms.reportProductionBatchCost },
    { id: 4, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_PRODUCTION_ORDER_COST, label: 'Production Order-wise Overtime Cost Report', ok: perms.reportProductionOrderCost },
    { id: 5, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_PAYROLL_RECONCILIATION, label: 'Monthly Overtime Payroll Reconciliation Report', ok: perms.reportPayrollReconciliation },
    { id: 6, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_PENDING_APPROVAL_WORKFLOW, label: 'Pending Overtime Approval Workflow Report', ok: perms.reportPendingApprovalWorkflow },
    { id: 7, key: OVERTIME_PAGE_PERMISSION_KEYS.REPORT_HOURS_VS_OUTPUT, label: 'Overtime Hours vs Production Output Report', ok: perms.reportHoursVsOutput },
  ];

  if (reportIdOrKey !== undefined && reportIdOrKey !== null && reportIdOrKey !== '') {
    const normalized = String(reportIdOrKey).trim();
    const target = reportEntries.find(
      (r) => String(r.id) === normalized || r.key === normalized
    );
    if (!target || !target.ok) {
      return {
        allowed: false,
        reason: `Access Restricted: Your account lacks permission for "${target?.label || normalized}".`,
      };
    }
    return { allowed: true };
  }

  if (!reportEntries.some((r) => r.ok)) {
    return {
      allowed: false,
      reason: 'Access Restricted: No individual Overtime Reports are enabled for your account.',
    };
  }
  return { allowed: true };
}

export function sanitizeOvertimeRecordForUser<T extends Record<string, any>>(record: T, user: any): T {
  const perms = resolveOvertimePermissions(user);
  if (perms.viewCost) return record;
  const copy: Record<string, any> = { ...record };
  delete copy.basicSalaryBDT;
  delete copy.basic_salary_bdt;
  delete copy.grossSalaryBDT;
  delete copy.hourlyRateBDT;
  delete copy.hourly_rate_bdt;
  delete copy.overtimeMultiplier;
  delete copy.overtime_multiplier;
  delete copy.calculatedOvertimeAmountBDT;
  delete copy.calculated_overtime_amount_bdt;
  if (Array.isArray(copy.batchAllocations)) {
    copy.batchAllocations = copy.batchAllocations.map((a: Record<string, any>) => {
      const next = { ...a };
      delete next.hourlyRateBDT;
      delete next.hourly_rate_bdt;
      delete next.allocatedCostBDT;
      delete next.allocated_cost_bdt;
      return next;
    });
  }
  return copy as T;
}

export function getOvertimeAuthHeaders(user: any): Record<string, string> {
  if (!user) return {};
  const headers: Record<string, string> = {};
  if (user.id) headers['x-user-id'] = String(user.id);
  if (user.userId) headers['x-user-code'] = String(user.userId);
  if (user.email) headers['x-user-email'] = String(user.email);
  return headers;
}
