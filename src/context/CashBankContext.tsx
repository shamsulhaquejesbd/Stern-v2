/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Complete Cash, Bank & Double-Entry Accounting Context Engine
 * Integrates Cash Book, Multi-Bank Book, Chart of Accounts (COA), Opening Balances,
 * Journal Vouchers (Draft -> Approval -> Post -> Reverse), General Ledger,
 * AR/AP Sub-Ledgers, Inventory & Production Cost Flows, Ensec/Optimum JV Accounting,
 * Financial Years & Period Locking, and Financial Statements.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import {
  CashBankAccount,
  CashBankTransaction,
  CashBankTransactionType,
  PaymentMethod,
  OpeningBalanceConfig,
  ExpenseCategoryDef,
  ServiceIncomeCategoryDef,
  CashBankSummaryKPIs,
} from '../types/cashBank.ts';
import {
  COAAccount,
  COACategory,
  StatementClassification,
  JournalVoucher,
  JournalVoucherLine,
  GeneralLedgerEntry,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  FinancialYear,
  AccountingPeriodStatus,
  AccountingSettings,
  AccountingAuditLog,
  AccountingDashboardKPIs,
  ReceivableSubLedgerRow,
  PayableSubLedgerRow,
  VoucherType,
} from '../types/accounting.ts';
import {
  DEFAULT_CASH_BANK_ACCOUNTS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_SERVICE_INCOME_CATEGORIES,
  DEFAULT_OPENING_BALANCES,
  INITIAL_CASH_BANK_TRANSACTIONS,
} from '../mock/cashBankData.ts';
import {
  COA_IDS,
  DEFAULT_COA_ACCOUNTS,
  DEFAULT_FINANCIAL_YEARS,
  DEFAULT_ACCOUNTING_SETTINGS,
  buildMonthlyPeriodsForYear,
  ensureCOAForCashBankAccounts,
} from '../mock/accountingDefaults.ts';
import {
  ROUND2,
  validateVoucherLines,
  validatePeriodForDate,
  canDeleteCOAAccount,
  generateVoucherNumber,
  buildGLEntriesFromVoucher,
  createReversalVoucherObject,
  computeAccountNormalBalance,
  computeAccountingDashboardKPIs,
  buildProfitLoss,
  getNormalBalanceForCategory,
  resolveAccountLinkForCashBank,
} from '../utils/accountingEngine.ts';
import { syncAllERPEventsToAccounting } from '../utils/erpAccountingSync.ts';
import { useERP } from './ERPContext.tsx';
import { SalesOrder } from '../types/erp.ts';
import { getSupabase } from '../lib/supabase.ts';

const STORAGE_KEYS = {
  CASH_ACCOUNTS: 'ensec_cash_bank_accounts',
  CASH_TXNS: 'ensec_cash_bank_transactions',
  OPENING_CONFIGS: 'ensec_opening_balances',
  EXP_CATS: 'ensec_expense_categories',
  SRV_CATS: 'ensec_service_categories',
  COA: 'ensec_accounting_coa_v1',
  VOUCHERS: 'ensec_accounting_vouchers_v1',
  GL: 'ensec_accounting_gl_v1',
  OP_BATCHES: 'ensec_accounting_opening_batches_v1',
  FISCAL_YEARS: 'ensec_accounting_fiscal_years_v1',
  SETTINGS: 'ensec_accounting_settings_v1',
  AUDIT: 'ensec_accounting_audit_v1',
} as const;

export interface CashBankContextType {
  // Legacy Cash & Bank State (preserved 100% for backward compatibility)
  accounts: CashBankAccount[];
  transactions: CashBankTransaction[];
  openingBalances: OpeningBalanceConfig[];
  expenseCategories: ExpenseCategoryDef[];
  serviceCategories: ServiceIncomeCategoryDef[];
  kpis: CashBankSummaryKPIs;

  // Double-Entry Accounting State
  coaAccounts: COAAccount[];
  vouchers: JournalVoucher[];
  glEntries: GeneralLedgerEntry[];
  openingBalanceBatches: OpeningBalanceBatch[];
  financialYears: FinancialYear[];
  accountingSettings: AccountingSettings;
  accountingAuditLogs: AccountingAuditLog[];
  accountingKPIs: AccountingDashboardKPIs;
  receivableSubLedger: ReceivableSubLedgerRow[];
  payableSubLedger: PayableSubLedgerRow[];
  arControlBalance: number;
  apControlBalance: number;
  optimumControlBalance: number;

  // Existing Cash & Bank Operations
  recordOpeningBalance: (
    config: Omit<OpeningBalanceConfig, 'id' | 'configuredAt' | 'configuredBy'>
  ) => { success: boolean; message: string };

  addServiceIncome: (incomeData: {
    date: string;
    category: string;
    partyName: string;
    serviceRef?: string;
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    accountId: string;
    referenceNo: string;
    remarks?: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) => { success: boolean; message: string; transactionId?: string };

  addExpense: (expenseData: {
    date: string;
    category: string;
    paidTo: string;
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    accountId: string;
    referenceNo: string;
    remarks?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    allowNegativeOverride?: boolean;
  }) => { success: boolean; message: string; transactionId?: string; isNegativeWarning?: boolean };

  addCashToBankDeposit: (depositData: {
    date: string;
    fromCashAccountId: string;
    toBankAccountId: string;
    amount: number;
    depositSlipNumber: string;
    description?: string;
    remarks?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    allowNegativeOverride?: boolean;
  }) => { success: boolean; message: string; transactionId?: string };

  addBankToCashWithdrawal: (withdrawalData: {
    date: string;
    fromBankAccountId: string;
    toCashAccountId: string;
    amount: number;
    bankReferenceNumber: string;
    description?: string;
    remarks?: string;
    allowNegativeOverride?: boolean;
  }) => { success: boolean; message: string; transactionId?: string };

  reverseTransaction: (
    transactionId: string,
    reason: string
  ) => { success: boolean; message: string };

  postSalesInvoiceCollection: (
    order: SalesOrder,
    paidAmount: number,
    paymentMethod: 'Cash' | 'Bank',
    targetAccountId: string,
    referenceNo: string,
    remarks?: string
  ) => { success: boolean; message: string; isDuplicate?: boolean };

  syncPendingSalesOrders: () => { syncedCount: number; alreadySyncedCount: number; message: string };

  addExpenseCategory: (
    name: string,
    description?: string
  ) => { success: boolean; category?: ExpenseCategoryDef; message: string };
  addServiceCategory: (
    name: string,
    description?: string
  ) => { success: boolean; category?: ServiceIncomeCategoryDef; message: string };
  addNewBankAccount: (
    bankData: Omit<CashBankAccount, 'id' | 'currentBalanceBDT'>
  ) => { success: boolean; id: string; message: string };
  updateAccountDetails: (accountId: string, updates: Partial<CashBankAccount>) => void;

  getAccountById: (id: string) => CashBankAccount | undefined;
  getAccountTransactions: (accountId: string) => CashBankTransaction[];
  isInvoiceAlreadyPosted: (invoiceOrOrderId: string) => boolean;
  resetToDefaultSampleData: () => void;

  // Chart of Accounts CRUD
  createCOAAccount: (input: {
    code?: string;
    name: string;
    category: COACategory;
    classification: StatementClassification;
    parentId: string | null;
    isGroup: boolean;
    isContra?: boolean;
    description?: string;
  }) => { success: boolean; account?: COAAccount; message: string };
  updateCOAAccount: (
    id: string,
    updates: Partial<Pick<COAAccount, 'code' | 'name' | 'classification' | 'description' | 'isActive'>>
  ) => { success: boolean; message: string };
  toggleCOAAccountStatus: (id: string) => { success: boolean; message: string };
  deleteCOAAccount: (id: string) => { success: boolean; message: string };
  getCOAAccountBalance: (accountId: string, asOfDate?: string) => number;

  // Balanced Opening Balances
  postOpeningBalanceBatch: (input: {
    effectiveDate: string;
    referenceNo: string;
    description: string;
    lines: Array<{
      accountId: string;
      openingDebit: number;
      openingCredit: number;
      partyName?: string;
      description?: string;
    }>;
  }) => { success: boolean; batch?: OpeningBalanceBatch; message: string };

  // Journal Voucher Workflow
  saveVoucher: (input: {
    id?: string;
    voucherType: VoucherType;
    voucherDate: string;
    referenceNo: string;
    description: string;
    partyType?: JournalVoucher['partyType'];
    partyId?: string;
    partyName?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    postImmediately?: boolean;
    lines: Array<{
      accountId: string;
      description?: string;
      debit: number;
      credit: number;
      partyName?: string;
      costCenter?: string;
    }>;
  }) => { success: boolean; voucher?: JournalVoucher; message: string };
  submitVoucherForApproval: (voucherId: string) => { success: boolean; message: string };
  approveVoucher: (voucherId: string) => { success: boolean; message: string };
  postVoucher: (voucherId: string) => { success: boolean; message: string };
  reverseVoucher: (voucherId: string, reason: string, reversalDate?: string) => { success: boolean; reversalVoucher?: JournalVoucher; message: string };

  // AR / AP Sub-Ledger Direct Settlements
  recordReceivableCollection: (input: {
    partyId: string;
    partyName: string;
    partyType: 'Customer' | 'Distributor';
    invoiceNo?: string;
    salesOrderId?: string;
    amount: number;
    date: string;
    cashBankAccountId: string;
    referenceNo: string;
    remarks?: string;
  }) => { success: boolean; voucherNo?: string; message: string };

  recordSupplierPayment: (input: {
    supplierKey: string;
    supplierName: string;
    partyType: 'Supplier' | 'Optimum JV';
    grnNumber?: string;
    amount: number;
    date: string;
    cashBankAccountId: string;
    referenceNo: string;
    remarks?: string;
    allowNegativeOverride?: boolean;
  }) => { success: boolean; voucherNo?: string; message: string };

  // Financial Years & Period Locking
  createFinancialYear: (input: {
    name: string;
    startDate: string;
    endDate: string;
    setActive?: boolean;
  }) => { success: boolean; financialYear?: FinancialYear; message: string };
  setActiveFinancialYear: (fyId: string) => { success: boolean; message: string };
  updatePeriodStatus: (
    fyId: string,
    periodId: string,
    status: AccountingPeriodStatus
  ) => { success: boolean; message: string };
  performYearEndClosing: (fyId: string) => { success: boolean; voucherNo?: string; message: string };

  // Settings & ERP Sync
  updateAccountingSettings: (updates: Partial<AccountingSettings>) => void;
  syncERPEventsNow: () => { syncedCount: number; skippedLockedCount: number; message: string };
}

const CashBankContext = createContext<CashBankContextType | undefined>(undefined);

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch (e) {
    console.warn(`Failed to parse localStorage ${key}`, e);
  }
  return fallback;
}

