/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Shared Payroll & HR Page-Wise Authorization Engine
 * Enforces the 12 page-wise Payroll & HR permissions across sidebar/navigation,
 * direct URL routing, and module views.
 */

export type PayrollTab =
  | 'dashboard'
  | 'salary_structure'
  | 'attendance'
  | 'leaves'
  | 'loans'
  | 'bonuses'
  | 'processing'
  | 'salary_sheets'
  | 'payments'
  | 'payslips'
  | 'reports'
  | 'settings';

export const PAYROLL_PAGE_PERMISSION_KEYS = {
  VIEW: 'view',
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_SALARY_STRUCTURE: 'view_salary_structure',
  VIEW_ATTENDANCE: 'view_attendance',
  VIEW_LEAVES: 'view_leaves',
  VIEW_ADVANCES_LOANS: 'view_advances_loans',
  VIEW_BONUSES_INCENTIVES: 'view_bonuses_incentives',
  VIEW_MONTHLY_RUN: 'view_monthly_run',
  VIEW_SALARY_SHEETS: 'view_salary_sheets',
  VIEW_DISBURSEMENTS: 'view_disbursements',
  VIEW_PAYSLIPS: 'view_payslips',
  VIEW_REPORTS: 'view_reports',
  VIEW_SETTINGS: 'view_settings',
} as const;

export interface PayrollSubpageDef {
  order: number;
  tab: PayrollTab;
  actionKey: string;
  label: string;
  navLabel: string;
  description: string;
  routeSlug: string;
  aliases: string[];
}

export const PAYROLL_SUBPAGE_DEFS: readonly PayrollSubpageDef[] = [
  {
    order: 1,
    tab: 'dashboard',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_DASHBOARD,
    label: 'Dashboard',
    navLabel: '1. Dashboard',
    description: 'Allow access to Payroll & HR overview KPIs and cost breakdowns',
    routeSlug: 'dashboard',
    aliases: ['dashboard', 'overview'],
  },
  {
    order: 2,
    tab: 'salary_structure',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_SALARY_STRUCTURE,
    label: 'Salary Structure',
    navLabel: '2. Salary Structure',
    description: 'Allow access to employee salary structures and compensation setups',
    routeSlug: 'salary-structure',
    aliases: ['salary-structure', 'salary_structure', 'salarystructure', 'structure'],
  },
  {
    order: 3,
    tab: 'attendance',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_ATTENDANCE,
    label: 'Attendance',
    navLabel: '3. Attendance',
    description: 'Allow access to attendance logs, daily grids, and GPS punch audits',
    routeSlug: 'attendance',
    aliases: ['attendance', 'attendances'],
  },
  {
    order: 4,
    tab: 'leaves',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_LEAVES,
    label: 'Leaves',
    navLabel: '4. Leaves',
    description: 'Allow access to employee leave balances and leave applications',
    routeSlug: 'leaves',
    aliases: ['leaves', 'leave'],
  },
  {
    order: 5,
    tab: 'loans',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_ADVANCES_LOANS,
    label: 'Advances & Loans',
    navLabel: '5. Advances & Loans',
    description: 'Allow access to salary advances, employee loans, and repayment schedules',
    routeSlug: 'advances-loans',
    aliases: ['advances-loans', 'advances_loans', 'loans', 'advances', 'advance-loans'],
  },
  {
    order: 6,
    tab: 'bonuses',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_BONUSES_INCENTIVES,
    label: 'Bonuses & Incentives',
    navLabel: '6. Bonuses & Incentives',
    description: 'Allow access to festival bonuses, performance bonuses, and incentives',
    routeSlug: 'bonuses-incentives',
    aliases: ['bonuses-incentives', 'bonuses_incentives', 'bonuses', 'incentives'],
  },
  {
    order: 7,
    tab: 'processing',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_MONTHLY_RUN,
    label: 'Monthly Run',
    navLabel: '7. Monthly Run',
    description: 'Allow access to monthly payroll calculation and run processing',
    routeSlug: 'monthly-run',
    aliases: ['monthly-run', 'monthly_run', 'processing', 'run'],
  },
  {
    order: 8,
    tab: 'salary_sheets',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_SALARY_SHEETS,
    label: 'Salary Sheets',
    navLabel: '8. Salary Sheets',
    description: 'Allow access to generated monthly salary sheets and registers',
    routeSlug: 'salary-sheets',
    aliases: ['salary-sheets', 'salary_sheets', 'sheets'],
  },
  {
    order: 9,
    tab: 'payments',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_DISBURSEMENTS,
    label: 'Disbursements',
    navLabel: '9. Disbursements',
    description: 'Allow access to salary payout disbursements and bank advice',
    routeSlug: 'disbursements',
    aliases: ['disbursements', 'payments', 'disbursement'],
  },
  {
    order: 10,
    tab: 'payslips',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_PAYSLIPS,
    label: 'Payslips',
    navLabel: '10. Payslips',
    description: 'Allow access to individual employee payslips and printouts',
    routeSlug: 'payslips',
    aliases: ['payslips', 'payslip'],
  },
  {
    order: 11,
    tab: 'reports',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_REPORTS,
    label: 'Reports',
    navLabel: '11. Reports (13)',
    description: 'Allow access to Payroll & HR statutory and analytical reports',
    routeSlug: 'reports',
    aliases: ['reports', 'report'],
  },
  {
    order: 12,
    tab: 'settings',
    actionKey: PAYROLL_PAGE_PERMISSION_KEYS.VIEW_SETTINGS,
    label: 'Settings',
    navLabel: '12. Settings',
    description: 'Allow access to corporate payroll rules and shift/geofence settings',
    routeSlug: 'settings',
    aliases: ['settings', 'setting'],
  },
] as const;

