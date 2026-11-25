import type { User } from '../types/erp.ts';
import {
  canApproveFactoryExpense,
  canAllocateManufacturingOverhead,
  canPostFactoryExpense,
  canRollbackCostAllocation,
  canViewManufacturingCostDashboard,
  canViewManufacturingCostSheet,
  hasAnyManufacturingCostingAccess,
  hasPageAccess,
} from '../types/pagePermissions.ts';
import {
  getFirstPermittedPayrollTab,
  isPayrollTabPermitted,
  payrollModuleIdToTab,
} from './payrollPermissions.ts';

export const WORKSPACE_WELCOME_MODULE = 'welcome';

/**
 * Primary module Dashboards in exact configured Sidebar.tsx menu priority order.
 * After login, the user is redirected to the first Dashboard they are authorized to access.
 */
export const DASHBOARD_PRIORITY_MODULES: readonly string[] = [
  'dashboard',                     // CORE PLATFORM -> Executive Dashboard
  'finance-accounting-dashboard',  // ACCOUNTS & FINANCE -> Accounting Dashboard
  'installment-dashboard',         // ACCOUNTS & FINANCE -> Installment Dashboard
  'collection-dashboard',          // ACCOUNTS & FINANCE -> Collection Dashboard
  'sms-dashboard',                 // ACCOUNTS & FINANCE -> SMS Dashboard
  'payroll-dashboard',             // ACCOUNTS & FINANCE -> Payroll & HR Dashboard
  'overtime-dashboard',            // ACCOUNTS & FINANCE -> Overtime Management Dashboard
  'warranty-dashboard',            // WARRANTY & SERVICE -> Warranty Dashboard
];

/**
 * Exact top-to-bottom navigation order matching Sidebar.tsx navSections.
 */
export const SIDEBAR_ORDERED_MODULES: readonly string[] = [
  // CORE PLATFORM
  'dashboard',

  // SUPPLY CHAIN & FACTORY
  'raw-material-receive',
  'raw-material-inventory',
  'procurement',
  'manufacturing',
  'manufacturing-costing',

  // STOCK
  'stock-cid-receive',
  'stock-create-opening',
  'stock-upload-opening',
  'stock-upload-primary',
  'stock-issued',
  'stock-received',
  'stock-primary-return',
  'stock-damage-return',
  'stock-transfer',
  'stock-adjustment',
  'inventory-stock',
  'warehouse',

  // FIELD FORCE & SALES
  'field-tracker',
  'mobile-field',
  'sales-orders',
  'sales-orders-registry',
  'crm-agreements',
  'tada',

  // ACCOUNTS & FINANCE
  'finance-accounting-dashboard',
  'finance-coa',
  'finance-opening-balances',
  'finance-journal-vouchers',
  'finance-general-ledger',
  'finance-cash-book',
  'finance-bank-book',
  'finance-receivables',
  'finance-payables',
  'finance-trial-balance',
  'finance-balance-sheet',
  'finance-profit-loss',
  'finance-cash-flow',
  'finance-fiscal-years',
  'finance-cashbook',

  // Installment Management
  'installment-dashboard',
  'installment-new-plan',
  'installment-agreements',
  'installment-schedule',
  'installment-customers',
  'installment-due',
  'installment-overdue',
  'installment-payment-collection',
  'installment-payment-history',
  'installment-early-settlement',
  'installment',

  // Collection Management
  'collection-dashboard',
  'collection-target',
  'collection-upcoming',
  'collection-overdue',
  'collection-followup',
  'collection-assignments',
  'collection-history',
  'collection',

  // SMS & Notification Center
  'sms-dashboard',
  'sms-templates',
  'sms-rules',
  'sms-history',
  'sms-failed',
  'sms-settings',
  'sms',

  // Installment Reports
  'report-installment-receivable',
  'report-monthly-collection',
  'report-installment-overdue',
  'report-customer-ledger',
  'report-installment-aging',
  'report-officer-performance',
  'report-sms-delivery',

  // Payroll & HR / Overtime / Reports
  'payroll-dashboard',
  'payroll',
  'overtime-dashboard',
  'overtime-requests',
  'overtime-requisition',
  'overtime-attendance',
  'overtime-batch-allocation',
  'overtime-sync',
  'overtime-policies',
  'overtime-reports',
  'overtime-management',
  'reports',

  // BASIC DATA | USER & WARRANTY
  'warranty-dashboard',
  'warranty-complaints',
  'warranty-jobcards',
  'warranty-receiving',
  'warranty-verification',
  'warranty-inspection',
  'warranty-repair',
  'warranty-parts-consumption',
  'warranty-estimation',
  'warranty-billing',
  'warranty-qc',
  'warranty-dispatch',
  'warranty-policies',
  'warranty-history',
  'warranty-reports',
  'warranty-settings',
  'warranty',

  // Basic Data (only accessible via manual sidebar click; never default landing page)
  'basic-data-raw-materials',
  'basic-data-raw-categories',
  'basic-data-raw-classifications',
  'basic-data-products',
  'basic-data-categories',
  'basic-data-brands',
  'basic-data-warehouses',
  'basic-data-distributors',
  'basic-data-customers',
  'basic-data-pricing-matrix',
  'basic-data-org-hierarchy',
  'basic-data-field-force',
  'basic-data-departments',
  'basic-data-banks',
  'basic-data-uom',
  'basic-data-offers',

  'users-permissions',
  'settings',
];

