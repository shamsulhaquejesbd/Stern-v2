import React, { useState, useEffect, useCallback } from 'react';
import { ERPProvider, useERP } from './context/ERPContext.tsx';
import { CashBankProvider } from './context/CashBankContext.tsx';
import { Sidebar } from './components/common/Sidebar.tsx';
import { ArchitectureBlueprintModal } from './components/architecture/ArchitectureBlueprintModal.tsx';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard.tsx';
import { ProcurementModule } from './components/procurement/ProcurementModule.tsx';
import { ManufacturingModule } from './components/manufacturing/ManufacturingModule.tsx';
import { WarehouseModule } from './components/inventory/WarehouseModule.tsx';
import { DistributorModule } from './components/distribution/DistributorModule.tsx';
import { CustomerCRMModule } from './components/crm/CustomerCRMModule.tsx';
import { CRMAgreementsPage } from './components/crm/CRMAgreementsPage.tsx';
import { FieldForceTrackerModule } from './components/fieldforce/FieldForceTrackerModule.tsx';
import { MobileSalesPortal } from './components/fieldforce/MobileSalesPortal.tsx';
import { SalesOrdersModule } from './components/sales/SalesOrdersModule.tsx';
import { SalesOrdersRegistryModule } from './components/sales/SalesOrdersRegistryModule.tsx';
import { RequisitionModule } from './components/requisition/RequisitionModule.tsx';
import { PaymentModule } from './components/payment/PaymentModule.tsx';
import { TADAModule } from './components/tada/TADAModule.tsx';
import { OffersPromotionModule } from './components/offers/OffersPromotionModule.tsx';
import { FinanceCashBookModule } from './components/finance/FinanceCashBookModule.tsx';
import { InstallmentManagementModule } from './components/installment/InstallmentManagementModule.tsx';
import { CollectionManagementModule } from './components/collection/CollectionManagementModule.tsx';
import { SMSNotificationHub } from './components/sms/SMSNotificationHub.tsx';
import { InstallmentReportsHub } from './components/installment/reports/InstallmentReportsHub.tsx';
import { PayrollModule } from './components/payroll/PayrollModule.tsx';
import { OvertimeModule } from './components/overtime/OvertimeModule.tsx';
import { ReportsModule } from './components/reports/ReportsModule.tsx';
import { OrgHierarchyAndRoles } from './components/settings/OrgHierarchyAndRoles.tsx';
import { SettingsPage } from './components/settings/SettingsPage.tsx';
import { UserManagementModule } from './components/users/UserManagementModule.tsx';
import { BrandLogoMark } from './components/common/BrandLogoMark.tsx';
import { formatSoftwareDisplayTitle } from './types/systemSettings.ts';
import {
  FinishedProductsPage,
  ProductCategoriesPage,
  ProductBrandsPage,
  RawMaterialsPage,
  RawMaterialsCategoryPage,
  RawMaterialsClassificationPage,
  WarehousePage,
  CustomerDirectoryPage,
  FieldForcePage,
  DepartmentPage,
  BankListPage,
  UnitOfMeasurementPage,
  ChannelPricingPage,
} from './components/basicdata/BasicDataHub.tsx';
import { StockModule } from './components/stock/StockModule.tsx';
import { InventoryStockPage } from './components/stock/InventoryStockPage.tsx';
import { RawMaterialReceivePage } from './components/inventory/RawMaterialReceivePage.tsx';
import { RawMaterialInventoryPage } from './components/inventory/RawMaterialInventoryPage.tsx';
import { WarrantyManagementModule } from './components/warranty/WarrantyManagementModule.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { ProductionCostSheetModal } from './components/manufacturing/ProductionCostSheetModal.tsx';
import { canViewManufacturingCostSheet } from './types/pagePermissions.ts';
import {
  getAccessibleModulesForUser,
  getDefaultLandingModule,
  getFirstAccessibleModule,
  isBasicDataModule,
  isUserPermittedForModule,
  resolvePostLoginModule,
  WORKSPACE_WELCOME_MODULE,
} from './lib/postLoginRedirect.ts';
import {
  parsePayrollTabFromRoute,
  payrollModuleIdToTab,
  payrollTabToModuleId,
  payrollTabToPathname,
} from './lib/payrollPermissions.ts';
import { ShieldAlert, ArrowLeft, Menu, LogOut } from 'lucide-react';