export const PAYROLL_SUBPAGE_ACTION_MAP: Record<PayrollTab, string> = PAYROLL_SUBPAGE_DEFS.reduce(
  (acc, item) => {
    acc[item.tab] = item.actionKey;
    return acc;
  },
  {} as Record<PayrollTab, string>
);

export const PAYROLL_SUBPAGE_ACTION_KEYS: readonly string[] = PAYROLL_SUBPAGE_DEFS.map(
  (d) => d.actionKey
);

export interface PayrollPagePermissions {
  view: boolean;
  dashboard: boolean;
  salary_structure: boolean;
  attendance: boolean;
  leaves: boolean;
  loans: boolean;
  bonuses: boolean;
  processing: boolean;
  salary_sheets: boolean;
  payments: boolean;
  payslips: boolean;
  reports: boolean;
  settings: boolean;
}

export const ALL_PAYROLL_PAGES_OFF: PayrollPagePermissions = {
  view: false,
  dashboard: false,
  salary_structure: false,
  attendance: false,
  leaves: false,
  loans: false,
  bonuses: false,
  processing: false,
  salary_sheets: false,
  payments: false,
  payslips: false,
  reports: false,
  settings: false,
};

export const ALL_PAYROLL_PAGES_ON: PayrollPagePermissions = {
  view: true,
  dashboard: true,
  salary_structure: true,
  attendance: true,
  leaves: true,
  loans: true,
  bonuses: true,
  processing: true,
  salary_sheets: true,
  payments: true,
  payslips: true,
  reports: true,
  settings: true,
};

function parseUserPermissions(user: any): {
  pagePerms?: Record<string, Record<string, boolean>>;
  allowedModules: string[];
} {
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

function resolveTabFlag(
  payrollPerms: Record<string, boolean> | undefined,
  allowedModules: string[],
  actionKey: string
): boolean {
  if (payrollPerms) {
    if (!payrollPerms.view) return false;
    if (payrollPerms[actionKey] !== undefined) {
      return Boolean(payrollPerms[actionKey]);
    }
    return true; // Backward compatibility for existing users saved before the 12 subpage keys existed
  }
  return allowedModules.includes('payroll');
}

export function resolvePayrollPagePermissions(user: any): PayrollPagePermissions {
  if (!user || user.status === 'Blocked' || user.status === 'Inactive') {
    return { ...ALL_PAYROLL_PAGES_OFF };
  }
  if (user.role === 'Super Admin') {
    return { ...ALL_PAYROLL_PAGES_ON };
  }

  const { pagePerms, allowedModules } = parseUserPermissions(user);
  const payrollPerms = pagePerms?.['payroll'];
  const baseView = payrollPerms ? Boolean(payrollPerms.view) : allowedModules.includes('payroll');

  if (!baseView) {
    return { ...ALL_PAYROLL_PAGES_OFF };
  }

  const resolved: PayrollPagePermissions = {
    view: false,
    dashboard: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_DASHBOARD),
    salary_structure: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_SALARY_STRUCTURE),
    attendance: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_ATTENDANCE),
    leaves: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_LEAVES),
    loans: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_ADVANCES_LOANS),
    bonuses: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_BONUSES_INCENTIVES),
    processing: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_MONTHLY_RUN),
    salary_sheets: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_SALARY_SHEETS),
    payments: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_DISBURSEMENTS),
    payslips: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_PAYSLIPS),
    reports: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_REPORTS),
    settings: resolveTabFlag(payrollPerms, allowedModules, PAYROLL_PAGE_PERMISSION_KEYS.VIEW_SETTINGS),
  };

  const hasAnySubpage = PAYROLL_SUBPAGE_DEFS.some((d) => resolved[d.tab]);
  if (!hasAnySubpage) {
    return { ...ALL_PAYROLL_PAGES_OFF };
  }

  resolved.view = true;
  return resolved;
}