const BASIC_DATA_ALIAS_MODULES = new Set([
  'basic-data',
  'raw-materials',
  'distributors',
  'org-hierarchy',
  'uom',
  'offers',
  'categories',
  'brands',
  'products',
  'warehouses',
  'customers',
  'departments',
  'banks',
  'pricing-matrix',
  'field-force',
]);

/**
 * Returns true if the module belongs to Basic Data (e.g. Basic Data -> Employee).
 * Basic Data pages must NEVER be opened automatically as the post-login landing page.
 */
export function isBasicDataModule(moduleId?: string | null): boolean {
  if (!moduleId) return false;
  const normalized = moduleId.trim().toLowerCase();
  return normalized.startsWith('basic-data-') || BASIC_DATA_ALIAS_MODULES.has(normalized);
}

/**
 * Evaluates whether the user has existing ERP clearance to view a given module/route.
 * Preserves all existing page-wise, role-wise, and manufacturing costing checks without bypassing anything.
 */
export function isUserPermittedForModule(
  user: Partial<User> | null | undefined,
  moduleId: string
): boolean {
  if (!user || !user.id || user.id === 'guest') return false;
  if (user.status === 'Blocked' || user.status === 'Inactive') return false;
  if (moduleId === WORKSPACE_WELCOME_MODULE) return true;
  if (user.role === 'Super Admin') return true;

  if (moduleId === 'manufacturing-cost-sheet') {
    return canViewManufacturingCostSheet(user);
  }
  if (moduleId === 'manufacturing-costing') {
    return hasAnyManufacturingCostingAccess(user);
  }
  if (moduleId === 'manufacturing-expenses') {
    return (
      canViewManufacturingCostDashboard(user) ||
      canPostFactoryExpense(user) ||
      canApproveFactoryExpense(user)
    );
  }
  if (moduleId === 'manufacturing-allocations') {
    return (
      canViewManufacturingCostDashboard(user) ||
      canAllocateManufacturingOverhead(user) ||
      canRollbackCostAllocation(user)
    );
  }

  if (moduleId === 'payroll') {
    return hasPageAccess(user, 'payroll') && getFirstPermittedPayrollTab(user) !== null;
  }
  if (moduleId.startsWith('payroll-')) {
    const tab = payrollModuleIdToTab(moduleId);
    return Boolean(tab && isPayrollTabPermitted(user, tab));
  }

  return hasPageAccess(user, moduleId);
}

/**
 * Returns all modules the user can access in sidebar menu order.
 */
export function getAccessibleModulesForUser(
  user: Partial<User> | null | undefined
): string[] {
  if (!user || !user.id || user.id === 'guest') return [];
  if (user.status === 'Blocked' || user.status === 'Inactive') return [];
  return SIDEBAR_ORDERED_MODULES.filter((mod) => isUserPermittedForModule(user, mod));
}

/**
 * Selects the first accessible page/module for the user following sidebar menu order.
 * Returns null if the user has no accessible modules at all.
 */
export function getFirstAccessibleModule(
  user: Partial<User> | null | undefined
): string | null {
  if (!user || !user.id || user.id === 'guest') return null;
  if (user.status === 'Blocked' || user.status === 'Inactive') return null;

  for (const mod of SIDEBAR_ORDERED_MODULES) {
    if (isUserPermittedForModule(user, mod)) {
      return mod;
    }
  }
  return null;
}

/**
 * Resolves the default post-login landing page based on assigned permissions:
 * 1. First accessible Dashboard following configured sidebar menu priority
 *    (Executive -> Accounting -> Installment -> Collection -> SMS -> Payroll & HR -> Overtime -> Warranty).
 * 2. Otherwise, first accessible non-Basic-Data primary operational module in sidebar menu order.
 * 3. NEVER returns any Basic Data page (e.g. Basic Data -> Employee).
 */
export function getDefaultLandingModule(
  user: Partial<User> | null | undefined
): string | null {
  if (!user || !user.id || user.id === 'guest') return null;
  if (user.status === 'Blocked' || user.status === 'Inactive') return null;

  for (const dashboardMod of DASHBOARD_PRIORITY_MODULES) {
    if (isUserPermittedForModule(user, dashboardMod)) {
      return dashboardMod;
    }
  }

  for (const mod of SIDEBAR_ORDERED_MODULES) {
    if (isBasicDataModule(mod)) continue;
    if (isUserPermittedForModule(user, mod)) {
      return mod;
    }
  }

  return null;
}

/**
 * Resolves the post-login landing module:
 * 1. Honors an explicit non-Basic-Data deep-link module if the user has permission for it.
 * 2. Otherwise opens the highest-priority accessible Dashboard (or non-Basic-Data primary module).
 * 3. If the user only has Basic Data access, lands on the workspace welcome screen so
 *    Basic Data (including Employee) is NEVER opened automatically after login.
 */
export function resolvePostLoginModule(
  user: Partial<User> | null | undefined,
  intendedModule?: string | null
): string | null {
  if (!user || !user.id || user.id === 'guest') return null;
  if (user.status === 'Blocked' || user.status === 'Inactive') return null;

  if (
    intendedModule &&
    intendedModule !== 'dashboard' &&
    intendedModule !== WORKSPACE_WELCOME_MODULE &&
    !isBasicDataModule(intendedModule) &&
    isUserPermittedForModule(user, intendedModule)
  ) {
    return intendedModule;
  }

  const defaultLanding = getDefaultLandingModule(user);
  if (defaultLanding) {
    return defaultLanding;
  }

  // User has Basic Data permission(s) only: never auto-open Basic Data after login
  return getFirstAccessibleModule(user) ? WORKSPACE_WELCOME_MODULE : null;
}