export const CashBankProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    currentUser,
    addAuditLog,
    salesOrders,
    products,
    customers,
    distributors,
    payments,
    installmentPayments,
    rawMaterialReceipts,
    materialIssues,
    expenseEntries,
    costAllocations,
    finishedGoodsProductionReceipts,
    salaryPaymentRecords,
    tadaList,
    servicePayments,
    optimumStatement,
  } = useERP();

  // ==================== 1. CASH & BANK ACCOUNTS STATE ====================
  const [accounts, setAccounts] = useState<CashBankAccount[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.CASH_ACCOUNTS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasSampleBalances = parsed.some(
              (a: CashBankAccount) =>
                a.openingBalanceBDT === 500000 ||
                a.openingBalanceBDT === 6540000 ||
                a.openingBalanceBDT === 3200000
            );
            if (!hasSampleBalances) return parsed;
            localStorage.removeItem(STORAGE_KEYS.CASH_ACCOUNTS);
          }
        }
      } catch (e) {
        console.warn('Failed to parse stored cash bank accounts', e);
      }
    }
    return DEFAULT_CASH_BANK_ACCOUNTS;
  });

  const [transactions, setTransactions] = useState<CashBankTransaction[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.CASH_TXNS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (t: CashBankTransaction) =>
                !t.id.startsWith('cbt-op-') &&
                !t.id.startsWith('cbt-sal-') &&
                !t.id.startsWith('cbt-srv-') &&
                !t.id.startsWith('cbt-exp-') &&
                !t.id.startsWith('cbt-trans-') &&
                !t.id.startsWith('cbt-with-')
            );
          }
        }
      } catch (e) {
        console.warn('Failed to parse stored cash bank transactions', e);
      }
    }
    return INITIAL_CASH_BANK_TRANSACTIONS;
  });

  const [openingBalances, setOpeningBalances] = useState<OpeningBalanceConfig[]>(() => {
    const saved = loadLS<OpeningBalanceConfig[]>(STORAGE_KEYS.OPENING_CONFIGS, DEFAULT_OPENING_BALANCES);
    return Array.isArray(saved)
      ? saved.filter((o) => !o.id.startsWith('op-cash-') && !o.id.startsWith('op-bank-'))
      : DEFAULT_OPENING_BALANCES;
  });

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryDef[]>(() =>
    loadLS(STORAGE_KEYS.EXP_CATS, DEFAULT_EXPENSE_CATEGORIES)
  );
  const [serviceCategories, setServiceCategories] = useState<ServiceIncomeCategoryDef[]>(() =>
    loadLS(STORAGE_KEYS.SRV_CATS, DEFAULT_SERVICE_INCOME_CATEGORIES)
  );

  // ==================== 2. DOUBLE-ENTRY ACCOUNTING STATE ====================
  const [coaAccounts, setCoaAccounts] = useState<COAAccount[]>(() => {
    const stored = loadLS<COAAccount[]>(STORAGE_KEYS.COA, DEFAULT_COA_ACCOUNTS);
    const merged = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_COA_ACCOUNTS;
    // Guarantee all default COA IDs exist even after upgrade
    const byId = new Set(merged.map((m) => m.id));
    const missingDefaults = DEFAULT_COA_ACCOUNTS.filter((d) => !byId.has(d.id));
    return ensureCOAForCashBankAccounts([...merged, ...missingDefaults], DEFAULT_CASH_BANK_ACCOUNTS);
  });

  const [financialYears, setFinancialYears] = useState<FinancialYear[]>(() => {
    const stored = loadLS<FinancialYear[]>(STORAGE_KEYS.FISCAL_YEARS, DEFAULT_FINANCIAL_YEARS);
    return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_FINANCIAL_YEARS;
  });

  const [vouchers, setVouchers] = useState<JournalVoucher[]>(() =>
    loadLS<JournalVoucher[]>(STORAGE_KEYS.VOUCHERS, [])
  );

  const [glEntries, setGlEntries] = useState<GeneralLedgerEntry[]>(() =>
    loadLS<GeneralLedgerEntry[]>(STORAGE_KEYS.GL, [])
  );

  const [openingBalanceBatches, setOpeningBalanceBatches] = useState<OpeningBalanceBatch[]>(() =>
    loadLS<OpeningBalanceBatch[]>(STORAGE_KEYS.OP_BATCHES, [])
  );

  const [accountingSettings, setAccountingSettings] = useState<AccountingSettings>(() =>
    loadLS<AccountingSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_ACCOUNTING_SETTINGS)
  );

  const [accountingAuditLogs, setAccountingAuditLogs] = useState<AccountingAuditLog[]>(() =>
    loadLS<AccountingAuditLog[]>(STORAGE_KEYS.AUDIT, [])
  );

  // Persist to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.CASH_ACCOUNTS, JSON.stringify(accounts));
  }, [accounts]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.CASH_TXNS, JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.OPENING_CONFIGS, JSON.stringify(openingBalances));
  }, [openingBalances]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.EXP_CATS, JSON.stringify(expenseCategories));
  }, [expenseCategories]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.SRV_CATS, JSON.stringify(serviceCategories));
  }, [serviceCategories]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.COA, JSON.stringify(coaAccounts));
  }, [coaAccounts]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.VOUCHERS, JSON.stringify(vouchers));
  }, [vouchers]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.GL, JSON.stringify(glEntries));
  }, [glEntries]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.OP_BATCHES, JSON.stringify(openingBalanceBatches));
  }, [openingBalanceBatches]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.FISCAL_YEARS, JSON.stringify(financialYears));
  }, [financialYears]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(accountingSettings));
  }, [accountingSettings]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(accountingAuditLogs));
  }, [accountingAuditLogs]);

  // Keep COA synchronized when bank accounts change
  useEffect(() => {
    setCoaAccounts((prev) => {
      const updated = ensureCOAForCashBankAccounts(prev, accounts);
      return updated.length !== prev.length ? updated : prev;
    });
  }, [accounts]);

  // Best-effort initial fetch from Supabase if Section 45 tables have been deployed
  useEffect(() => {
    let mounted = true;
    const hydrateFromSupabase = async () => {
      const sb = getSupabase();
      if (!sb) return;
      try {
        const [coaRes, fyRes, vRes, glRes] = await Promise.all([
          sb.from('chart_of_accounts').select('*').limit(500),
          sb.from('financial_years').select('*, accounting_periods(*)').limit(50),
          sb.from('accounting_vouchers').select('*, accounting_voucher_lines(*)').order('voucher_date', { ascending: false }).limit(500),
          sb.from('general_ledger_entries').select('*').order('entry_date', { ascending: false }).limit(1500),
        ]);

        if (!mounted) return;
        if (!coaRes.error && coaRes.data && coaRes.data.length > 0) {
          const remoteCoa: COAAccount[] = coaRes.data.map((r: any) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            category: r.category,
            classification: r.classification,
            parentId: r.parent_id,
            level: r.level,
            isGroup: Boolean(r.is_group),
            isSystem: Boolean(r.is_system),
            isContra: Boolean(r.is_contra),
            normalBalance: r.normal_balance,
            isActive: Boolean(r.is_active),
            linkedCashBankAccountId: r.linked_cash_bank_account_id || undefined,
            description: r.description || undefined,
            createdBy: r.created_by || 'System',
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
          }));
          setCoaAccounts((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            remoteCoa.forEach((rc) => byId.set(rc.id, rc));
            return ensureCOAForCashBankAccounts(Array.from(byId.values()), accounts);
          });
        }
        if (!fyRes.error && fyRes.data && fyRes.data.length > 0) {
          const remoteFY: FinancialYear[] = fyRes.data.map((r: any) => ({
            id: r.id,
            name: r.name,
            startDate: r.start_date,
            endDate: r.end_date,
            isActive: Boolean(r.is_active),
            status: r.status,
            closedAt: r.closed_at || undefined,
            closedBy: r.closed_by || undefined,
            closingVoucherId: r.closing_voucher_id || undefined,
            retainedEarningsTransferredBDT: Number(r.retained_earnings_transferred_bdt || 0),
            periods: (r.accounting_periods || []).map((p: any) => ({
              id: p.id,
              financialYearId: p.financial_year_id,
              name: p.name,
              periodNumber: p.period_number,
              startDate: p.start_date,
              endDate: p.end_date,
              status: p.status,
              closedBy: p.closed_by || undefined,
              closedAt: p.closed_at || undefined,
            })),
          }));
          setFinancialYears(remoteFY);
        }
        if (!vRes.error && vRes.data && vRes.data.length > 0) {
          const remoteVouchers: JournalVoucher[] = vRes.data.map((r: any) => ({
            id: r.id,
            voucherNo: r.voucher_no,
            voucherType: r.voucher_type,
            voucherDate: r.voucher_date,
            financialYearId: r.financial_year_id || undefined,
            periodId: r.period_id || undefined,
            referenceNo: r.reference_no || '',
            description: r.description,
            totalDebit: Number(r.total_debit || 0),
            totalCredit: Number(r.total_credit || 0),
            status: r.status,
            sourceModule: r.source_module || undefined,
            sourceId: r.source_id || undefined,
            partyType: r.party_type || undefined,
            partyId: r.party_id || undefined,
            partyName: r.party_name || undefined,
            attachmentUrl: r.attachment_url || undefined,
            attachmentName: r.attachment_name || undefined,
            preparedBy: r.prepared_by,
            preparedAt: r.prepared_at,
            approvedBy: r.approved_by || undefined,
            approvedAt: r.approved_at || undefined,
            postedBy: r.posted_by || undefined,
            postedAt: r.posted_at || undefined,
            reversedBy: r.reversed_by || undefined,
            reversedAt: r.reversed_at || undefined,
            reversalReason: r.reversal_reason || undefined,
            reversalOfVoucherId: r.reversal_of_voucher_id || undefined,
            reversedByVoucherId: r.reversed_by_voucher_id || undefined,
            lines: (r.accounting_voucher_lines || []).map((l: any) => ({
              id: l.id,
              voucherId: l.voucher_id,
              lineNo: l.line_no,
              accountId: l.account_id,
              accountCode: l.account_code,
              accountName: l.account_name,
              description: l.description || undefined,
              debit: Number(l.debit || 0),
              credit: Number(l.credit || 0),
              partyType: l.party_type || undefined,
              partyId: l.party_id || undefined,
              partyName: l.party_name || undefined,
              costCenter: l.cost_center || undefined,
            })),
          }));
          setVouchers((prev) => {
            const byId = new Map(prev.map((v) => [v.id, v]));
            remoteVouchers.forEach((rv) => byId.set(rv.id, rv));
            return Array.from(byId.values());
          });
        }
        if (!glRes.error && glRes.data && glRes.data.length > 0) {
          const remoteGL: GeneralLedgerEntry[] = glRes.data.map((r: any) => ({
            id: r.id,
            voucherId: r.voucher_id,
            voucherNo: r.voucher_no,
            voucherType: r.voucher_type,
            entryDate: r.entry_date,
            financialYearId: r.financial_year_id || undefined,
            periodId: r.period_id || undefined,
            accountId: r.account_id,
            accountCode: r.account_code,
            accountName: r.account_name,
            accountCategory: r.account_category,
            description: r.description,
            referenceNo: r.reference_no || '',
            debit: Number(r.debit || 0),
            credit: Number(r.credit || 0),
            sourceModule: r.source_module || undefined,
            sourceId: r.source_id || undefined,
            partyName: r.party_name || undefined,
            createdBy: r.created_by || 'System',
            createdAt: r.created_at || new Date().toISOString(),
          }));
          setGlEntries((prev) => {
            const byId = new Map(prev.map((g) => [g.id, g]));
            remoteGL.forEach((rg) => byId.set(rg.id, rg));
            return Array.from(byId.values());
          });
        }
      } catch {
        // Silent fallback to localStorage if remote tables aren't migrated yet
      }
    };
    hydrateFromSupabase();
    return () => {
      mounted = false;
    };
  }, []);

  // Safe background Supabase upsert helper (never breaks UI if SQL not run yet)
  const syncVoucherToSupabase = async (voucher: JournalVoucher, newGL: GeneralLedgerEntry[]) => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('accounting_vouchers').upsert({
        id: voucher.id,
        voucher_no: voucher.voucherNo,
        voucher_type: voucher.voucherType,
        voucher_date: voucher.voucherDate,
        financial_year_id: voucher.financialYearId || null,
        period_id: voucher.periodId || null,
        reference_no: voucher.referenceNo || null,
        description: voucher.description,
        total_debit: voucher.totalDebit,
        total_credit: voucher.totalCredit,
        status: voucher.status,
        source_module: voucher.sourceModule || null,
        source_id: voucher.sourceId || null,
        party_type: voucher.partyType || null,
        party_id: voucher.partyId || null,
        party_name: voucher.partyName || null,
        attachment_url: voucher.attachmentUrl || null,
        attachment_name: voucher.attachmentName || null,
        prepared_by: voucher.preparedBy,
        prepared_at: voucher.preparedAt,
        approved_by: voucher.approvedBy || null,
        approved_at: voucher.approvedAt || null,
        posted_by: voucher.postedBy || null,
        posted_at: voucher.postedAt || null,
        reversed_by: voucher.reversedBy || null,
        reversed_at: voucher.reversedAt || null,
        reversal_reason: voucher.reversalReason || null,
        reversal_of_voucher_id: voucher.reversalOfVoucherId || null,
        reversed_by_voucher_id: voucher.reversedByVoucherId || null,
      });

      if (voucher.lines.length > 0) {
        await sb.from('accounting_voucher_lines').upsert(
          voucher.lines.map((l) => ({
            id: l.id,
            voucher_id: voucher.id,
            line_no: l.lineNo,
            account_id: l.accountId,
            account_code: l.accountCode,
            account_name: l.accountName,
            description: l.description || null,
            debit: l.debit,
            credit: l.credit,
            party_type: l.partyType || null,
            party_id: l.partyId || null,
            party_name: l.partyName || null,
            cost_center: l.costCenter || null,
          }))
        );
      }

      if (newGL.length > 0) {
        await sb.from('general_ledger_entries').upsert(
          newGL.map((g) => ({
            id: g.id,
            voucher_id: g.voucherId,
            voucher_no: g.voucherNo,
            voucher_type: g.voucherType,
            entry_date: g.entryDate,
            financial_year_id: g.financialYearId || null,
            period_id: g.periodId || null,
            account_id: g.accountId,
            account_code: g.accountCode,
            account_name: g.accountName,
            account_category: g.accountCategory,
            description: g.description,
            reference_no: g.referenceNo || null,
            debit: g.debit,
            credit: g.credit,
            source_module: g.sourceModule || null,
            source_id: g.sourceId || null,
            party_name: g.partyName || null,
            created_by: g.createdBy,
            created_at: g.createdAt,
          }))
        );
      }
    } catch {
      // Non-blocking fallback
    }
  };

  const logAccountingAction = (
    action: string,
    entityType: AccountingAuditLog['entityType'],
    entityId: string,
    details: string,
    voucherNo?: string
  ) => {
    const entry: AccountingAuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      action,
      entityType,
      entityId,
      voucherNo,
      details,
      performedBy: currentUser?.name || 'Accounts User',
      performedAt: new Date().toISOString(),
    };
    setAccountingAuditLogs((prev) => [entry, ...prev].slice(0, 500));
    addAuditLog(action, 'Accounting & Finance', details);
  };

  // ==================== INTERNAL DOUBLE-ENTRY HELPER ====================
  const postBalancedGLVoucherInternal = (params: {
    voucherType: VoucherType;
    voucherNoHint?: string;
    date: string;
    referenceNo: string;
    description: string;
    sourceModule: JournalVoucher['sourceModule'];
    sourceId: string;
    partyType?: JournalVoucher['partyType'];
    partyId?: string;
    partyName?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    lines: Array<{ accountId: string; debit: number; credit: number; description?: string; partyName?: string }>;
  }): { ok: boolean; voucher?: JournalVoucher; error?: string } => {
    const periodCheck = validatePeriodForDate(
      params.date,
      financialYears,
      accountingSettings.enforcePeriodLocking
    );
    if (!periodCheck.allowed) {
      return { ok: false, error: periodCheck.reason };
    }

    // Prevent duplicate source posting
    if (
      params.sourceModule &&
      params.sourceId &&
      params.sourceModule !== 'Manual' &&
      vouchers.some(
        (v) => v.status !== 'Reversed' && v.sourceModule === params.sourceModule && v.sourceId === params.sourceId
      )
    ) {
      return { ok: false, error: `Duplicate posting blocked for ${params.sourceModule} (${params.sourceId}).` };
    }

    const voucherId = `vch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const builtLines: JournalVoucherLine[] = params.lines.map((l, idx) => {
      const acc = coaAccounts.find((a) => a.id === l.accountId);
      return {
        id: `vl-${voucherId}-${idx + 1}`,
        voucherId,
        lineNo: idx + 1,
        accountId: l.accountId,
        accountCode: acc?.code || '',
        accountName: acc?.name || '',
        description: l.description || params.description,
        debit: ROUND2(l.debit),
        credit: ROUND2(l.credit),
        partyType: params.partyType,
        partyId: params.partyId,
        partyName: l.partyName || params.partyName,
      };
    });

    const validation = validateVoucherLines(builtLines, coaAccounts);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }

    let voucherNo = params.voucherNoHint || generateVoucherNumber(params.voucherType, vouchers, params.date);
    if (vouchers.some((v) => v.voucherNo === voucherNo)) {
      voucherNo = `${voucherNo}-${Date.now().toString().slice(-3)}`;
    }

    const nowIso = new Date().toISOString();
    const performer = currentUser?.name || 'Accounts Manager';
    const newVoucher: JournalVoucher = {
      id: voucherId,
      voucherNo,
      voucherType: params.voucherType,
      voucherDate: params.date,
      financialYearId: periodCheck.financialYearId,
      periodId: periodCheck.periodId,
      referenceNo: params.referenceNo,
      description: params.description,
      lines: builtLines,
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      status: 'Posted',
      sourceModule: params.sourceModule,
      sourceId: params.sourceId,
      partyType: params.partyType,
      partyId: params.partyId,
      partyName: params.partyName,
      attachmentUrl: params.attachmentUrl,
      attachmentName: params.attachmentName,
      preparedBy: performer,
      preparedAt: nowIso,
      approvedBy: performer,
      approvedAt: nowIso,
      postedBy: performer,
      postedAt: nowIso,
    };

    const newGL = buildGLEntriesFromVoucher(newVoucher, coaAccounts);
    setVouchers((prev) => [newVoucher, ...prev]);
    setGlEntries((prev) => [...newGL, ...prev]);
    void syncVoucherToSupabase(newVoucher, newGL);

    return { ok: true, voucher: newVoucher };
  };

  // ==================== 3. AUTO-SYNC ERP TRANSACTIONS (IDEMPOTENT) ====================
  const lastSyncSignatureRef = useRef<string>('');

  const syncERPEventsNow = () => {
    const res = syncAllERPEventsToAccounting({
      coaAccounts,
      cashBankAccounts: accounts,
      existingVouchers: vouchers,
      financialYears,
      enforcePeriodLocking: accountingSettings.enforcePeriodLocking,
      cashBankTransactions: transactions,
      rawMaterialReceipts,
      materialIssues,
      expenseEntries,
      costAllocations,
      finishedGoodsProductionReceipts,
      salesOrders,
      products,
      payments,
      installmentPayments,
      salaryPaymentRecords,
      tadaList,
      servicePayments,
      optimumStatement,
    });

    if (res.newVouchers.length > 0) {
      const generatedGL = res.newVouchers.flatMap((v) => buildGLEntriesFromVoucher(v, coaAccounts));
      setVouchers((prev) => [...res.newVouchers, ...prev]);
      setGlEntries((prev) => [...generatedGL, ...prev]);
      logAccountingAction(
        'ERP_AUTO_SYNC_POSTED',
        'ERPSync',
        `sync-${Date.now()}`,
        `Auto-posted ${res.newVouchers.length} balanced ERP journal vouchers (${Object.entries(res.summaryByModule)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')})`
      );
    }

    return {
      syncedCount: res.newVouchers.length,
      skippedLockedCount: res.skippedLockedCount,
      message:
        res.newVouchers.length > 0
          ? `Synchronized ${res.newVouchers.length} new ERP accounting vouchers into the General Ledger.`
          : res.skippedLockedCount > 0
          ? `All open ERP transactions are synced. (${res.skippedLockedCount} skipped due to closed/locked period).`
          : 'All ERP transactions (Sales, Purchases, Production, Expenses, Payroll, Collections, Cash/Bank, Optimum JV) are up to date.',
    };
  };

  useEffect(() => {
    if (!accountingSettings.autoSyncERPEvents) return;
    const sig = [
      transactions.length,
      rawMaterialReceipts.length,
      materialIssues.length,
      expenseEntries.length,
      costAllocations.length,
      finishedGoodsProductionReceipts.length,
      salesOrders.length,
      payments.length,
      installmentPayments.length,
      salaryPaymentRecords.length,
      tadaList.length,
      servicePayments.length,
      optimumStatement.length,
    ].join('|');

    if (sig === lastSyncSignatureRef.current) return;
    lastSyncSignatureRef.current = sig;

    const timer = setTimeout(() => {
      syncERPEventsNow();
    }, 150);
    return () => clearTimeout(timer);
  }, [
    accountingSettings.autoSyncERPEvents,
    transactions.length,
    rawMaterialReceipts.length,
    materialIssues.length,
    expenseEntries.length,
    costAllocations.length,
    finishedGoodsProductionReceipts.length,
    salesOrders.length,
    payments.length,
    installmentPayments.length,
    salaryPaymentRecords.length,
    tadaList.length,
    servicePayments.length,
    optimumStatement.length,
  ]);

  // ==================== 4. EXISTING CASH & BANK OPERATIONS (ENHANCED WITH DOUBLE-ENTRY GL) ====================
  const recalculateAccountBalances = (
    currentAccounts: CashBankAccount[],
    currentTransactions: CashBankTransaction[]
  ): CashBankAccount[] => {
    return currentAccounts.map((acc) => {
      const opening = acc.openingBalanceBDT || 0;
      const accountTxns = currentTransactions.filter(
        (t) => t.accountId === acc.id && t.status !== 'Reversed'
      );
      const netDelta = accountTxns.reduce(
        (sum, t) => sum + (Number(t.debit) || 0) - (Number(t.credit) || 0),
        0
      );
      const hasOpeningTxn = accountTxns.some((t) => t.type === 'Opening Balance');
      return {
        ...acc,
        currentBalanceBDT: hasOpeningTxn ? netDelta : opening + netDelta,
      };
    });
  };

  const getAccountById = (id: string) => accounts.find((a) => a.id === id);

  const isInvoiceAlreadyPosted = (invoiceOrOrderId: string): boolean => {
    if (!invoiceOrOrderId) return false;
    const clean = invoiceOrOrderId.trim().toLowerCase();
    return transactions.some(
      (t) =>
        t.status !== 'Reversed' &&
        t.type === 'Sales Collection' &&
        (t.invoiceNo?.trim().toLowerCase() === clean ||
          t.salesOrderId?.trim().toLowerCase() === clean ||
          t.referenceNo?.trim().toLowerCase() === clean)
    );
  };

  const recordOpeningBalance = (
    config: Omit<OpeningBalanceConfig, 'id' | 'configuredAt' | 'configuredBy'>
  ) => {
    const account = accounts.find((a) => a.id === config.accountId);
    if (!account) {
      return { success: false, message: `Account not found for ID: ${config.accountId}` };
    }

    const periodCheck = validatePeriodForDate(
      config.openingDate,
      financialYears,
      accountingSettings.enforcePeriodLocking
    );
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Opening date falls in a closed period.' };
    }

    const now = new Date();
    const configId = `op-${config.accountId}-${Date.now().toString().slice(-4)}`;
    const newConfig: OpeningBalanceConfig = {
      ...config,
      id: configId,
      configuredAt: now.toISOString(),
      configuredBy: currentUser.name || 'Accounts Head',
    };

    const filteredConfigs = openingBalances.filter((o) => o.accountId !== config.accountId);
    setOpeningBalances([newConfig, ...filteredConfigs]);

    const updatedAccounts = accounts.map((a) =>
      a.id === config.accountId
        ? {
            ...a,
            openingBalanceBDT: config.initialBalance,
            openingDate: config.openingDate,
            remarks: config.remarks || a.remarks,
          }
        : a
    );

    const voucherNo = `OPN-${config.openingDate.replace(/-/g, '')}-${config.accountId.slice(-3).toUpperCase()}`;
    const existingOpTxnIndex = transactions.findIndex(
      (t) => t.type === 'Opening Balance' && t.accountId === config.accountId
    );
    const opTxnId = existingOpTxnIndex >= 0 ? transactions[existingOpTxnIndex].id : `cbt-op-${config.accountId}-${Date.now()}`;

    const opTransaction: CashBankTransaction = {
      id: opTxnId,
      voucherNo,
      date: config.openingDate,
      type: 'Opening Balance',
      accountType: config.accountType,
      accountId: config.accountId,
      accountName: account.name,
      category: 'Opening Balance',
      partyName: 'Opening Balance Equity',
      referenceNo: `OPN-BAL-${config.accountId}`,
      description: `Opening balance configured for ${account.name}`,
      debit: config.initialBalance,
      credit: 0,
      amount: config.initialBalance,
      runningBalance: config.initialBalance,
      remarks: config.remarks,
      createdBy: currentUser.name || 'Authorized Accounts Manager',
      status: 'Posted',
      createdAt: now.toISOString(),
    };

    const updatedTxns =
      existingOpTxnIndex >= 0
        ? transactions.map((t, i) => (i === existingOpTxnIndex ? opTransaction : t))
        : [opTransaction, ...transactions];

    setAccounts(recalculateAccountBalances(updatedAccounts, updatedTxns));
    setTransactions(updatedTxns);

    // Also post balanced Double-Entry Opening Journal into GL
    if (config.initialBalance > 0) {
      const cbCOA = resolveAccountLinkForCashBank(account.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
      postBalancedGLVoucherInternal({
        voucherType: 'Opening Journal',
        voucherNoHint: voucherNo,
        date: config.openingDate,
        referenceNo: `OPN-BAL-${config.accountId}`,
        description: `Opening balance for ${account.name}`,
        sourceModule: 'CashBank',
        sourceId: opTxnId,
        lines: [
          { accountId: cbCOA, debit: config.initialBalance, credit: 0 },
          { accountId: COA_IDS.OPENING_BALANCE_EQUITY, debit: 0, credit: config.initialBalance },
        ],
      });
    }

    addAuditLog(
      'CASH_BANK_OPENING_BALANCE_CONFIGURED',
      'Cash & Bank Module',
      `Configured opening balance for ${account.name} as BDT ${config.initialBalance.toLocaleString()} on ${config.openingDate}`
    );

    return {
      success: true,
      message: `Opening balance for ${account.name} saved (BDT ${config.initialBalance.toLocaleString()}) & posted to General Ledger!`,
    };
  };

  const addServiceIncome = (incomeData: {
    date: string;
    category: string;
    partyName: string;
    serviceRef?: string;
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    accountId: string;
    referenceNo: string;
    remarks?: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) => {
    if (!incomeData.amount || incomeData.amount <= 0) {
      return { success: false, message: 'Income amount must be greater than zero.' };
    }
    const account = accounts.find((a) => a.id === incomeData.accountId);
    if (!account) {
      return { success: false, message: 'Please select a valid cash or bank account.' };
    }
    const dateStr = incomeData.date || new Date().toISOString().slice(0, 10);
    const periodCheck = validatePeriodForDate(dateStr, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Period is closed or locked.' };
    }

    const now = new Date();
    const voucherNo = `SRV-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    const newTxnId = `cbt-srv-${Date.now()}`;
    const newTxn: CashBankTransaction = {
      id: newTxnId,
      voucherNo,
      date: dateStr,
      type: 'Service Income',
      accountType: account.type,
      accountId: account.id,
      accountName: account.name,
      category: incomeData.category,
      partyName: incomeData.partyName,
      serviceRef: incomeData.serviceRef,
      referenceNo: incomeData.referenceNo || voucherNo,
      description: incomeData.description,
      debit: incomeData.amount,
      credit: 0,
      amount: incomeData.amount,
      runningBalance: (account.currentBalanceBDT || 0) + incomeData.amount,
      remarks: incomeData.remarks,
      attachmentUrl: incomeData.attachmentUrl,
      attachmentName: incomeData.attachmentName,
      createdBy: currentUser.name || 'Accounts Officer',
      status: 'Posted',
      createdAt: now.toISOString(),
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    setAccounts(recalculateAccountBalances(accounts, updatedTxns));

    const cbCOA = resolveAccountLinkForCashBank(account.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    const catLower = incomeData.category.toLowerCase();
    const revCOA = catLower.includes('repair')
      ? COA_IDS.BATTERY_REPAIR_INCOME
      : catLower.includes('interest')
      ? COA_IDS.NON_OPERATING_INCOME
      : COA_IDS.SERVICE_INCOME;

    postBalancedGLVoucherInternal({
      voucherType: 'Receipt Voucher',
      voucherNoHint: voucherNo,
      date: dateStr,
      referenceNo: incomeData.referenceNo || voucherNo,
      description: `${incomeData.category}: ${incomeData.description}`,
      sourceModule: 'CashBank',
      sourceId: newTxnId,
      partyType: 'Customer',
      partyName: incomeData.partyName,
      attachmentUrl: incomeData.attachmentUrl,
      attachmentName: incomeData.attachmentName,
      lines: [
        { accountId: cbCOA, debit: incomeData.amount, credit: 0 },
        { accountId: revCOA, debit: 0, credit: incomeData.amount },
      ],
    });

    addAuditLog(
      'SERVICE_INCOME_POSTED',
      'Cash & Bank Module',
      `Posted Service Income voucher ${voucherNo} of BDT ${incomeData.amount.toLocaleString()} from ${incomeData.partyName} into ${account.name}`
    );

    return {
      success: true,
      message: `Service income of BDT ${incomeData.amount.toLocaleString()} posted to ${account.name} & General Ledger (${voucherNo})!`,
      transactionId: newTxn.id,
    };
  };

  const addExpense = (expenseData: {
    date: string;
    category: string;
    paidTo: string;
    description: string;
    amount: number;
    paymentMethod: PaymentMethod;
    accountId: string;
    referenceNo: string;
    remarks?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    allowNegativeOverride?: boolean;
  }) => {
    if (!expenseData.amount || expenseData.amount <= 0) {
      return { success: false, message: 'Expense amount must be greater than zero.' };
    }
    const account = accounts.find((a) => a.id === expenseData.accountId);
    if (!account) {
      return { success: false, message: 'Please select a valid cash or bank account.' };
    }
    const dateStr = expenseData.date || new Date().toISOString().slice(0, 10);
    const periodCheck = validatePeriodForDate(dateStr, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Period is closed or locked.' };
    }

    const currentBal = account.currentBalanceBDT || 0;
    if (
      currentBal < expenseData.amount &&
      !expenseData.allowNegativeOverride &&
      !accountingSettings.allowNegativeCashBank
    ) {
      return {
        success: false,
        isNegativeWarning: true,
        message: `Insufficient funds in ${account.name}. Current balance is BDT ${currentBal.toLocaleString()}, but expense amount is BDT ${expenseData.amount.toLocaleString()}.`,
      };
    }

    const now = new Date();
    const voucherNo = `EXP-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    const newTxnId = `cbt-exp-${Date.now()}`;
    const newTxn: CashBankTransaction = {
      id: newTxnId,
      voucherNo,
      date: dateStr,
      type: 'Operational Expense',
      accountType: account.type,
      accountId: account.id,
      accountName: account.name,
      category: expenseData.category,
      partyName: expenseData.paidTo,
      referenceNo: expenseData.referenceNo || voucherNo,
      description: expenseData.description,
      debit: 0,
      credit: expenseData.amount,
      amount: expenseData.amount,
      runningBalance: currentBal - expenseData.amount,
      remarks: expenseData.remarks,
      attachmentUrl: expenseData.attachmentUrl,
      attachmentName: expenseData.attachmentName,
      createdBy: currentUser.name || 'Accounts Officer',
      status: 'Posted',
      createdAt: now.toISOString(),
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    setAccounts(recalculateAccountBalances(accounts, updatedTxns));

    const cbCOA = resolveAccountLinkForCashBank(account.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    const catLower = expenseData.category.toLowerCase();
    const expCOA = catLower.includes('rent')
      ? COA_IDS.RENT_EXPENSES
      : catLower.includes('salary')
      ? COA_IDS.SALARY_EXPENSES
      : catLower.includes('transport') || catLower.includes('freight')
      ? COA_IDS.TRANSPORTATION_EXPENSES
      : catLower.includes('market')
      ? COA_IDS.MARKETING_EXPENSES
      : catLower.includes('bank')
      ? COA_IDS.BANK_CHARGES
      : catLower.includes('factory') || catLower.includes('utility') || catLower.includes('electric')
      ? COA_IDS.FACTORY_OVERHEAD
      : COA_IDS.OFFICE_EXPENSES;

    postBalancedGLVoucherInternal({
      voucherType: 'Payment Voucher',
      voucherNoHint: voucherNo,
      date: dateStr,
      referenceNo: expenseData.referenceNo || voucherNo,
      description: `${expenseData.category} — ${expenseData.description}`,
      sourceModule: 'CashBank',
      sourceId: newTxnId,
      partyType: 'Other',
      partyName: expenseData.paidTo,
      attachmentUrl: expenseData.attachmentUrl,
      attachmentName: expenseData.attachmentName,
      lines: [
        { accountId: expCOA, debit: expenseData.amount, credit: 0 },
        { accountId: cbCOA, debit: 0, credit: expenseData.amount },
      ],
    });

    addAuditLog(
      'EXPENSE_POSTED',
      'Cash & Bank Module',
      `Posted Expense voucher ${voucherNo} of BDT ${expenseData.amount.toLocaleString()} paid to ${expenseData.paidTo} from ${account.name}`
    );

    return {
      success: true,
      message: `Expense voucher ${voucherNo} of BDT ${expenseData.amount.toLocaleString()} posted to ${account.name} & General Ledger!`,
      transactionId: newTxn.id,
    };
  };

  const addCashToBankDeposit = (depositData: {
    date: string;
    fromCashAccountId: string;
    toBankAccountId: string;
    amount: number;
    depositSlipNumber: string;
    description?: string;
    remarks?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    allowNegativeOverride?: boolean;
  }) => {
    if (!depositData.amount || depositData.amount <= 0) {
      return { success: false, message: 'Deposit amount must be greater than zero.' };
    }
    const cashAccount = accounts.find((a) => a.id === depositData.fromCashAccountId);
    const bankAccount = accounts.find((a) => a.id === depositData.toBankAccountId);
    if (!cashAccount || cashAccount.type !== 'Cash') {
      return { success: false, message: 'Please select a valid source Cash account.' };
    }
    if (!bankAccount || bankAccount.type !== 'Bank') {
      return { success: false, message: 'Please select a valid destination Bank account.' };
    }
    const dateStr = depositData.date || new Date().toISOString().slice(0, 10);
    const periodCheck = validatePeriodForDate(dateStr, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Period is closed or locked.' };
    }
    if (
      cashAccount.currentBalanceBDT < depositData.amount &&
      !depositData.allowNegativeOverride &&
      !accountingSettings.allowNegativeCashBank
    ) {
      return {
        success: false,
        message: `Insufficient cash in ${cashAccount.name}. Available cash is BDT ${cashAccount.currentBalanceBDT.toLocaleString()}.`,
      };
    }

    const now = new Date();
    const voucherNo = `CONTRA-DEP-${now.getFullYear()}${Date.now().toString().slice(-4)}`;
    const depositSlip = depositData.depositSlipNumber?.trim() || `DEP-${Date.now().toString().slice(-5)}`;
    const desc =
      depositData.description ||
      `Cash deposited from ${cashAccount.name} into ${bankAccount.name} (Slip #${depositSlip})`;

    const cashOutTxn: CashBankTransaction = {
      id: `cbt-contra-out-${Date.now()}`,
      voucherNo,
      date: dateStr,
      type: 'Cash to Bank Deposit',
      accountType: 'Cash',
      accountId: cashAccount.id,
      accountName: cashAccount.name,
      targetAccountId: bankAccount.id,
      targetAccountName: bankAccount.name,
      category: 'Contra / Bank Deposit',
      partyName: 'Ensec Internal Contra Transfer',
      referenceNo: depositSlip,
      description: desc,
      debit: 0,
      credit: depositData.amount,
      amount: depositData.amount,
      runningBalance: cashAccount.currentBalanceBDT - depositData.amount,
      remarks: depositData.remarks,
      attachmentUrl: depositData.attachmentUrl,
      attachmentName: depositData.attachmentName,
      createdBy: currentUser.name || 'Accounts Head',
      status: 'Posted',
      isContra: true,
      createdAt: now.toISOString(),
    };

    const bankInTxn: CashBankTransaction = {
      id: `cbt-contra-in-${Date.now() + 1}`,
      voucherNo: `${voucherNo}-B`,
      date: dateStr,
      type: 'Cash to Bank Deposit',
      accountType: 'Bank',
      accountId: bankAccount.id,
      accountName: bankAccount.name,
      targetAccountId: cashAccount.id,
      targetAccountName: cashAccount.name,
      category: 'Contra / Bank Deposit',
      partyName: 'Ensec Internal Contra Transfer',
      referenceNo: depositSlip,
      description: desc,
      debit: depositData.amount,
      credit: 0,
      amount: depositData.amount,
      runningBalance: bankAccount.currentBalanceBDT + depositData.amount,
      remarks: depositData.remarks,
      attachmentUrl: depositData.attachmentUrl,
      attachmentName: depositData.attachmentName,
      createdBy: currentUser.name || 'Accounts Head',
      status: 'Posted',
      isContra: true,
      createdAt: now.toISOString(),
    };

    const updatedTxns = [bankInTxn, cashOutTxn, ...transactions];
    setTransactions(updatedTxns);
    setAccounts(recalculateAccountBalances(accounts, updatedTxns));

    const cashCOA = resolveAccountLinkForCashBank(cashAccount.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    const bankCOA = resolveAccountLinkForCashBank(bankAccount.id, coaAccounts)?.id || COA_IDS.BANK_DBBL;

    postBalancedGLVoucherInternal({
      voucherType: 'Contra Voucher',
      voucherNoHint: voucherNo,
      date: dateStr,
      referenceNo: depositSlip,
      description: desc,
      sourceModule: 'CashBank',
      sourceId: `contra-${voucherNo}`,
      partyType: 'Other',
      partyName: 'Internal Cash/Bank Contra',
      lines: [
        { accountId: bankCOA, debit: depositData.amount, credit: 0 },
        { accountId: cashCOA, debit: 0, credit: depositData.amount },
      ],
    });

    addAuditLog(
      'CONTRA_CASH_TO_BANK_DEPOSIT',
      'Cash & Bank Module',
      `Transferred BDT ${depositData.amount.toLocaleString()} from ${cashAccount.name} to ${bankAccount.name} (Slip #${depositSlip})`
    );

    return {
      success: true,
      message: `Deposit of BDT ${depositData.amount.toLocaleString()} into ${bankAccount.name} confirmed & posted to GL (${voucherNo})!`,
      transactionId: voucherNo,
    };
  };

  const addBankToCashWithdrawal = (withdrawalData: {
    date: string;
    fromBankAccountId: string;
    toCashAccountId: string;
    amount: number;
    bankReferenceNumber: string;
    description?: string;
    remarks?: string;
    allowNegativeOverride?: boolean;
  }) => {
    if (!withdrawalData.amount || withdrawalData.amount <= 0) {
      return { success: false, message: 'Withdrawal amount must be greater than zero.' };
    }
    const bankAccount = accounts.find((a) => a.id === withdrawalData.fromBankAccountId);
    const cashAccount = accounts.find((a) => a.id === withdrawalData.toCashAccountId);
    if (!bankAccount || bankAccount.type !== 'Bank') {
      return { success: false, message: 'Please select a valid source Bank account.' };
    }
    if (!cashAccount || cashAccount.type !== 'Cash') {
      return { success: false, message: 'Please select a valid destination Cash account.' };
    }
    const dateStr = withdrawalData.date || new Date().toISOString().slice(0, 10);
    const periodCheck = validatePeriodForDate(dateStr, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Period is closed or locked.' };
    }
    if (
      bankAccount.currentBalanceBDT < withdrawalData.amount &&
      !withdrawalData.allowNegativeOverride &&
      !accountingSettings.allowNegativeCashBank
    ) {
      return {
        success: false,
        message: `Insufficient funds in ${bankAccount.name}. Available balance is BDT ${bankAccount.currentBalanceBDT.toLocaleString()}.`,
      };
    }

    const now = new Date();
    const voucherNo = `CONTRA-WDL-${now.getFullYear()}${Date.now().toString().slice(-4)}`;
    const bankRef = withdrawalData.bankReferenceNumber?.trim() || `CHQ-${Date.now().toString().slice(-5)}`;
    const desc =
      withdrawalData.description ||
      `Cash withdrawn from ${bankAccount.name} into ${cashAccount.name} (Ref #${bankRef})`;

    const bankOutTxn: CashBankTransaction = {
      id: `cbt-with-out-${Date.now()}`,
      voucherNo,
      date: dateStr,
      type: 'Bank to Cash Withdrawal',
      accountType: 'Bank',
      accountId: bankAccount.id,
      accountName: bankAccount.name,
      targetAccountId: cashAccount.id,
      targetAccountName: cashAccount.name,
      category: 'Contra / Cash Withdrawal',
      partyName: 'Ensec Internal Contra Transfer',
      referenceNo: bankRef,
      description: desc,
      debit: 0,
      credit: withdrawalData.amount,
      amount: withdrawalData.amount,
      runningBalance: bankAccount.currentBalanceBDT - withdrawalData.amount,
      remarks: withdrawalData.remarks,
      createdBy: currentUser.name || 'Accounts Head',
      status: 'Posted',
      isContra: true,
      createdAt: now.toISOString(),
    };

    const cashInTxn: CashBankTransaction = {
      id: `cbt-with-in-${Date.now() + 1}`,
      voucherNo: `${voucherNo}-C`,
      date: dateStr,
      type: 'Bank to Cash Withdrawal',
      accountType: 'Cash',
      accountId: cashAccount.id,
      accountName: cashAccount.name,
      targetAccountId: bankAccount.id,
      targetAccountName: bankAccount.name,
      category: 'Contra / Cash Withdrawal',
      partyName: 'Ensec Internal Contra Transfer',
      referenceNo: bankRef,
      description: desc,
      debit: withdrawalData.amount,
      credit: 0,
      amount: withdrawalData.amount,
      runningBalance: cashAccount.currentBalanceBDT + withdrawalData.amount,
      remarks: withdrawalData.remarks,
      createdBy: currentUser.name || 'Accounts Head',
      status: 'Posted',
      isContra: true,
      createdAt: now.toISOString(),
    };

    const updatedTxns = [cashInTxn, bankOutTxn, ...transactions];
    setTransactions(updatedTxns);
    setAccounts(recalculateAccountBalances(accounts, updatedTxns));

    const bankCOA = resolveAccountLinkForCashBank(bankAccount.id, coaAccounts)?.id || COA_IDS.BANK_DBBL;
    const cashCOA = resolveAccountLinkForCashBank(cashAccount.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;

    postBalancedGLVoucherInternal({
      voucherType: 'Contra Voucher',
      voucherNoHint: voucherNo,
      date: dateStr,
      referenceNo: bankRef,
      description: desc,
      sourceModule: 'CashBank',
      sourceId: `contra-${voucherNo}`,
      partyType: 'Other',
      partyName: 'Internal Cash/Bank Contra',
      lines: [
        { accountId: cashCOA, debit: withdrawalData.amount, credit: 0 },
        { accountId: bankCOA, debit: 0, credit: withdrawalData.amount },
      ],
    });

    addAuditLog(
      'CONTRA_BANK_TO_CASH_WITHDRAWAL',
      'Cash & Bank Module',
      `Withdrew BDT ${withdrawalData.amount.toLocaleString()} from ${bankAccount.name} to ${cashAccount.name} (Ref #${bankRef})`
    );

    return {
      success: true,
      message: `Withdrawal of BDT ${withdrawalData.amount.toLocaleString()} credited to ${cashAccount.name} & posted to GL (${voucherNo})!`,
      transactionId: voucherNo,
    };
  };

  const postSalesInvoiceCollection = (
    order: SalesOrder,
    paidAmount: number,
    paymentMethod: 'Cash' | 'Bank',
    targetAccountId: string,
    referenceNo: string,
    remarks?: string
  ) => {
    if (!paidAmount || paidAmount <= 0) {
      return { success: false, message: 'Collection amount must be greater than zero.' };
    }
    const cleanOrderNumber = order.orderNumber || order.id;
    const cleanInvoiceNumber = order.invoiceNumber || order.invoiceNo || cleanOrderNumber;

    const existingPosting = transactions.find(
      (t) =>
        t.status !== 'Reversed' &&
        t.type === 'Sales Collection' &&
        (t.salesOrderId === order.id || t.invoiceNo === cleanInvoiceNumber || t.referenceNo === referenceNo) &&
        t.amount === paidAmount
    );
    if (existingPosting) {
      return {
        success: false,
        isDuplicate: true,
        message: `Duplicate prevention: Invoice ${cleanInvoiceNumber} already has voucher ${existingPosting.voucherNo}.`,
      };
    }

    const account = accounts.find((a) => a.id === targetAccountId) || accounts[0];
    const now = new Date();
    const dateStr = order.date || now.toISOString().slice(0, 10);
    const periodCheck = validatePeriodForDate(dateStr, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Period is closed or locked.' };
    }

    const voucherNo = `CB-SAL-${now.getFullYear()}${Date.now().toString().slice(-4)}`;
    const newTxnId = `cbt-sal-${Date.now()}`;
    const newTxn: CashBankTransaction = {
      id: newTxnId,
      voucherNo,
      date: dateStr,
      type: 'Sales Collection',
      accountType: account.type,
      accountId: account.id,
      accountName: account.name,
      category: 'Finished Goods Sales Collection',
      partyName: order.customerName || order.distributorName || 'Client',
      invoiceNo: cleanInvoiceNumber,
      salesOrderId: order.id,
      referenceNo: referenceNo || cleanInvoiceNumber,
      description: `Sales collection against invoice ${cleanInvoiceNumber} (${order.customerName || 'Customer'})`,
      debit: paidAmount,
      credit: 0,
      amount: paidAmount,
      runningBalance: (account.currentBalanceBDT || 0) + paidAmount,
      remarks: remarks || `Order #${order.orderNumber} | Payment mode: ${paymentMethod}`,
      createdBy: currentUser.name || 'Sales Billing Desk',
      status: 'Posted',
      createdAt: now.toISOString(),
    };

    const updatedTxns = [newTxn, ...transactions];
    setTransactions(updatedTxns);
    setAccounts(recalculateAccountBalances(accounts, updatedTxns));

    const cbCOA = resolveAccountLinkForCashBank(account.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    postBalancedGLVoucherInternal({
      voucherType: 'Receipt Voucher',
      voucherNoHint: voucherNo,
      date: dateStr,
      referenceNo: cleanInvoiceNumber,
      description: `Sales invoice collection ${cleanInvoiceNumber} (${order.customerName || 'Customer'})`,
      sourceModule: 'CashBank',
      sourceId: newTxnId,
      partyType: order.distributorId ? 'Distributor' : 'Customer',
      partyId: order.customerId || order.distributorId,
      partyName: order.customerName || order.distributorName,
      lines: [
        { accountId: cbCOA, debit: paidAmount, credit: 0 },
        { accountId: COA_IDS.ACCOUNTS_RECEIVABLE, debit: 0, credit: paidAmount },
      ],
    });

    addAuditLog(
      'SALES_INVOICE_POSTED_TO_CASH_BANK',
      'Cash & Bank Module',
      `Posted collection BDT ${paidAmount.toLocaleString()} for Invoice ${cleanInvoiceNumber} into ${account.name}`
    );

    return {
      success: true,
      message: `Sales collection of BDT ${paidAmount.toLocaleString()} posted to ${account.name} & General Ledger!`,
    };
  };

  const syncPendingSalesOrders = () => {
    let synced = 0;
    let alreadySynced = 0;
    const newTxnsToAppend: CashBankTransaction[] = [];
    const defaultCash = accounts.find((a) => a.type === 'Cash') || accounts[0];
    const defaultBank = accounts.find((a) => a.type === 'Bank') || accounts[1] || accounts[0];

    salesOrders.forEach((so) => {
      const paid = Number(so.paidAmountBDT) || 0;
      if (paid > 0) {
        const invNo = so.invoiceNumber || so.invoiceNo || so.orderNumber || so.id;
        const already = transactions.some(
          (t) =>
            t.status !== 'Reversed' &&
            t.type === 'Sales Collection' &&
            (t.salesOrderId === so.id || t.invoiceNo === invNo || t.referenceNo === so.orderNumber)
        );
        if (already) {
          alreadySynced++;
        } else {
          const methodLower = (so.paymentMethod || '').toLowerCase();
          const isBank =
            methodLower.includes('bank') ||
            methodLower.includes('cheque') ||
            methodLower.includes('ebl') ||
            methodLower.includes('city');
          const targetAcc = isBank ? defaultBank : defaultCash;
          const voucherNo = `CB-SYNC-${so.orderNumber.slice(-4)}-${Date.now().toString().slice(-3)}`;
          newTxnsToAppend.push({
            id: `cbt-sync-${so.id}-${Date.now()}`,
            voucherNo,
            date: so.date || new Date().toISOString().slice(0, 10),
            type: 'Sales Collection',
            accountType: targetAcc.type,
            accountId: targetAcc.id,
            accountName: targetAcc.name,
            category: 'Finished Goods Sales Collection',
            partyName: so.customerName || 'Customer',
            invoiceNo: invNo,
            salesOrderId: so.id,
            referenceNo: so.orderNumber,
            description: `Auto-posted invoice collection for order ${so.orderNumber} (${so.customerName})`,
            debit: paid,
            credit: 0,
            amount: paid,
            runningBalance: (targetAcc.currentBalanceBDT || 0) + paid,
            remarks: `Payment Method: ${so.paymentMethod || 'Cash'}`,
            createdBy: 'System Auto-Post Engine',
            status: 'Posted',
            createdAt: new Date().toISOString(),
          });
          synced++;
        }
      }
    });

    if (newTxnsToAppend.length > 0) {
      const updatedTxns = [...newTxnsToAppend, ...transactions];
      setTransactions(updatedTxns);
      setAccounts(recalculateAccountBalances(accounts, updatedTxns));
      addAuditLog(
        'SALES_ORDERS_AUTO_SYNCED_TO_CASH_BANK',
        'Cash & Bank Module',
        `Auto-synced ${synced} sales invoice collections into Cash & Bank ledgers.`
      );
    }

    return {
      syncedCount: synced,
      alreadySyncedCount: alreadySynced,
      message:
        synced > 0
          ? `Successfully synchronized ${synced} sales collections into Cash & Bank!`
          : `All ${alreadySynced} sales orders are already synchronized with Cash & Bank ledgers.`,
    };
  };

  const reverseTransaction = (transactionId: string, reason: string) => {
    const targetTxn = transactions.find((t) => t.id === transactionId);
    if (!targetTxn) return { success: false, message: 'Transaction not found.' };
    if (targetTxn.status === 'Reversed') return { success: false, message: 'Transaction already reversed.' };
    if (!reason || reason.trim().length < 5) {
      return { success: false, message: 'Please provide a clear reversal justification (minimum 5 characters).' };
    }

    const revDate = new Date().toISOString().slice(0, 10);
    const periodCheck = validatePeriodForDate(revDate, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Current period is closed.' };
    }

    const now = new Date();
    const reversalVoucherNo = `REV-${targetTxn.voucherNo}`;
    const reversalTxn: CashBankTransaction = {
      id: `cbt-rev-${Date.now()}`,
      voucherNo: reversalVoucherNo,
      date: revDate,
      type: 'Reversal / Adjustment',
      accountType: targetTxn.accountType,
      accountId: targetTxn.accountId,
      accountName: targetTxn.accountName,
      category: `Reversal: ${targetTxn.category}`,
      partyName: targetTxn.partyName,
      referenceNo: `REV-FOR-${targetTxn.voucherNo}`,
      description: `Correction / Reversal of voucher ${targetTxn.voucherNo}. Reason: ${reason}`,
      debit: targetTxn.credit,
      credit: targetTxn.debit,
      amount: targetTxn.amount,
      runningBalance: 0,
      remarks: `Audited Reversal authorized by ${currentUser.name || 'Admin'}. Reason: ${reason}`,
      createdBy: currentUser.name || 'Authorized Auditor',
      status: 'Posted',
      reversalOfId: targetTxn.id,
      reversalReason: reason,
      createdAt: now.toISOString(),
    };

    const updatedTxns = transactions.map((t) =>
      t.id === transactionId
        ? { ...t, status: 'Reversed' as const, reversalOfId: reversalTxn.id, reversalReason: reason }
        : t
    );
    const finalTxns = [reversalTxn, ...updatedTxns];
    setTransactions(finalTxns);
    setAccounts(recalculateAccountBalances(accounts, finalTxns));

    // Also reverse linked GL voucher if one exists
    const linkedGLVoucher = vouchers.find(
      (v) =>
        v.status === 'Posted' &&
        (v.voucherNo === targetTxn.voucherNo ||
          (v.sourceModule === 'CashBank' &&
            (v.sourceId === targetTxn.id || v.sourceId === `contra-${targetTxn.voucherNo.replace(/-(B|C)$/, '')}`)))
    );
    if (linkedGLVoucher) {
      reverseVoucher(linkedGLVoucher.id, reason, revDate);
    }

    addAuditLog(
      'TRANSACTION_REVERSED',
      'Cash & Bank Module',
      `Reversed financial voucher ${targetTxn.voucherNo}. Reason: ${reason}`
    );

    return {
      success: true,
      message: `Voucher ${targetTxn.voucherNo} successfully reversed with adjustment entry ${reversalVoucherNo}!`,
    };
  };

  const addExpenseCategory = (name: string, description?: string) => {
    if (!name.trim()) return { success: false, message: 'Category name is required' };
    if (expenseCategories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return { success: false, message: 'Expense category already exists' };
    }
    const newCat: ExpenseCategoryDef = {
      id: `exp-cat-${Date.now()}`,
      code: `EXP-${name.slice(0, 4).toUpperCase()}`,
      name: name.trim(),
      isSystem: false,
      description: description?.trim() || 'Configured expense category',
    };
    setExpenseCategories((prev) => [...prev, newCat]);
    return { success: true, category: newCat, message: `Category "${name}" added successfully!` };
  };

  const addServiceCategory = (name: string, description?: string) => {
    if (!name.trim()) return { success: false, message: 'Category name is required' };
    if (serviceCategories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return { success: false, message: 'Service category already exists' };
    }
    const newCat: ServiceIncomeCategoryDef = {
      id: `inc-cat-${Date.now()}`,
      code: `INC-${name.slice(0, 4).toUpperCase()}`,
      name: name.trim(),
      isSystem: false,
      description: description?.trim() || 'Configured service category',
    };
    setServiceCategories((prev) => [...prev, newCat]);
    return { success: true, category: newCat, message: `Category "${name}" added successfully!` };
  };

  const addNewBankAccount = (bankData: Omit<CashBankAccount, 'id' | 'currentBalanceBDT'>) => {
    const id = `bank-${Date.now().toString().slice(-4)}`;
    const newAcc: CashBankAccount = {
      ...bankData,
      id,
      currentBalanceBDT: bankData.openingBalanceBDT || 0,
      currency: bankData.currency || 'BDT',
      status: 'Active',
    };
    const nextAccounts = [...accounts, newAcc];
    setAccounts(nextAccounts);
    setCoaAccounts((prev) => ensureCOAForCashBankAccounts(prev, nextAccounts));

    if (newAcc.openingBalanceBDT > 0) {
      recordOpeningBalance({
        accountType: 'Bank',
        accountId: id,
        accountName: newAcc.name,
        openingDate: newAcc.openingDate || new Date().toISOString().slice(0, 10),
        initialBalance: newAcc.openingBalanceBDT,
        remarks: newAcc.remarks || 'Initial bank account creation opening balance',
      });
    }

    addAuditLog('BANK_ACCOUNT_CREATED', 'Cash & Bank Module', `Configured bank account ${newAcc.name}`);
    return { success: true, id, message: `Bank Account "${newAcc.name}" created & linked to Chart of Accounts!` };
  };

  const updateAccountDetails = (accountId: string, updates: Partial<CashBankAccount>) => {
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, ...updates } : a)));
  };

  const getAccountTransactions = (accountId: string) =>
    transactions.filter((t) => t.accountId === accountId || t.targetAccountId === accountId);

  const resetToDefaultSampleData = () => {
    setAccounts(DEFAULT_CASH_BANK_ACCOUNTS);
    setTransactions(INITIAL_CASH_BANK_TRANSACTIONS);
    setOpeningBalances(DEFAULT_OPENING_BALANCES);
    setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
    setServiceCategories(DEFAULT_SERVICE_INCOME_CATEGORIES);
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    }
    setCoaAccounts(ensureCOAForCashBankAccounts(DEFAULT_COA_ACCOUNTS, DEFAULT_CASH_BANK_ACCOUNTS));
    setVouchers([]);
    setGlEntries([]);
    setOpeningBalanceBatches([]);
    setFinancialYears(DEFAULT_FINANCIAL_YEARS);
    setAccountingAuditLogs([]);
  };

  // ==================== 5. CHART OF ACCOUNTS (COA) CRUD ====================
  const createCOAAccount: CashBankContextType['createCOAAccount'] = (input) => {
    const cleanName = input.name.trim();
    if (!cleanName) return { success: false, message: 'Account name is required.' };

    const parent = input.parentId ? coaAccounts.find((a) => a.id === input.parentId) : null;
    if (input.parentId && !parent) {
      return { success: false, message: 'Selected Parent Account does not exist.' };
    }
    if (parent && !parent.isGroup) {
      return { success: false, message: `Parent "${parent.code} - ${parent.name}" is a leaf posting account, not a Parent Group.` };
    }

    // Generate or validate unique account code
    let code = (input.code || '').trim();
    if (!code) {
      if (parent) {
        const siblings = coaAccounts.filter((a) => a.parentId === parent.id);
        const numericCodes = siblings.map((s) => parseInt(s.code, 10)).filter((n) => !Number.isNaN(n));
        if (numericCodes.length > 0) {
          code = String(Math.max(...numericCodes) + 1);
        } else {
          const pNum = parseInt(parent.code, 10);
          code = Number.isNaN(pNum) ? `${parent.code}-01` : String(pNum + 1);
        }
      } else {
        const base =
          input.category === 'Asset'
            ? 1900
            : input.category === 'Liability'
            ? 2900
            : input.category === 'Equity'
            ? 3900
            : input.category === 'Revenue'
            ? 4900
            : 5900;
        let cand = base;
        while (coaAccounts.some((a) => a.code === String(cand))) cand += 1;
        code = String(cand);
      }
    }

    if (coaAccounts.some((a) => a.code.toLowerCase() === code.toLowerCase())) {
      return { success: false, message: `Account code "${code}" is already in use. Please enter a unique code.` };
    }

    const nowIso = new Date().toISOString();
    const newAcc: COAAccount = {
      id: `coa-${code}-${Date.now().toString().slice(-4)}`,
      code,
      name: cleanName,
      category: parent ? parent.category : input.category,
      classification: input.classification,
      parentId: input.parentId,
      level: parent ? parent.level + 1 : 1,
      isGroup: input.isGroup,
      isSystem: false,
      isContra: Boolean(input.isContra),
      normalBalance: getNormalBalanceForCategory(parent ? parent.category : input.category, Boolean(input.isContra)),
      isActive: true,
      description: input.description?.trim() || undefined,
      createdBy: currentUser?.name || 'Accounts Admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setCoaAccounts((prev) => [...prev, newAcc].sort((a, b) => a.code.localeCompare(b.code)));
    logAccountingAction('COA_ACCOUNT_CREATED', 'COA', newAcc.id, `Created ${newAcc.isGroup ? 'Group' : 'Ledger'} account ${newAcc.code} - ${newAcc.name}`);

    return { success: true, account: newAcc, message: `Account "${newAcc.code} - ${newAcc.name}" created successfully.` };
  };

  const updateCOAAccount: CashBankContextType['updateCOAAccount'] = (id, updates) => {
    const existing = coaAccounts.find((a) => a.id === id);
    if (!existing) return { success: false, message: 'Account not found.' };
    if (updates.code && updates.code.trim() !== existing.code) {
      if (coaAccounts.some((a) => a.id !== id && a.code.toLowerCase() === updates.code!.trim().toLowerCase())) {
        return { success: false, message: `Account code "${updates.code}" already exists.` };
      }
    }
    setCoaAccounts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              ...updates,
              code: updates.code ? updates.code.trim() : a.code,
              name: updates.name ? updates.name.trim() : a.name,
              updatedAt: new Date().toISOString(),
            }
          : a
      )
    );
    logAccountingAction('COA_ACCOUNT_UPDATED', 'COA', id, `Updated COA head ${existing.code} - ${updates.name || existing.name}`);
    return { success: true, message: 'Chart of Accounts head updated successfully.' };
  };

  const toggleCOAAccountStatus: CashBankContextType['toggleCOAAccountStatus'] = (id) => {
    const existing = coaAccounts.find((a) => a.id === id);
    if (!existing) return { success: false, message: 'Account not found.' };
    const nextStatus = !existing.isActive;
    setCoaAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: nextStatus, updatedAt: new Date().toISOString() } : a))
    );
    logAccountingAction(
      nextStatus ? 'COA_ACCOUNT_ACTIVATED' : 'COA_ACCOUNT_DEACTIVATED',
      'COA',
      id,
      `${nextStatus ? 'Activated' : 'Deactivated'} account ${existing.code} - ${existing.name}`
    );
    return { success: true, message: `Account ${existing.code} - ${existing.name} is now ${nextStatus ? 'Active' : 'Inactive'}.` };
  };

  const deleteCOAAccount: CashBankContextType['deleteCOAAccount'] = (id) => {
    const check = canDeleteCOAAccount(id, coaAccounts, glEntries, vouchers);
    if (!check.canDelete) {
      return { success: false, message: check.reason || 'Cannot delete this account.' };
    }
    const target = coaAccounts.find((a) => a.id === id);
    setCoaAccounts((prev) => prev.filter((a) => a.id !== id));
    logAccountingAction('COA_ACCOUNT_DELETED', 'COA', id, `Deleted unused COA account ${target?.code} - ${target?.name}`);
    return { success: true, message: `Account ${target?.code} deleted.` };
  };

  const getCOAAccountBalance = (accountId: string, asOfDate?: string): number => {
    const acc = coaAccounts.find((a) => a.id === accountId);
    if (!acc) return 0;

    if (acc.isGroup) {
      const childIds = new Set<string>();
      const collect = (pid: string) => {
        coaAccounts
          .filter((a) => a.parentId === pid)
          .forEach((child) => {
            if (child.isGroup) collect(child.id);
            else childIds.add(child.id);
          });
      };
      collect(acc.id);
      const relevant = glEntries.filter(
        (e) => childIds.has(e.accountId) && (!asOfDate || e.entryDate <= asOfDate)
      );
      const dr = relevant.reduce((s, e) => s + e.debit, 0);
      const cr = relevant.reduce((s, e) => s + e.credit, 0);
      return computeAccountNormalBalance(acc, dr, cr);
    }

    const entries = glEntries.filter(
      (e) => e.accountId === accountId && (!asOfDate || e.entryDate <= asOfDate)
    );
    const dr = entries.reduce((s, e) => s + e.debit, 0);
    const cr = entries.reduce((s, e) => s + e.credit, 0);
    return computeAccountNormalBalance(acc, dr, cr);
  };

  // ==================== 6. BALANCED OPENING BALANCES ====================
  const postOpeningBalanceBatch: CashBankContextType['postOpeningBalanceBatch'] = (input) => {
    if (!input.effectiveDate) return { success: false, message: 'Effective date is required.' };
    if (!input.lines || input.lines.length < 2) {
      return { success: false, message: 'Enter at least 2 balanced lines (e.g., Assets/Expenses Debit and Capital/Liabilities Credit).' };
    }

    const totalDr = ROUND2(input.lines.reduce((s, l) => s + (Number(l.openingDebit) || 0), 0));
    const totalCr = ROUND2(input.lines.reduce((s, l) => s + (Number(l.openingCredit) || 0), 0));
    if (totalDr <= 0 || Math.abs(totalDr - totalCr) > 0.01) {
      return {
        success: false,
        message: `Unbalanced Opening Entry blocked! Total Opening Debit (৳${totalDr.toLocaleString()}) must equal Total Opening Credit (৳${totalCr.toLocaleString()}).`,
      };
    }

    const voucherRes = postBalancedGLVoucherInternal({
      voucherType: 'Opening Journal',
      date: input.effectiveDate,
      referenceNo: input.referenceNo || `OB-${input.effectiveDate}`,
      description: input.description || `Opening Balance Entry effective ${input.effectiveDate}`,
      sourceModule: 'Opening Balance',
      sourceId: `ob-${Date.now()}`,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.openingDebit) || 0,
        credit: Number(l.openingCredit) || 0,
        description: l.description || input.description,
        partyName: l.partyName,
      })),
    });

    if (!voucherRes.ok || !voucherRes.voucher) {
      return { success: false, message: voucherRes.error || 'Failed to post Opening Balance voucher.' };
    }

    const batchLines: OpeningBalanceLine[] = input.lines.map((l, idx) => {
      const acc = coaAccounts.find((a) => a.id === l.accountId)!;
      return {
        id: `obl-${Date.now()}-${idx + 1}`,
        accountId: l.accountId,
        accountCode: acc.code,
        accountName: acc.name,
        category: acc.category,
        openingDebit: ROUND2(Number(l.openingDebit) || 0),
        openingCredit: ROUND2(Number(l.openingCredit) || 0),
        partyName: l.partyName,
        description: l.description,
      };
    });

    const batch: OpeningBalanceBatch = {
      id: `opb-${Date.now()}`,
      financialYearId: voucherRes.voucher.financialYearId || financialYears[0]?.id || 'fy-default',
      effectiveDate: input.effectiveDate,
      referenceNo: input.referenceNo || voucherRes.voucher.voucherNo,
      description: input.description,
      voucherId: voucherRes.voucher.id,
      voucherNo: voucherRes.voucher.voucherNo,
      totalDebit: totalDr,
      totalCredit: totalCr,
      lines: batchLines,
      postedBy: currentUser?.name || 'Accounts Head',
      postedAt: new Date().toISOString(),
    };

    setOpeningBalanceBatches((prev) => [batch, ...prev]);

    // If any Cash/Bank accounts received opening debit, reflect in CashBank opening balances & balances
    const cashLines = batchLines.filter((bl) => {
      const acc = coaAccounts.find((a) => a.id === bl.accountId);
      return Boolean(acc?.linkedCashBankAccountId);
    });
    if (cashLines.length > 0) {
      const newCashTxns: CashBankTransaction[] = [];
      cashLines.forEach((cl) => {
        const acc = coaAccounts.find((a) => a.id === cl.accountId);
        const cbAcc = accounts.find((c) => c.id === acc?.linkedCashBankAccountId);
        if (!cbAcc) return;
        const net = ROUND2(cl.openingDebit - cl.openingCredit);
        newCashTxns.push({
          id: `cbt-opb-${cbAcc.id}-${Date.now()}`,
          voucherNo: voucherRes.voucher!.voucherNo,
          date: input.effectiveDate,
          type: 'Opening Balance',
          accountType: cbAcc.type,
          accountId: cbAcc.id,
          accountName: cbAcc.name,
          category: 'Opening Balance',
          partyName: 'Opening Balance Equity',
          referenceNo: batch.referenceNo,
          description: input.description,
          debit: net > 0 ? net : 0,
          credit: net < 0 ? Math.abs(net) : 0,
          amount: Math.abs(net),
          runningBalance: net,
          createdBy: currentUser?.name || 'Accounts Head',
          status: 'Posted',
          createdAt: new Date().toISOString(),
        });
      });
      if (newCashTxns.length > 0) {
        const nextTxns = [...newCashTxns, ...transactions];
        setTransactions(nextTxns);
        setAccounts(recalculateAccountBalances(accounts, nextTxns));
      }
    }

    logAccountingAction(
      'OPENING_BALANCE_POSTED',
      'OpeningBalance',
      batch.id,
      `Posted balanced Opening Balance Journal ${batch.voucherNo} totaling ৳${totalDr.toLocaleString()}`,
      batch.voucherNo
    );

    return {
      success: true,
      batch,
      message: `Opening Balance posted cleanly via Opening Journal ${batch.voucherNo} (Dr = Cr = ৳${totalDr.toLocaleString()})!`,
    };
  };

  // ==================== 7. JOURNAL VOUCHER WORKFLOW ====================
  const saveVoucher: CashBankContextType['saveVoucher'] = (input) => {
    const existing = input.id ? vouchers.find((v) => v.id === input.id) : undefined;
    if (existing && (existing.status === 'Posted' || existing.status === 'Reversed')) {
      return {
        success: false,
        message: `Voucher ${existing.voucherNo} is already ${existing.status} and is immutable. Use a Reversal Voucher to correct posted entries.`,
      };
    }

    const periodCheck = validatePeriodForDate(
      input.voucherDate,
      financialYears,
      accountingSettings.enforcePeriodLocking
    );
    if (!periodCheck.allowed) {
      return { success: false, message: periodCheck.reason || 'Period is closed.' };
    }

    const voucherId = existing?.id || `vch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const lines: JournalVoucherLine[] = input.lines.map((l, idx) => {
      const acc = coaAccounts.find((a) => a.id === l.accountId);
      return {
        id: `vl-${voucherId}-${idx + 1}`,
        voucherId,
        lineNo: idx + 1,
        accountId: l.accountId,
        accountCode: acc?.code || '',
        accountName: acc?.name || '',
        description: l.description || input.description,
        debit: ROUND2(Number(l.debit) || 0),
        credit: ROUND2(Number(l.credit) || 0),
        partyType: input.partyType,
        partyId: input.partyId,
        partyName: l.partyName || input.partyName,
        costCenter: l.costCenter,
      };
    });

    const validation = validateVoucherLines(lines, coaAccounts);
    if (!validation.valid) {
      return { success: false, message: validation.error || 'Invalid voucher lines.' };
    }

    const voucherNo = existing?.voucherNo || generateVoucherNumber(input.voucherType, vouchers, input.voucherDate);
    const nowIso = new Date().toISOString();
    const performer = currentUser?.name || 'Accounts Officer';
    const shouldPost = Boolean(input.postImmediately) && !accountingSettings.requireVoucherApproval;

    const savedVoucher: JournalVoucher = {
      id: voucherId,
      voucherNo,
      voucherType: input.voucherType,
      voucherDate: input.voucherDate,
      financialYearId: periodCheck.financialYearId,
      periodId: periodCheck.periodId,
      referenceNo: input.referenceNo,
      description: input.description,
      lines,
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      status: shouldPost ? 'Posted' : 'Draft',
      sourceModule: 'Manual',
      partyType: input.partyType,
      partyId: input.partyId,
      partyName: input.partyName,
      attachmentUrl: input.attachmentUrl,
      attachmentName: input.attachmentName,
      preparedBy: existing?.preparedBy || performer,
      preparedAt: existing?.preparedAt || nowIso,
      approvedBy: shouldPost ? performer : undefined,
      approvedAt: shouldPost ? nowIso : undefined,
      postedBy: shouldPost ? performer : undefined,
      postedAt: shouldPost ? nowIso : undefined,
    };

    const nextVouchers = existing
      ? vouchers.map((v) => (v.id === existing.id ? savedVoucher : v))
      : [savedVoucher, ...vouchers];
    setVouchers(nextVouchers);

    if (shouldPost) {
      const newGL = buildGLEntriesFromVoucher(savedVoucher, coaAccounts);
      setGlEntries((prev) => [...newGL, ...prev]);
      syncCashBookFromPostedVoucher(savedVoucher);
      void syncVoucherToSupabase(savedVoucher, newGL);
      logAccountingAction('VOUCHER_POSTED', 'Voucher', savedVoucher.id, `Posted ${savedVoucher.voucherType} ${savedVoucher.voucherNo} (৳${savedVoucher.totalDebit.toLocaleString()})`, savedVoucher.voucherNo);
    } else {
      void syncVoucherToSupabase(savedVoucher, []);
      logAccountingAction('VOUCHER_DRAFT_SAVED', 'Voucher', savedVoucher.id, `Saved draft voucher ${savedVoucher.voucherNo}`, savedVoucher.voucherNo);
    }

    return {
      success: true,
      voucher: savedVoucher,
      message: shouldPost
        ? `Voucher ${savedVoucher.voucherNo} posted to General Ledger!`
        : `Draft voucher ${savedVoucher.voucherNo} saved.`,
    };
  };

  // Reflect cash/bank lines from manually created Journal Vouchers inside CashBook/BankBook too
  const syncCashBookFromPostedVoucher = (voucher: JournalVoucher) => {
    const newCashTxns: CashBankTransaction[] = [];
    voucher.lines.forEach((line) => {
      const acc = coaAccounts.find((a) => a.id === line.accountId);
      if (!acc?.linkedCashBankAccountId) return;
      const cbAcc = accounts.find((c) => c.id === acc.linkedCashBankAccountId);
      if (!cbAcc) return;
      const amt = Math.max(line.debit, line.credit);
      if (amt <= 0) return;

      const cbType: CashBankTransactionType =
        voucher.voucherType === 'Contra Voucher'
          ? line.debit > 0
            ? cbAcc.type === 'Bank'
              ? 'Cash to Bank Deposit'
              : 'Bank to Cash Withdrawal'
            : cbAcc.type === 'Cash'
            ? 'Cash to Bank Deposit'
            : 'Bank to Cash Withdrawal'
          : voucher.voucherType === 'Opening Journal'
          ? 'Opening Balance'
          : line.debit > 0
          ? 'Sales Collection'
          : 'Operational Expense';

      newCashTxns.push({
        id: `cbt-jv-${voucher.id}-${line.lineNo}`,
        voucherNo: voucher.voucherNo,
        date: voucher.voucherDate,
        type: cbType,
        accountType: cbAcc.type,
        accountId: cbAcc.id,
        accountName: cbAcc.name,
        category: voucher.voucherType,
        partyName: line.partyName || voucher.partyName || 'General Ledger Voucher',
        referenceNo: voucher.referenceNo || voucher.voucherNo,
        description: line.description || voucher.description,
        debit: line.debit,
        credit: line.credit,
        amount: amt,
        runningBalance: 0,
        createdBy: voucher.postedBy || voucher.preparedBy,
        status: 'Posted',
        isContra: voucher.voucherType === 'Contra Voucher',
        createdAt: new Date().toISOString(),
      });
    });

    if (newCashTxns.length > 0) {
      const nextTxns = [...newCashTxns, ...transactions];
      setTransactions(nextTxns);
      setAccounts(recalculateAccountBalances(accounts, nextTxns));
    }
  };

  const submitVoucherForApproval: CashBankContextType['submitVoucherForApproval'] = (voucherId) => {
    const v = vouchers.find((x) => x.id === voucherId);
    if (!v) return { success: false, message: 'Voucher not found.' };
    if (v.status !== 'Draft') return { success: false, message: `Voucher is currently ${v.status}.` };

    const updated: JournalVoucher = { ...v, status: 'Pending Approval' };
    setVouchers((prev) => prev.map((x) => (x.id === voucherId ? updated : x)));
    void syncVoucherToSupabase(updated, []);
    logAccountingAction('VOUCHER_SUBMITTED', 'Voucher', v.id, `Submitted ${v.voucherNo} for approval`, v.voucherNo);
    return { success: true, message: `Voucher ${v.voucherNo} submitted for approval.` };
  };

  const approveVoucher: CashBankContextType['approveVoucher'] = (voucherId) => {
    const v = vouchers.find((x) => x.id === voucherId);
    if (!v) return { success: false, message: 'Voucher not found.' };
    if (v.status !== 'Draft' && v.status !== 'Pending Approval') {
      return { success: false, message: `Voucher ${v.voucherNo} is already ${v.status}.` };
    }
    const updated: JournalVoucher = {
      ...v,
      status: 'Approved',
      approvedBy: currentUser?.name || 'Finance Controller',
      approvedAt: new Date().toISOString(),
    };
    setVouchers((prev) => prev.map((x) => (x.id === voucherId ? updated : x)));
    void syncVoucherToSupabase(updated, []);
    logAccountingAction('VOUCHER_APPROVED', 'Voucher', v.id, `Approved ${v.voucherNo}`, v.voucherNo);
    return { success: true, message: `Voucher ${v.voucherNo} approved. Ready to Post to GL.` };
  };

  const postVoucher: CashBankContextType['postVoucher'] = (voucherId) => {
    const v = vouchers.find((x) => x.id === voucherId);
    if (!v) return { success: false, message: 'Voucher not found.' };
    if (v.status === 'Posted' || v.status === 'Reversed') {
      return { success: false, message: `Voucher ${v.voucherNo} is already ${v.status}.` };
    }
    const validation = validateVoucherLines(v.lines, coaAccounts);
    if (!validation.valid) return { success: false, message: validation.error || 'Voucher is invalid/unbalanced.' };

    const periodCheck = validatePeriodForDate(v.voucherDate, financialYears, accountingSettings.enforcePeriodLocking);
    if (!periodCheck.allowed) return { success: false, message: periodCheck.reason || 'Period is closed.' };

    const nowIso = new Date().toISOString();
    const performer = currentUser?.name || 'Accounts Manager';
    const posted: JournalVoucher = {
      ...v,
      status: 'Posted',
      approvedBy: v.approvedBy || performer,
      approvedAt: v.approvedAt || nowIso,
      postedBy: performer,
      postedAt: nowIso,
    };
    const newGL = buildGLEntriesFromVoucher(posted, coaAccounts);
    setVouchers((prev) => prev.map((x) => (x.id === voucherId ? posted : x)));
    setGlEntries((prev) => [...newGL, ...prev]);
    syncCashBookFromPostedVoucher(posted);
    void syncVoucherToSupabase(posted, newGL);
    logAccountingAction('VOUCHER_POSTED', 'Voucher', posted.id, `Posted ${posted.voucherNo} (৳${posted.totalDebit.toLocaleString()})`, posted.voucherNo);
    return { success: true, message: `Voucher ${posted.voucherNo} permanently posted to General Ledger!` };
  };

  const reverseVoucher: CashBankContextType['reverseVoucher'] = (voucherId, reason, reversalDate) => {
    const original = vouchers.find((v) => v.id === voucherId);
    if (!original) return { success: false, message: 'Voucher not found.' };
    if (!reason || reason.trim().length < 5) {
      return { success: false, message: 'Reversal reason must be at least 5 characters.' };
    }
    const revDate = reversalDate || new Date().toISOString().slice(0, 10);
    const revRes = createReversalVoucherObject(
      original,
      reason.trim(),
      currentUser?.name || 'Authorized Auditor',
      revDate,
      vouchers,
      financialYears
    );
    if (revRes.error) return { success: false, message: revRes.error };

    const revVoucher = revRes.voucher;
    const revGL = buildGLEntriesFromVoucher(revVoucher, coaAccounts);
    const updatedOriginal: JournalVoucher = {
      ...original,
      status: 'Reversed',
      reversedBy: currentUser?.name || 'Authorized Auditor',
      reversedAt: new Date().toISOString(),
      reversalReason: reason.trim(),
      reversedByVoucherId: revVoucher.id,
    };

    setVouchers((prev) => [revVoucher, ...prev.map((v) => (v.id === original.id ? updatedOriginal : v))]);
    setGlEntries((prev) => [...revGL, ...prev]);
    syncCashBookFromPostedVoucher(revVoucher);
    void syncVoucherToSupabase(updatedOriginal, []);
    void syncVoucherToSupabase(revVoucher, revGL);

    logAccountingAction(
      'VOUCHER_REVERSED',
      'Voucher',
      original.id,
      `Reversed ${original.voucherNo} via ${revVoucher.voucherNo}. Reason: ${reason.trim()}`,
      revVoucher.voucherNo
    );

    return {
      success: true,
      reversalVoucher: revVoucher,
      message: `Voucher ${original.voucherNo} marked Reversed and mirrored by ${revVoucher.voucherNo}.`,
    };
  };

  // ==================== 8. AR / AP SUB-LEDGER COLLECTIONS & PAYMENTS ====================
  const recordReceivableCollection: CashBankContextType['recordReceivableCollection'] = (input) => {
    if (!input.amount || input.amount <= 0) {
      return { success: false, message: 'Collection amount must be greater than zero.' };
    }
    const cbAcc = accounts.find((a) => a.id === input.cashBankAccountId);
    if (!cbAcc) return { success: false, message: 'Select a valid Cash or Bank account.' };

    const cbCOA = resolveAccountLinkForCashBank(cbAcc.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    const voucherRes = postBalancedGLVoucherInternal({
      voucherType: 'Receipt Voucher',
      date: input.date,
      referenceNo: input.referenceNo || input.invoiceNo || `REC-${Date.now().toString().slice(-4)}`,
      description: `Receivable collection from ${input.partyName}${input.invoiceNo ? ` (Inv: ${input.invoiceNo})` : ''}`,
      sourceModule: 'Manual',
      sourceId: `ar-col-${Date.now()}`,
      partyType: input.partyType,
      partyId: input.partyId,
      partyName: input.partyName,
      lines: [
        { accountId: cbCOA, debit: input.amount, credit: 0 },
        { accountId: COA_IDS.ACCOUNTS_RECEIVABLE, debit: 0, credit: input.amount, partyName: input.partyName },
      ],
    });

    if (!voucherRes.ok || !voucherRes.voucher) {
      return { success: false, message: voucherRes.error || 'Failed to record collection.' };
    }

    // Also insert into CashBook/BankBook for seamless unified liquidity view
    const cbTxn: CashBankTransaction = {
      id: `cbt-ar-${Date.now()}`,
      voucherNo: voucherRes.voucher.voucherNo,
      date: input.date,
      type: 'Sales Collection',
      accountType: cbAcc.type,
      accountId: cbAcc.id,
      accountName: cbAcc.name,
      category: 'Accounts Receivable Collection',
      partyName: input.partyName,
      invoiceNo: input.invoiceNo,
      salesOrderId: input.salesOrderId,
      referenceNo: input.referenceNo || voucherRes.voucher.voucherNo,
      description: `AR Collection from ${input.partyName}${input.invoiceNo ? ` (${input.invoiceNo})` : ''}`,
      debit: input.amount,
      credit: 0,
      amount: input.amount,
      runningBalance: (cbAcc.currentBalanceBDT || 0) + input.amount,
      remarks: input.remarks,
      createdBy: currentUser?.name || 'Accounts Officer',
      status: 'Posted',
      createdAt: new Date().toISOString(),
    };
    const nextTxns = [cbTxn, ...transactions];
    setTransactions(nextTxns);
    setAccounts(recalculateAccountBalances(accounts, nextTxns));

    logAccountingAction(
      'AR_COLLECTION_POSTED',
      'Voucher',
      voucherRes.voucher.id,
      `Collected ৳${input.amount.toLocaleString()} from ${input.partyName} into ${cbAcc.name}`,
      voucherRes.voucher.voucherNo
    );

    return {
      success: true,
      voucherNo: voucherRes.voucher.voucherNo,
      message: `Receipt Voucher ${voucherRes.voucher.voucherNo} for ৳${input.amount.toLocaleString()} posted to Cash/Bank & General Ledger!`,
    };
  };

  const recordSupplierPayment: CashBankContextType['recordSupplierPayment'] = (input) => {
    if (!input.amount || input.amount <= 0) {
      return { success: false, message: 'Payment amount must be greater than zero.' };
    }
    const cbAcc = accounts.find((a) => a.id === input.cashBankAccountId);
    if (!cbAcc) return { success: false, message: 'Select a valid Cash or Bank account.' };

    if (
      cbAcc.currentBalanceBDT < input.amount &&
      !input.allowNegativeOverride &&
      !accountingSettings.allowNegativeCashBank
    ) {
      return {
        success: false,
        message: `Insufficient funds in ${cbAcc.name} (Available: ৳${cbAcc.currentBalanceBDT.toLocaleString()}).`,
      };
    }

    const cbCOA = resolveAccountLinkForCashBank(cbAcc.id, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    const apHead = input.partyType === 'Optimum JV' ? COA_IDS.OPTIMUM_JV_PAYABLE : COA_IDS.SUPPLIER_PAYABLES;

    const voucherRes = postBalancedGLVoucherInternal({
      voucherType: 'Payment Voucher',
      date: input.date,
      referenceNo: input.referenceNo || input.grnNumber || `PAY-${Date.now().toString().slice(-4)}`,
      description: `Supplier payment to ${input.supplierName}${input.grnNumber ? ` (GRN: ${input.grnNumber})` : ''}`,
      sourceModule: 'Manual',
      sourceId: `ap-pay-${Date.now()}`,
      partyType: input.partyType,
      partyId: input.supplierKey,
      partyName: input.supplierName,
      lines: [
        { accountId: apHead, debit: input.amount, credit: 0, partyName: input.supplierName },
        { accountId: cbCOA, debit: 0, credit: input.amount },
      ],
    });

    if (!voucherRes.ok || !voucherRes.voucher) {
      return { success: false, message: voucherRes.error || 'Failed to record supplier payment.' };
    }

    const cbTxn: CashBankTransaction = {
      id: `cbt-ap-${Date.now()}`,
      voucherNo: voucherRes.voucher.voucherNo,
      date: input.date,
      type: 'Operational Expense',
      accountType: cbAcc.type,
      accountId: cbAcc.id,
      accountName: cbAcc.name,
      category: input.partyType === 'Optimum JV' ? 'Optimum JV Settlement' : 'Supplier Payable Settlement',
      partyName: input.supplierName,
      referenceNo: input.referenceNo || voucherRes.voucher.voucherNo,
      description: `Supplier Payment to ${input.supplierName}${input.grnNumber ? ` (${input.grnNumber})` : ''}`,
      debit: 0,
      credit: input.amount,
      amount: input.amount,
      runningBalance: (cbAcc.currentBalanceBDT || 0) - input.amount,
      remarks: input.remarks,
      createdBy: currentUser?.name || 'Accounts Officer',
      status: 'Posted',
      createdAt: new Date().toISOString(),
    };
    const nextTxns = [cbTxn, ...transactions];
    setTransactions(nextTxns);
    setAccounts(recalculateAccountBalances(accounts, nextTxns));

    logAccountingAction(
      'AP_PAYMENT_POSTED',
      'Voucher',
      voucherRes.voucher.id,
      `Paid ৳${input.amount.toLocaleString()} to ${input.supplierName} from ${cbAcc.name}`,
      voucherRes.voucher.voucherNo
    );

    return {
      success: true,
      voucherNo: voucherRes.voucher.voucherNo,
      message: `Payment Voucher ${voucherRes.voucher.voucherNo} for ৳${input.amount.toLocaleString()} posted to Cash/Bank & General Ledger!`,
    };
  };

  // ==================== 9. FINANCIAL YEARS & PERIOD LOCKING ====================
  const createFinancialYear: CashBankContextType['createFinancialYear'] = (input) => {
    if (!input.name.trim() || !input.startDate || !input.endDate) {
      return { success: false, message: 'Financial Year name, start date, and end date are required.' };
    }
    if (input.startDate >= input.endDate) {
      return { success: false, message: 'End Date must be after Start Date.' };
    }
    const overlap = financialYears.some(
      (fy) => input.startDate <= fy.endDate && input.endDate >= fy.startDate
    );
    if (overlap) {
      return { success: false, message: 'Date range overlaps with an existing Financial Year.' };
    }

    const fyId = `fy-${Date.now().toString().slice(-6)}`;
    const newFY: FinancialYear = {
      id: fyId,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      isActive: Boolean(input.setActive),
      status: 'Open',
      periods: buildMonthlyPeriodsForYear(fyId, input.startDate, input.endDate),
    };

    setFinancialYears((prev) =>
      [...(input.setActive ? prev.map((f) => ({ ...f, isActive: false })) : prev), newFY]
    );
    logAccountingAction('FINANCIAL_YEAR_CREATED', 'FinancialYear', fyId, `Created ${newFY.name} (${newFY.startDate} to ${newFY.endDate})`);
    return { success: true, financialYear: newFY, message: `${newFY.name} created with ${newFY.periods.length} monthly periods.` };
  };

  const setActiveFinancialYear: CashBankContextType['setActiveFinancialYear'] = (fyId) => {
    const target = financialYears.find((f) => f.id === fyId);
    if (!target) return { success: false, message: 'Financial Year not found.' };
    setFinancialYears((prev) => prev.map((f) => ({ ...f, isActive: f.id === fyId })));
    logAccountingAction('FINANCIAL_YEAR_ACTIVATED', 'FinancialYear', fyId, `Set ${target.name} as Active Financial Year`);
    return { success: true, message: `${target.name} is now the Active Financial Year.` };
  };

  const updatePeriodStatus: CashBankContextType['updatePeriodStatus'] = (fyId, periodId, status) => {
    const fy = financialYears.find((f) => f.id === fyId);
    if (!fy) return { success: false, message: 'Financial Year not found.' };
    if (fy.status === 'Closed' && status === 'Open') {
      return { success: false, message: `Financial Year "${fy.name}" is closed. Closed fiscal years cannot reopen sub-periods.` };
    }
    const period = fy.periods.find((p) => p.id === periodId);
    if (!period) return { success: false, message: 'Period not found.' };

    setFinancialYears((prev) =>
      prev.map((f) =>
        f.id === fyId
          ? {
              ...f,
              periods: f.periods.map((p) =>
                p.id === periodId
                  ? {
                      ...p,
                      status,
                      closedBy: status === 'Open' ? undefined : currentUser?.name || 'Admin',
                      closedAt: status === 'Open' ? undefined : new Date().toISOString(),
                    }
                  : p
              ),
            }
          : f
      )
    );
    logAccountingAction('PERIOD_STATUS_UPDATED', 'Period', periodId, `${fy.name} — ${period.name} marked ${status}`);
    return { success: true, message: `Period "${period.name}" is now ${status}.` };
  };

  const performYearEndClosing: CashBankContextType['performYearEndClosing'] = (fyId) => {
    const fy = financialYears.find((f) => f.id === fyId);
    if (!fy) return { success: false, message: 'Financial Year not found.' };
    if (fy.status === 'Closed') return { success: false, message: `${fy.name} is already closed.` };

    const pl = buildProfitLoss(coaAccounts, glEntries, fy.startDate, fy.endDate);
    const closingLines: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];

    // Zero out revenue accounts (Credit-normal -> Debit to close)
    pl.revenueLines.forEach((r) => {
      if (r.amount > 0) {
        closingLines.push({
          accountId: r.accountId,
          debit: r.amount,
          credit: 0,
          description: `Year-end close ${r.accountName} (${fy.name})`,
        });
      } else if (r.amount < 0) {
        closingLines.push({
          accountId: r.accountId,
          debit: 0,
          credit: Math.abs(r.amount),
          description: `Year-end close ${r.accountName} (${fy.name})`,
        });
      }
    });

    // Zero out expense accounts (Debit-normal -> Credit to close)
    [...pl.cogsLines, ...pl.factoryExpenseLines, ...pl.operatingExpenseLines, ...pl.depreciationLines].forEach((ex) => {
      if (ex.amount > 0) {
        closingLines.push({
          accountId: ex.accountId,
          debit: 0,
          credit: ex.amount,
          description: `Year-end close ${ex.accountName} (${fy.name})`,
        });
      } else if (ex.amount < 0) {
        closingLines.push({
          accountId: ex.accountId,
          debit: Math.abs(ex.amount),
          credit: 0,
          description: `Year-end close ${ex.accountName} (${fy.name})`,
        });
      }
    });

    let closingVoucherNo: string | undefined;
    let closingVoucherId: string | undefined;

    if (closingLines.length > 0 && Math.abs(pl.netProfitLoss) >= 0.01) {
      if (pl.netProfitLoss > 0) {
        closingLines.push({
          accountId: COA_IDS.RETAINED_EARNINGS,
          debit: 0,
          credit: ROUND2(pl.netProfitLoss),
          description: `Net Profit for ${fy.name} transferred to Retained Earnings`,
        });
      } else {
        closingLines.push({
          accountId: COA_IDS.RETAINED_EARNINGS,
          debit: ROUND2(Math.abs(pl.netProfitLoss)),
          credit: 0,
          description: `Net Loss for ${fy.name} transferred to Retained Earnings`,
        });
      }

      const vId = `vch-yec-${fy.id}`;
      const vNo = `YEC-${fy.name.replace(/\s+/g, '')}`;
      const builtLines: JournalVoucherLine[] = closingLines.map((l, idx) => {
        const acc = coaAccounts.find((a) => a.id === l.accountId)!;
        return {
          id: `vl-${vId}-${idx + 1}`,
          voucherId: vId,
          lineNo: idx + 1,
          accountId: l.accountId,
          accountCode: acc.code,
          accountName: acc.name,
          description: l.description,
          debit: ROUND2(l.debit),
          credit: ROUND2(l.credit),
        };
      });

      const totalDr = ROUND2(builtLines.reduce((s, l) => s + l.debit, 0));
      const totalCr = ROUND2(builtLines.reduce((s, l) => s + l.credit, 0));
      const nowIso = new Date().toISOString();
      const performer = currentUser?.name || 'Finance Director';

      const yecVoucher: JournalVoucher = {
        id: vId,
        voucherNo: vNo,
        voucherType: 'Year-End Closing Journal',
        voucherDate: fy.endDate,
        financialYearId: fy.id,
        referenceNo: fy.name,
        description: `Year-End Closing Entry for ${fy.name} — Retained Earnings Transfer: ৳${pl.netProfitLoss.toLocaleString()}`,
        lines: builtLines,
        totalDebit: totalDr,
        totalCredit: totalCr,
        status: 'Posted',
        sourceModule: 'Year-End Closing',
        sourceId: fy.id,
        preparedBy: performer,
        preparedAt: nowIso,
        approvedBy: performer,
        approvedAt: nowIso,
        postedBy: performer,
        postedAt: nowIso,
      };

      const newGL = buildGLEntriesFromVoucher(yecVoucher, coaAccounts);
      setVouchers((prev) => [yecVoucher, ...prev]);
      setGlEntries((prev) => [...newGL, ...prev]);
      void syncVoucherToSupabase(yecVoucher, newGL);
      closingVoucherNo = vNo;
      closingVoucherId = vId;
    }

    setFinancialYears((prev) =>
      prev.map((f) =>
        f.id === fyId
          ? {
              ...f,
              status: 'Closed',
              closedAt: new Date().toISOString(),
              closedBy: currentUser?.name || 'Finance Director',
              closingVoucherId,
              retainedEarningsTransferredBDT: pl.netProfitLoss,
              periods: f.periods.map((p) => ({
                ...p,
                status: 'Locked',
                closedBy: p.closedBy || currentUser?.name || 'Finance Director',
                closedAt: p.closedAt || new Date().toISOString(),
              })),
            }
          : f
      )
    );

    logAccountingAction(
      'YEAR_END_CLOSING_COMPLETED',
      'FinancialYear',
      fyId,
      `Closed ${fy.name} and transferred Net P&L (৳${pl.netProfitLoss.toLocaleString()}) to Retained Earnings.`,
      closingVoucherNo
    );

    return {
      success: true,
      voucherNo: closingVoucherNo,
      message: `${fy.name} closed successfully! Net P&L of ৳${pl.netProfitLoss.toLocaleString()} transferred to Retained Earnings${closingVoucherNo ? ` (${closingVoucherNo})` : ''}.`,
    };
  };

  const updateAccountingSettings: CashBankContextType['updateAccountingSettings'] = (updates) => {
    setAccountingSettings((prev) => ({
      ...prev,
      ...updates,
      updatedBy: currentUser?.name || 'Admin',
      updatedAt: new Date().toISOString(),
    }));
  };

  // ==================== 10. SUB-LEDGER COMPUTATIONS (AR & AP + GL RECONCILIATION) ====================
  const receivableSubLedger: ReceivableSubLedgerRow[] = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const partyMap = new Map<string, ReceivableSubLedgerRow>();

    // Track direct GL receipt vouchers posted via AR Sub-ledger
    const arReceiptsByParty = new Map<string, number>();
    vouchers.forEach((v) => {
      if (v.status === 'Posted' && v.sourceModule === 'Manual' && v.voucherType === 'Receipt Voucher') {
        const arCredit = v.lines
          .filter((l) => l.accountId === COA_IDS.ACCOUNTS_RECEIVABLE || l.accountId === COA_IDS.INSTALLMENT_RECEIVABLE)
          .reduce((s, l) => s + l.credit, 0);
        if (arCredit > 0 && v.partyName) {
          const k = v.partyName.trim().toLowerCase();
          arReceiptsByParty.set(k, (arReceiptsByParty.get(k) || 0) + arCredit);
        }
      }
    });

    salesOrders.forEach((so) => {
      if (so.status === 'Cancelled' || so.status === 'Booked') return;
      const isDist = Boolean(so.distributorId);
      const partyId = so.distributorId || so.customerId || so.customerName;
      const partyName = so.distributorName || so.customerName || 'Walk-in Customer';
      const key = `${isDist ? 'D' : 'C'}::${partyId || partyName}`;

      if (!partyMap.has(key)) {
        const cust = customers.find((c) => c.id === so.customerId || c.name === partyName);
        const dist = distributors.find((d) => d.id === so.distributorId || d.name === partyName);
        partyMap.set(key, {
          partyId: partyId || partyName,
          partyName,
          partyType: isDist ? 'Distributor' : 'Customer',
          phone: cust?.phone || dist?.phone,
          zone: dist?.region || dist?.territory || cust?.zone || cust?.city,
          totalInvoiced: 0,
          totalReceived: 0,
          outstandingBalance: 0,
          overdueAmount: 0,
          invoiceCount: 0,
          invoices: [],
          paymentHistory: [],
        });
      }

      const row = partyMap.get(key)!;
      const net = ROUND2(so.netAmountBDT || 0);
      const paid = ROUND2(so.paidAmountBDT || 0);
      const due = ROUND2(Math.max(0, net - paid));
      const invDate = (so.date || todayStr).slice(0, 10);
      const dObj = new Date(`${invDate}T00:00:00`);
      dObj.setDate(dObj.getDate() + 30);
      const dueDate = dObj.toISOString().slice(0, 10);
      const isOverdue = due > 0 && dueDate < todayStr;

      row.totalInvoiced = ROUND2(row.totalInvoiced + net);
      row.totalReceived = ROUND2(row.totalReceived + paid);
      row.outstandingBalance = ROUND2(row.outstandingBalance + due);
      if (isOverdue) row.overdueAmount = ROUND2(row.overdueAmount + due);
      row.invoiceCount += 1;

      row.invoices.push({
        orderId: so.id,
        invoiceNo: so.invoiceNumber || so.invoiceNo || so.orderNumber,
        invoiceDate: invDate,
        dueDate,
        totalAmount: net,
        receivedAmount: paid,
        outstandingAmount: due,
        status: due <= 0.01 ? 'Paid' : isOverdue ? 'Overdue' : paid > 0 ? 'Partial' : 'Unpaid',
      });
    });

    // Attach direct manual Receipt Vouchers payment history
    vouchers.forEach((v) => {
      if (v.status !== 'Posted') return;
      const arCr = v.lines
        .filter((l) => l.accountId === COA_IDS.ACCOUNTS_RECEIVABLE || l.accountId === COA_IDS.INSTALLMENT_RECEIVABLE)
        .reduce((s, l) => s + l.credit, 0);
      if (arCr <= 0) return;

      for (const row of partyMap.values()) {
        if (
          (v.partyId && row.partyId === v.partyId) ||
          (v.partyName && row.partyName.toLowerCase() === v.partyName.toLowerCase())
        ) {
          row.paymentHistory.push({
            id: v.id,
            date: v.voucherDate,
            voucherNo: v.voucherNo,
            referenceNo: v.referenceNo,
            amount: arCr,
            method: v.voucherType,
          });
          if (v.sourceModule === 'Manual') {
            row.totalReceived = ROUND2(row.totalReceived + arCr);
            row.outstandingBalance = ROUND2(Math.max(0, row.totalInvoiced - row.totalReceived));
          }
          break;
        }
      }
    });

    return Array.from(partyMap.values()).sort((a, b) => b.outstandingBalance - a.outstandingBalance);
  }, [salesOrders, customers, distributors, vouchers]);

  const payableSubLedger: PayableSubLedgerRow[] = useMemo(() => {
    const supplierMap = new Map<string, PayableSubLedgerRow>();

    // Track manual supplier payment vouchers
    const manualPaymentsByParty = new Map<string, { total: number; history: PayableSubLedgerRow['paymentHistory'] }>();
    vouchers.forEach((v) => {
      if (v.status !== 'Posted') return;
      const apDr = v.lines
        .filter((l) => l.accountId === COA_IDS.SUPPLIER_PAYABLES || l.accountId === COA_IDS.ACCOUNTS_PAYABLE || l.accountId === COA_IDS.OPTIMUM_JV_PAYABLE)
        .reduce((s, l) => s + l.debit, 0);
      if (apDr <= 0 || !v.partyName) return;
      const k = v.partyName.trim().toLowerCase();
      if (!manualPaymentsByParty.has(k)) manualPaymentsByParty.set(k, { total: 0, history: [] });
      const rec = manualPaymentsByParty.get(k)!;
      rec.total = ROUND2(rec.total + apDr);
      rec.history.push({
        id: v.id,
        date: v.voucherDate,
        voucherNo: v.voucherNo,
        referenceNo: v.referenceNo,
        amount: apDr,
        method: v.voucherType,
      });
    });

    rawMaterialReceipts.forEach((grn) => {
      if (grn.status === 'Cancelled' || grn.status === 'Draft') return;
      const key = grn.supplierId || grn.supplierName || 'Unknown Supplier';
      if (!supplierMap.has(key)) {
        supplierMap.set(key, {
          supplierKey: key,
          supplierName: grn.supplierName || 'Raw Material Supplier',
          partyType: 'Supplier',
          totalPurchased: 0,
          totalPaid: 0,
          outstandingBalance: 0,
          billCount: 0,
          bills: [],
          paymentHistory: [],
        });
      }
      const row = supplierMap.get(key)!;
      const amt = ROUND2(grn.totalPurchaseValue || 0);
      row.totalPurchased = ROUND2(row.totalPurchased + amt);
      row.billCount += 1;

      const rDate = (grn.receiveDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const dObj = new Date(`${rDate}T00:00:00`);
      dObj.setDate(dObj.getDate() + 30);

      row.bills.push({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        purchaseDate: rDate,
        dueDate: dObj.toISOString().slice(0, 10),
        totalAmount: amt,
        paidAmount: 0,
        outstandingAmount: amt,
        status: 'Unpaid',
      });
    });

    // Apply payments FIFO across bills for each supplier
    supplierMap.forEach((row) => {
      const pInfo = manualPaymentsByParty.get(row.supplierName.toLowerCase());
      if (pInfo) {
        row.totalPaid = ROUND2(pInfo.total);
        row.paymentHistory = pInfo.history;
        let rem = row.totalPaid;
        row.bills.forEach((b) => {
          if (rem <= 0) return;
          const applied = Math.min(rem, b.totalAmount);
          b.paidAmount = ROUND2(applied);
          b.outstandingAmount = ROUND2(b.totalAmount - applied);
          b.status = b.outstandingAmount <= 0.01 ? 'Paid' : 'Partial';
          rem = ROUND2(rem - applied);
        });
      }
      row.outstandingBalance = ROUND2(Math.max(0, row.totalPurchased - row.totalPaid));
    });

    // Include Optimum JV Partner row separately so AP clearly reconciles Optimum Conversion & JV Clearing
    if (optimumStatement.length > 0) {
      let optPurchased = 0;
      let optPaid = 0;
      const optBills: PayableSubLedgerRow['bills'] = [];
      const optHistory: PayableSubLedgerRow['paymentHistory'] = [];

      optimumStatement.forEach((opt) => {
        const dr = ROUND2(opt.debitBDT || opt.debitEnsecBDT || 0);
        const cr = ROUND2(opt.creditBDT || opt.creditOptimumBDT || 0);
        if (dr > 0) {
          optPurchased = ROUND2(optPurchased + dr);
          optBills.push({
            grnId: opt.id,
            grnNumber: opt.reference || opt.id,
            purchaseDate: (opt.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
            dueDate: (opt.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
            totalAmount: dr,
            paidAmount: 0,
            outstandingAmount: dr,
            status: 'Unpaid',
          });
        }
        if (cr > 0) {
          optPaid = ROUND2(optPaid + cr);
          optHistory.push({
            id: opt.id,
            date: (opt.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
            voucherNo: opt.reference || opt.id,
            referenceNo: opt.reference || '',
            amount: cr,
            method: 'Bank Transfer',
          });
        }
      });

      const manualOpt = manualPaymentsByParty.get('optimum jv (kushtia factory partner)');
      if (manualOpt) {
        optPaid = ROUND2(optPaid + manualOpt.total);
        optHistory.push(...manualOpt.history);
      }

      supplierMap.set('optimum-jv-partner', {
        supplierKey: 'optimum-jv-partner',
        supplierName: 'Optimum JV (Kushtia Factory Partner)',
        partyType: 'Optimum JV',
        totalPurchased: optPurchased,
        totalPaid: optPaid,
        outstandingBalance: ROUND2(Math.max(0, optPurchased - optPaid)),
        billCount: optBills.length,
        bills: optBills,
        paymentHistory: optHistory,
      });
    }

    return Array.from(supplierMap.values()).sort((a, b) => b.outstandingBalance - a.outstandingBalance);
  }, [rawMaterialReceipts, optimumStatement, vouchers]);

  const arControlBalance = useMemo(
    () => ROUND2(getCOAAccountBalance(COA_IDS.ACCOUNTS_RECEIVABLE) + getCOAAccountBalance(COA_IDS.INSTALLMENT_RECEIVABLE)),
    [glEntries, coaAccounts]
  );

  const apControlBalance = useMemo(
    () => ROUND2(getCOAAccountBalance(COA_IDS.SUPPLIER_PAYABLES) + getCOAAccountBalance(COA_IDS.ACCOUNTS_PAYABLE)),
    [glEntries, coaAccounts]
  );

  const optimumControlBalance = useMemo(
    () => ROUND2(getCOAAccountBalance(COA_IDS.OPTIMUM_JV_PAYABLE)),
    [glEntries, coaAccounts]
  );

  // ==================== 11. DASHBOARD KPIs ====================
  const kpis: CashBankSummaryKPIs = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthStr = todayStr.slice(0, 7);

    let totalOpeningCash = 0;
    let totalOpeningBank = 0;
    let currentCashBalance = 0;
    let currentBankBalance = 0;

    accounts.forEach((a) => {
      if (a.type === 'Cash') {
        totalOpeningCash += a.openingBalanceBDT || 0;
        currentCashBalance += a.currentBalanceBDT || 0;
      } else {
        totalOpeningBank += a.openingBalanceBDT || 0;
        currentBankBalance += a.currentBalanceBDT || 0;
      }
    });

    let totalCashReceived = 0;
    let totalCashPaid = 0;
    let totalBankDeposits = 0;
    let totalBankWithdrawals = 0;
    let todayIncome = 0;
    let todayExpense = 0;
    let monthIncome = 0;
    let monthExpense = 0;

    transactions.forEach((t) => {
      if (t.status === 'Reversed') return;
      const isToday = t.date === todayStr;
      const isThisMonth = t.date?.startsWith(thisMonthStr);

      if (t.accountType === 'Cash') {
        if (t.type === 'Sales Collection' || t.type === 'Service Income' || t.type === 'Bank to Cash Withdrawal') {
          totalCashReceived += t.debit || 0;
        }
        if (t.type === 'Operational Expense' || t.type === 'Cash to Bank Deposit') {
          totalCashPaid += t.credit || 0;
        }
      }
      if (t.accountType === 'Bank') {
        if (t.type === 'Cash to Bank Deposit') totalBankDeposits += t.debit || 0;
        if (t.type === 'Bank to Cash Withdrawal') totalBankWithdrawals += t.credit || 0;
      }
      if (t.type === 'Sales Collection' || t.type === 'Service Income') {
        if (isToday) todayIncome += t.debit || 0;
        if (isThisMonth) monthIncome += t.debit || 0;
      }
      if (t.type === 'Operational Expense') {
        if (isToday) todayExpense += t.credit || 0;
        if (isThisMonth) monthExpense += t.credit || 0;
      }
    });

    return {
      totalOpeningCash,
      totalOpeningBank,
      totalOpeningCombined: totalOpeningCash + totalOpeningBank,
      totalCashReceived,
      totalCashPaid,
      totalBankDeposits,
      totalBankWithdrawals,
      currentCashBalance,
      currentBankBalance,
      combinedCashBankBalance: currentCashBalance + currentBankBalance,
      todayIncome,
      todayExpense,
      todayNetFlow: todayIncome - todayExpense,
      monthIncome,
      monthExpense,
      monthNetFlow: monthIncome - monthExpense,
    };
  }, [accounts, transactions]);

  const accountingKPIs: AccountingDashboardKPIs = useMemo(
    () => computeAccountingDashboardKPIs(coaAccounts, glEntries, vouchers, financialYears),
    [coaAccounts, glEntries, vouchers, financialYears]
  );

  return (
    <CashBankContext.Provider
      value={{
        accounts,
        transactions,
        openingBalances,
        expenseCategories,
        serviceCategories,
        kpis,
        coaAccounts,
        vouchers,
        glEntries,
        openingBalanceBatches,
        financialYears,
        accountingSettings,
        accountingAuditLogs,
        accountingKPIs,
        receivableSubLedger,
        payableSubLedger,
        arControlBalance,
        apControlBalance,
        optimumControlBalance,
        recordOpeningBalance,
        addServiceIncome,
        addExpense,
        addCashToBankDeposit,
        addBankToCashWithdrawal,
        reverseTransaction,
        postSalesInvoiceCollection,
        syncPendingSalesOrders,
        addExpenseCategory,
        addServiceCategory,
        addNewBankAccount,
        updateAccountDetails,
        getAccountById,
        getAccountTransactions,
        isInvoiceAlreadyPosted,
        resetToDefaultSampleData,
        createCOAAccount,
        updateCOAAccount,
        toggleCOAAccountStatus,
        deleteCOAAccount,
        getCOAAccountBalance,
        postOpeningBalanceBatch,
        saveVoucher,
        submitVoucherForApproval,
        approveVoucher,
        postVoucher,
        reverseVoucher,
        recordReceivableCollection,
        recordSupplierPayment,
        createFinancialYear,
        setActiveFinancialYear,
        updatePeriodStatus,
        performYearEndClosing,
        updateAccountingSettings,
        syncERPEventsNow,
      }}
    >
      {children}
    </CashBankContext.Provider>
  );
};

export const useCashBank = (): CashBankContextType => {
  const context = useContext(CashBankContext);
  if (!context) {
    throw new Error('useCashBank must be used within a CashBankProvider');
  }
  return context;
};