export function isPayrollTabPermitted(user: any, tab: PayrollTab): boolean {
  const perms = resolvePayrollPagePermissions(user);
  return Boolean(perms.view && perms[tab]);
}

export function getFirstPermittedPayrollTab(user: any): PayrollTab | null {
  const perms = resolvePayrollPagePermissions(user);
  if (!perms.view) return null;
  for (const def of PAYROLL_SUBPAGE_DEFS) {
    if (perms[def.tab]) return def.tab;
  }
  return null;
}

export function authorizePayrollSubPage(
  user: any,
  tab: PayrollTab
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required to access Payroll & HR.' };
  }
  const perms = resolvePayrollPagePermissions(user);
  if (!perms.view) {
    return {
      allowed: false,
      reason: 'Access Restricted: Your account does not have permission to access Payroll & Human Resources.',
    };
  }
  const def = PAYROLL_SUBPAGE_DEFS.find((d) => d.tab === tab);
  if (!def || !perms[tab]) {
    return {
      allowed: false,
      reason: `Access Restricted: Your account lacks "${def?.label || tab}" permission under Payroll & Human Resources.`,
    };
  }
  return { allowed: true };
}

export function normalizePayrollSlugToTab(slug: string): PayrollTab | null {
  const clean = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  if (!clean) return null;

  for (const def of PAYROLL_SUBPAGE_DEFS) {
    if (def.tab === clean || def.routeSlug === clean || def.aliases.includes(clean)) {
      return def.tab;
    }
  }
  return null;
}

export function payrollTabToRouteSlug(tab: PayrollTab): string {
  const found = PAYROLL_SUBPAGE_DEFS.find((d) => d.tab === tab);
  return found ? found.routeSlug : 'dashboard';
}

export function payrollTabToModuleId(tab: PayrollTab): string {
  return `payroll-${payrollTabToRouteSlug(tab)}`;
}

export function payrollModuleIdToTab(moduleId: string): PayrollTab | null {
  if (!moduleId || moduleId === 'payroll') return null;
  if (!moduleId.startsWith('payroll-')) return null;
  const slug = moduleId.slice('payroll-'.length);
  return normalizePayrollSlugToTab(slug);
}

export function payrollTabToPathname(tab: PayrollTab): string {
  return `/payroll/${payrollTabToRouteSlug(tab)}`;
}

export function parsePayrollTabFromRoute(
  pathname: string,
  search: string = '',
  hash: string = ''
): { tab: PayrollTab | null; isExplicit: boolean; rawSlug?: string } {
  const cleanPath = String(pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (cleanPath.startsWith('payroll/')) {
    const subSlug = cleanPath.slice('payroll/'.length).split('/')[0];
    return {
      tab: normalizePayrollSlugToTab(subSlug),
      isExplicit: true,
      rawSlug: subSlug,
    };
  }

  if (search) {
    try {
      const params = new URLSearchParams(search);
      const queryTab = params.get('tab') || params.get('page') || params.get('section');
      if (queryTab) {
        return {
          tab: normalizePayrollSlugToTab(queryTab),
          isExplicit: true,
          rawSlug: queryTab,
        };
      }
    } catch {
      // ignore invalid search params
    }
  }

  if (hash) {
    const cleanHash = hash.replace(/^#\/?/, '').trim();
    if (cleanHash) {
      const parsed = normalizePayrollSlugToTab(cleanHash);
      if (parsed) {
        return {
          tab: parsed,
          isExplicit: true,
          rawSlug: cleanHash,
        };
      }
    }
  }

  return { tab: null, isExplicit: false };
}