// Maps incoming browser URL pathname -> ERP activeModule ID
export function pathnameToModule(pathname: string): string {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (!clean || clean === 'dashboard' || clean === 'login') {
    return 'dashboard';
  }

  if (
    clean === 'cost-sheet' ||
    clean.startsWith('cost-sheet/') ||
    clean === 'manufacturing-cost-sheet' ||
    clean.startsWith('manufacturing-cost-sheet/') ||
    clean === 'manufacturing/cost-sheet' ||
    clean.startsWith('manufacturing/cost-sheet/') ||
    clean === 'production/cost-sheet' ||
    clean.startsWith('production/cost-sheet/')
  ) {
    return 'manufacturing-cost-sheet';
  }

  if (clean === 'payroll') {
    return 'payroll';
  }
  if (clean.startsWith('payroll/')) {
    const parsed = parsePayrollTabFromRoute(pathname);
    return parsed.tab ? payrollTabToModuleId(parsed.tab) : 'payroll-unknown';
  }

  const ALIAS_MAP: Record<string, string> = {
    // Primary URL routes
    'crm': 'customers-crm',
    'raw-materials': 'basic-data-raw-materials',
    'field-force': 'field-tracker',
    'inventory': 'inventory-stock',
    'production': 'manufacturing',
    'accounts': 'finance-cashbook',
    'payroll': 'payroll',
    'sales': 'sales-orders',

    // Direct module aliases
    'manufacturing': 'manufacturing',
    'costing': 'manufacturing-costing',
    'warehouse': 'warehouse',
    'stock': 'stock',
    'procurement': 'procurement',
    'finance': 'finance-cashbook',
    'cashbook': 'finance-cashbook',
    'cash-bank': 'finance-cashbook',
    'coa': 'finance-coa',
    'chart-of-accounts': 'finance-coa',
    'opening-balances': 'finance-opening-balances',
    'journal-vouchers': 'finance-journal-vouchers',
    'general-ledger': 'finance-general-ledger',
    'receivables': 'finance-receivables',
    'payables': 'finance-payables',
    'trial-balance': 'finance-trial-balance',
    'balance-sheet': 'finance-balance-sheet',
    'profit-loss': 'finance-profit-loss',
    'cash-flow': 'finance-cash-flow',
    'fiscal-years': 'finance-fiscal-years',
    'installment': 'installment',
    'collection': 'collection',
    'sms': 'sms',
    'tada': 'tada',
    'warranty': 'warranty',
    'reports': 'reports',
    'users': 'users-permissions',
    'users-permissions': 'users-permissions',
    'permissions': 'users-permissions',
    'settings': 'settings',
    'system-settings': 'settings',
    'requisition': 'requisition',
    'payment': 'payment',
    'sales-orders': 'sales-orders',
    'sales-orders-registry': 'sales-orders-registry',
    'crm-agreements': 'crm-agreements',
    'customers-crm': 'customers-crm',
    'mobile-field': 'mobile-field',
    'field-tracker': 'field-tracker',
    'overtime': 'overtime-management',
    'overtime-management': 'overtime-management',
    'overtime-requisition': 'overtime-requisition',
    'overtime/requisition': 'overtime-requisition',
    'raw-material-receive': 'raw-material-receive',
    'raw-material-inventory': 'raw-material-inventory',
    'finished-goods-receive': 'stock-cid-receive',
    'fg-receive': 'stock-cid-receive',
    'basic-data': 'basic-data',
    'basic-data-products': 'basic-data-products',
    'basic-data-categories': 'basic-data-categories',
    'basic-data-brands': 'basic-data-brands',
    'basic-data-raw-materials': 'basic-data-raw-materials',
    'basic-data-raw-categories': 'basic-data-raw-categories',
    'basic-data-raw-classifications': 'basic-data-raw-classifications',
    'basic-data-warehouses': 'basic-data-warehouses',
    'basic-data-distributors': 'basic-data-distributors',
    'basic-data-customers': 'basic-data-customers',
    'basic-data-pricing-matrix': 'basic-data-pricing-matrix',
    'basic-data-org-hierarchy': 'basic-data-org-hierarchy',
    'basic-data-field-force': 'basic-data-field-force',
    'basic-data-departments': 'basic-data-departments',
    'basic-data-banks': 'basic-data-banks',
    'basic-data-uom': 'basic-data-uom',
    'basic-data-offers': 'basic-data-offers',
  };

  return ALIAS_MAP[clean] || clean;
}

// Maps ERP activeModule ID -> canonical URL pathname
export function moduleToPathname(module: string): string {
  if (!module || module === 'dashboard') {
    return '/dashboard';
  }

  const MODULE_PATH_MAP: Record<string, string> = {
    'customers-crm': '/crm',
    'crm-agreements': '/crm-agreements',
    'basic-data-raw-materials': '/raw-materials',
    'field-tracker': '/field-force',
    'inventory-stock': '/inventory',
    'manufacturing': '/production',
    'manufacturing-costing': '/costing',
    'finance-cashbook': '/accounts',
    'payroll': '/payroll',
    'sales-orders': '/sales',
    'users-permissions': '/users',
    'overtime-management': '/overtime',
  };

  if (module.startsWith('payroll-')) {
    const tab = payrollModuleIdToTab(module);
    if (tab) return payrollTabToPathname(tab);
  }

  return MODULE_PATH_MAP[module] || `/${module}`;
}

function MainApp() {
  const { currentUser, isAuthenticated, logout, productionOrders, systemBranding } = useERP();

  // Initialize activeModule from current browser pathname so F5 refresh preserves route!
  const [activeModule, setActiveModule] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return pathnameToModule(window.location.pathname);
    }
    return 'dashboard';
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Centralized navigation handler: updates both state and browser URL via pushState
  const navigateTo = useCallback((moduleKey: string) => {
    setActiveModule(moduleKey);
    if (typeof window !== 'undefined') {
      const newPath = moduleToPathname(moduleKey);
      if (window.location.pathname !== newPath) {
        window.history.pushState({ module: moduleKey }, '', newPath);
      }
    }
  }, []);

  // Listen for browser popstate (Back/Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const targetModule = pathnameToModule(window.location.pathname);
      setActiveModule(targetModule);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle custom navigation events
  useEffect(() => {
    const handleNavigate = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        navigateTo(e.detail);
      }
    };
    window.addEventListener('ensec-navigate', handleNavigate);
    return () => window.removeEventListener('ensec-navigate', handleNavigate);
  }, [navigateTo]);

  const hasValidActiveSession =
    isAuthenticated &&
    Boolean(currentUser?.id) &&
    currentUser.id !== 'guest' &&
    currentUser.status !== 'Blocked' &&
    currentUser.status !== 'Inactive';

  const canAccessDashboard = isUserPermittedForModule(currentUser, 'dashboard');
  const firstAccessibleModule = hasValidActiveSession ? getFirstAccessibleModule(currentUser) : null;
  const defaultLandingModule = hasValidActiveSession ? getDefaultLandingModule(currentUser) : null;
  const safeLandingModule =
    defaultLandingModule || (firstAccessibleModule ? WORKSPACE_WELCOME_MODULE : 'dashboard');

  // On initial load at root '/' or '/login' with an active session, ensure landing module respects permissions
  // and opens the user's highest-priority accessible Dashboard (never Basic Data by default).
  useEffect(() => {
    if (typeof window === 'undefined' || !hasValidActiveSession) return;
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '' || currentPath === '/login') {
      const targetModule = safeLandingModule;
      if (activeModule !== targetModule) {
        setActiveModule(targetModule);
      }
      const canonical = moduleToPathname(targetModule);
      window.history.replaceState({ module: targetModule }, '', canonical);
    }
  }, [hasValidActiveSession, safeLandingModule, activeModule]);

  // If someone navigates directly to '/basic-data', redirect to their first permitted Basic Data child page
  // rather than exposing Finished Products without basic-data-products permission.
  useEffect(() => {
    if (!hasValidActiveSession || activeModule !== 'basic-data') return;
    const firstPermittedBasicData = getAccessibleModulesForUser(currentUser).find((m) =>
      m.startsWith('basic-data-')
    );
    const targetModule = firstPermittedBasicData || safeLandingModule;
    setActiveModule(targetModule);
    if (typeof window !== 'undefined') {
      window.history.replaceState({ module: targetModule }, '', moduleToPathname(targetModule));
    }
  }, [hasValidActiveSession, activeModule, currentUser, safeLandingModule]);

  // If session was invalidated/blocked while open, ensure clean logout state
  useEffect(() => {
    if (isAuthenticated && !hasValidActiveSession) {
      logout();
    }
  }, [isAuthenticated, hasValidActiveSession, logout]);

  // If not authenticated, render Login Page and preserve non-Basic-Data intended destination
  if (!hasValidActiveSession) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/') {
      try {
        const candidateMod = pathnameToModule(window.location.pathname);
        if (!isBasicDataModule(candidateMod)) {
          sessionStorage.setItem('ensec_intended_route', window.location.pathname);
        }
      } catch {}
    }
    return (
      <LoginPage
        onLoginSuccess={(loggedInUser) => {
          let intendedModule: string | null = null;
          try {
            const intended = sessionStorage.getItem('ensec_intended_route');
            if (intended) {
              sessionStorage.removeItem('ensec_intended_route');
              intendedModule = pathnameToModule(intended);
            } else if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
              intendedModule = pathnameToModule(window.location.pathname);
            }
          } catch {}
          const authUser = loggedInUser || currentUser;
          const target = resolvePostLoginModule(authUser, intendedModule);
          navigateTo(target || 'dashboard');
        }}
      />
    );
  }

  const isModulePermitted =
    currentUser.role === 'Super Admin' || isUserPermittedForModule(currentUser, activeModule);

  const isMobilePortal = activeModule === 'mobile-field';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Mobile-only header (hidden on desktop lg and hidden when on mobile-field app view) */}
      {!isMobilePortal && (
        <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-12 px-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Menu className="w-4 h-4" />
            <span>Menu</span>
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <BrandLogoMark branding={systemBranding} size="xs" />
            <span className="font-extrabold text-xs tracking-tight text-blue-600 dark:text-blue-400 truncate max-w-[160px]">
              {formatSoftwareDisplayTitle(systemBranding.softwareName)}
            </span>
          </div>
          <div className="w-8"></div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Responsive Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeModule={activeModule}
          onSelectModule={(mod) => navigateTo(mod)}
          hideOnDesktop={isMobilePortal}
        />

        {/* Main Content Area - Full screen edge-to-edge for mobile portal, padded for standard ERP */}
        <main
          className={`flex-1 w-full ${
            isMobilePortal
              ? 'lg:pl-0 p-0 overflow-y-auto bg-slate-100 dark:bg-[#0b0c0e] no-scrollbar'
              : 'lg:pl-[18.75rem] px-4 sm:px-6 py-4 overflow-y-auto slim-scrollbar'
          }`}
        >
          {!firstAccessibleModule ? (
            <div className="p-8 max-w-md mx-auto mt-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                No Module Access Assigned
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                You currently don&apos;t have access to any modules. Please contact your administrator.
              </p>
              <p className="text-[11px] text-slate-400">
                Signed in as <b>{currentUser.name}</b> ({currentUser.role})
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  onClick={logout}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : !isModulePermitted ? (
            <div className="p-8 max-w-md mx-auto mt-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Access Clearance Restricted
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your account (<b>{currentUser.name}</b> • {currentUser.role}) does not have security permission to access the <b>{activeModule}</b> module.
              </p>
              <p className="text-[11px] text-slate-400">
                Please contact the Super Admin to request permission elevation.
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  onClick={() => navigateTo(safeLandingModule)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{defaultLandingModule ? 'Return to Dashboard' : 'Go to Authorized Workspace'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeModule === WORKSPACE_WELCOME_MODULE && (
                <div className="p-8 max-w-md mx-auto mt-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-3">
                  <div className="flex justify-center">
                    <BrandLogoMark branding={systemBranding} size="md" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Welcome, {currentUser.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Select any of your authorized modules from the sidebar menu to get started.
                  </p>
                </div>
              )}
              {activeModule === 'dashboard' && (
                <ExecutiveDashboard onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'basic-data-products' && (
                <FinishedProductsPage />
              )}
              {activeModule === 'basic-data-categories' && (
                <ProductCategoriesPage />
              )}
              {activeModule === 'basic-data-brands' && (
                <ProductBrandsPage />
              )}
              {activeModule === 'basic-data-raw-materials' && (
                <RawMaterialsPage onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'basic-data-raw-categories' && (
                <RawMaterialsCategoryPage onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'basic-data-raw-classifications' && (
                <RawMaterialsClassificationPage onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'basic-data-warehouses' && (
                <WarehousePage />
              )}
              {(activeModule === 'basic-data-distributors' || activeModule === 'distributors') && (
                <DistributorModule onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'basic-data-customers' && (
                <CustomerDirectoryPage
                  onNavigateToPricingMatrix={() => navigateTo('basic-data-pricing-matrix')}
                />
              )}
              {activeModule === 'basic-data-pricing-matrix' && (
                <ChannelPricingPage
                  onNavigateToProducts={() => navigateTo('basic-data-products')}
                  onNavigateToCustomers={() => navigateTo('basic-data-customers')}
                  onNavigateToDistributors={() => navigateTo('basic-data-distributors')}
                />
              )}
              {activeModule === 'customers-crm' && (
                <CustomerCRMModule initialTab="pricing" />
              )}
              {(activeModule === 'basic-data-org-hierarchy' || activeModule === 'org-hierarchy') && (
                <OrgHierarchyAndRoles onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'basic-data-field-force' && (
                <FieldForcePage />
              )}
              {activeModule === 'basic-data-departments' && (
                <DepartmentPage />
              )}
              {activeModule === 'basic-data-banks' && (
                <BankListPage />
              )}
              {(activeModule === 'basic-data-uom' || activeModule === 'uom') && (
                <UnitOfMeasurementPage />
              )}
              {(activeModule === 'basic-data-offers' || activeModule === 'offers') && (
                <OffersPromotionModule />
              )}
              {activeModule === 'procurement' && <ProcurementModule />}
              {activeModule === 'raw-material-receive' && <RawMaterialReceivePage />}
              {activeModule === 'raw-material-inventory' && <RawMaterialInventoryPage />}
              {activeModule === 'manufacturing' && (
                <ManufacturingModule key="manufacturing" initialTab="orders" onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'manufacturing-cost-sheet' && canViewManufacturingCostSheet(currentUser) && (() => {
                const pathParts = typeof window !== 'undefined'
                  ? window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')
                  : [];
                const queryParams = typeof window !== 'undefined'
                  ? new URLSearchParams(window.location.search)
                  : new URLSearchParams();
                const lastSegment = pathParts[pathParts.length - 1];
                const urlOrderKey =
                  queryParams.get('orderId') ||
                  queryParams.get('order') ||
                  queryParams.get('batch') ||
                  (lastSegment && !['cost-sheet', 'manufacturing-cost-sheet'].includes(lastSegment.toLowerCase())
                    ? decodeURIComponent(lastSegment)
                    : '');
                const matchedOrder =
                  (urlOrderKey
                    ? productionOrders.find(
                        (po) =>
                          String(po.id).toLowerCase() === urlOrderKey.toLowerCase() ||
                          String(po.orderNumber || '').toLowerCase() === urlOrderKey.toLowerCase() ||
                          String(po.batchNumber || '').toLowerCase() === urlOrderKey.toLowerCase()
                      )
                    : productionOrders[0]) || productionOrders[0];

                if (!matchedOrder) {
                  return (
                    <div className="p-6 max-w-lg mx-auto mt-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        No Production Order Found for Cost Sheet
                      </p>
                      <button
                        type="button"
                        onClick={() => navigateTo('manufacturing')}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Go to Manufacturing Costing &amp; BOM
                      </button>
                    </div>
                  );
                }

                return (
                  <ProductionCostSheetModal
                    order={matchedOrder}
                    onClose={() => navigateTo('manufacturing')}
                  />
                );
              })()}
              {activeModule === 'manufacturing-costing' && (
                <ManufacturingModule key="manufacturing-costing" initialTab="cost-dashboard" onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'manufacturing-expenses' && (
                <ManufacturingModule key="manufacturing-expenses" initialTab="expenses" onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'manufacturing-allocations' && (
                <ManufacturingModule key="manufacturing-allocations" initialTab="allocations" onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'warehouse' && <WarehouseModule />}
              {(activeModule === 'stock' || activeModule.startsWith('stock-')) && (
                <StockModule
                  activeSubTab={activeModule}
                  onNavigate={(mod) => navigateTo(mod)}
                />
              )}
              {(activeModule === 'inventory-stock' || activeModule.startsWith('inventory-stock')) && (
                <InventoryStockPage onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule === 'field-tracker' && <FieldForceTrackerModule />}
              {activeModule === 'mobile-field' && (
                <MobileSalesPortal
                  onBackToERP={() => navigateTo(safeLandingModule)}
                  onOpenERPMenu={() => setSidebarOpen(true)}
                />
              )}
              {activeModule === 'sales-orders' && (
                <SalesOrdersModule onNavigateToRegistry={() => navigateTo('sales-orders-registry')} />
              )}
              {activeModule === 'sales-orders-registry' && (
                <SalesOrdersRegistryModule onNavigateToCreateOrder={() => navigateTo('sales-orders')} />
              )}
              {activeModule === 'requisition' && <RequisitionModule initialTab="list" />}
              {activeModule === 'requisition-create' && <RequisitionModule initialTab="create" />}
              {activeModule === 'requisition-list' && <RequisitionModule initialTab="list" />}
              {activeModule === 'requisition-approve' && <RequisitionModule initialTab="approve" />}
              {activeModule === 'requisition-issue' && <RequisitionModule initialTab="issue" />}
              {activeModule === 'requisition-issued' && <RequisitionModule initialTab="issued" />}
              {activeModule === 'requisition-received' && <RequisitionModule initialTab="received" />}
              {activeModule === 'payment' && <PaymentModule initialTab="list" />}
              {activeModule === 'payment-list' && <PaymentModule initialTab="list" />}
              {activeModule === 'payment-create' && <PaymentModule initialTab="create" />}
              {activeModule === 'payment-aging' && <PaymentModule initialTab="aging" />}
              {activeModule === 'crm-agreements' && <CRMAgreementsPage />}
              {activeModule === 'tada' && <TADAModule />}
              {(activeModule === 'finance-cashbook' ||
                activeModule.startsWith('finance-') ||
                activeModule === 'cash-bank' ||
                activeModule.startsWith('cash-bank')) && (
                <FinanceCashBookModule initialSubTab={activeModule} onNavigate={(mod) => navigateTo(mod)} />
              )}
              {activeModule.startsWith('installment') && (
                <InstallmentManagementModule
                  key={activeModule}
                  initialSubTab={activeModule === 'installment' ? 'installment-dashboard' : activeModule}
                  onNavigate={(mod) => navigateTo(mod)}
                />
              )}
              {activeModule.startsWith('collection') && (
                <CollectionManagementModule
                  key={activeModule}
                  initialSubTab={activeModule === 'collection' ? 'collection-dashboard' : activeModule}
                  onNavigate={(mod) => navigateTo(mod)}
                />
              )}
              {(activeModule.startsWith('sms') || activeModule === 'whatsapp-integration') && (
                <SMSNotificationHub
                  key={activeModule}
                  initialSubTab={activeModule === 'sms' ? 'sms-dashboard' : activeModule}
                  onNavigate={(mod) => navigateTo(mod)}
                />
              )}
              {activeModule.startsWith('report-') && (
                <InstallmentReportsHub
                  key={activeModule}
                  initialReportId={activeModule}
                  onNavigate={(mod) => navigateTo(mod)}
                />
              )}
              {(activeModule === 'payroll' || activeModule.startsWith('payroll-')) && (
                <PayrollModule
                  initialRouteTab={payrollModuleIdToTab(activeModule)}
                  isExplicitSubRoute={activeModule.startsWith('payroll-')}
                  onSyncRouteTab={(tab) => {
                    const nextMod = payrollTabToModuleId(tab);
                    setActiveModule(nextMod);
                    if (typeof window !== 'undefined') {
                      const newPath = payrollTabToPathname(tab);
                      if (window.location.pathname !== newPath) {
                        window.history.replaceState({ module: nextMod }, '', newPath);
                      }
                    }
                  }}
                />
              )}
              {(activeModule === 'overtime-management' || activeModule.startsWith('overtime-')) && (
                <OvertimeModule
                  key={activeModule}
                  initialSubTab={
                    activeModule === 'overtime-dashboard' ? 'dashboard' :
                    activeModule === 'overtime-requests' ? 'requests' :
                    activeModule === 'overtime-requisition' ? 'requisition' :
                    activeModule === 'overtime-attendance' ? 'attendance' :
                    activeModule === 'overtime-batch-allocation' ? 'batch_allocation' :
                    activeModule === 'overtime-sync' ? 'payroll_costing_sync' :
                    activeModule === 'overtime-policies' ? 'policies' :
                    activeModule === 'overtime-reports' ? 'reports' : 'dashboard'
                  }
                />
              )}
              {activeModule === 'reports' && <ReportsModule />}
              {activeModule === 'users-permissions' && <UserManagementModule />}
              {activeModule === 'settings' && <SettingsPage />}
              {(activeModule === 'warranty' || activeModule.startsWith('warranty-')) && (
                <WarrantyManagementModule
                  key={activeModule}
                  initialSubTab={activeModule === 'warranty' ? 'warranty-dashboard' : activeModule}
                  onNavigate={(mod) => navigateTo(mod)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Global Interactive System Blueprint & ERD Modal */}
      <ArchitectureBlueprintModal />
    </div>
  );
}

export default function App() {
  return (
    <ERPProvider>
      <CashBankProvider>
        <MainApp />
      </CashBankProvider>
    </ERPProvider>
  );
}
