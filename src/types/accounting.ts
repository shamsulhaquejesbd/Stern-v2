/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Double-Entry Accounting & Financial Statements Data Models
 * Supports hierarchical Chart of Accounts, Journal Vouchers, General Ledger,
 * Opening Balances, Sub-Ledgers (AR/AP), Financial Years & Periods,
 * and Statutory Financial Statements (Trial Balance, Balance Sheet, P&L, Cash Flow).
 */

export type COACategory = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export type StatementClassification =
  | 'Current Asset'
  | 'Non-Current Asset'
  | 'Contra Asset'
  | 'Current Liability'
  | 'Long-Term Liability'
  | 'Shareholders Equity'
  | 'Operating Revenue'
  | 'Non-Operating Income'
  | 'Cost of Goods Sold'
  | 'Factory Expense'
  | 'Operating Expense'
  | 'Depreciation & Amortization';

export type NormalBalance = 'Debit' | 'Credit';

export interface COAAccount {
  id: string;
  code: string;
  name: string;
  category: COACategory;
  classification: StatementClassification;
  parentId: string | null;
  level: number;
  isGroup: boolean;
  isSystem: boolean;
  isContra?: boolean;
  normalBalance: NormalBalance;
  isActive: boolean;
  linkedCashBankAccountId?: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type VoucherType =
  | 'General Journal'
  | 'Payment Voucher'
  | 'Receipt Voucher'
  | 'Contra Voucher'
  | 'Adjustment Voucher'
  | 'Opening Journal'
  | 'Sales Journal'
  | 'Purchase Journal'
  | 'Inventory & Production Journal'
  | 'Payroll Journal'
  | 'Year-End Closing Journal';

export type VoucherStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Posted' | 'Reversed';

export type AccountingSourceModule =
  | 'Manual'
  | 'Opening Balance'
  | 'CashBank'
  | 'Sales Order'
  | 'Installment Payment'
  | 'Customer Payment'
  | 'Raw Material Receipt'
  | 'Material Issue'
  | 'Production Cost Allocation'
  | 'Finished Goods Receipt'
  | 'Operational Expense'
  | 'Payroll Salary'
  | 'TADA'
  | 'Warranty Service'
  | 'Optimum JV'
  | 'Year-End Closing';

export interface JournalVoucherLine {
  id: string;
  voucherId: string;
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  description?: string;
  debit: number;
  credit: number;
  partyType?: 'Customer' | 'Distributor' | 'Supplier' | 'Employee' | 'Optimum JV' | 'Other';
  partyId?: string;
  partyName?: string;
  costCenter?: string;
}

export interface JournalVoucher {
  id: string;
  voucherNo: string;
  voucherType: VoucherType;
  voucherDate: string; // YYYY-MM-DD
  financialYearId?: string;
  periodId?: string;
  referenceNo: string;
  description: string;
  lines: JournalVoucherLine[];
  totalDebit: number;
  totalCredit: number;
  status: VoucherStatus;
  sourceModule?: AccountingSourceModule;
  sourceId?: string;
  partyType?: 'Customer' | 'Distributor' | 'Supplier' | 'Employee' | 'Optimum JV' | 'Other';
  partyId?: string;
  partyName?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  preparedBy: string;
  preparedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
  reversedBy?: string;
  reversedAt?: string;
  reversalReason?: string;
  reversalOfVoucherId?: string;
  reversedByVoucherId?: string;
}

export interface GeneralLedgerEntry {
  id: string;
  voucherId: string;
  voucherNo: string;
  voucherType: VoucherType;
  entryDate: string; // YYYY-MM-DD
  financialYearId?: string;
  periodId?: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountCategory: COACategory;
  description: string;
  referenceNo: string;
  debit: number;
  credit: number;
  sourceModule?: AccountingSourceModule;
  sourceId?: string;
  partyName?: string;
  createdBy: string;
  createdAt: string;
}

export interface OpeningBalanceLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  category: COACategory;
  openingDebit: number;
  openingCredit: number;
  partyName?: string;
  description?: string;
}

export interface OpeningBalanceBatch {
  id: string;
  financialYearId: string;
  effectiveDate: string;
  referenceNo: string;
  description: string;
  voucherId: string;
  voucherNo: string;
  totalDebit: number;
  totalCredit: number;
  lines: OpeningBalanceLine[];
  postedBy: string;
  postedAt: string;
}

export type AccountingPeriodStatus = 'Open' | 'Closed' | 'Locked';

export interface AccountingPeriod {
  id: string;
  financialYearId: string;
  name: string; // e.g., "Jan 2026"
  periodNumber: number; // 1..12
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: AccountingPeriodStatus;
  closedBy?: string;
  closedAt?: string;
}

export interface FinancialYear {
  id: string;
  name: string; // e.g., "FY 2026"
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: 'Open' | 'Closed';
  periods: AccountingPeriod[];
  closedAt?: string;
  closedBy?: string;
  closingVoucherId?: string;
  retainedEarningsTransferredBDT?: number;
}

export interface AccountingSettings {
  companyLegalName: string;
  baseCurrency: string;
  allowNegativeCashBank: boolean;
  autoSyncERPEvents: boolean;
  requireVoucherApproval: boolean;
  enforcePeriodLocking: boolean;
  defaultVatRate: number;
  updatedBy?: string;
  updatedAt?: string;
}

export interface AccountingAuditLog {
  id: string;
  action: string;
  entityType: 'COA' | 'Voucher' | 'OpeningBalance' | 'FinancialYear' | 'Period' | 'Settings' | 'ERPSync';
  entityId: string;
  voucherNo?: string;
  details: string;
  performedBy: string;
  performedAt: string;
}

// Sub-Ledger View Models
export interface ReceivableInvoiceItem {
  orderId: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
}

export interface ReceivableSubLedgerRow {
  partyId: string;
  partyName: string;
  partyType: 'Customer' | 'Distributor';
  phone?: string;
  zone?: string;
  totalInvoiced: number;
  totalReceived: number;
  outstandingBalance: number;
  overdueAmount: number;
  invoiceCount: number;
  invoices: ReceivableInvoiceItem[];
  paymentHistory: {
    id: string;
    date: string;
    voucherNo: string;
    referenceNo: string;
    amount: number;
    method: string;
  }[];
}

export interface PayableGRNItem {
  grnId: string;
  grnNumber: string;
  purchaseDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'Paid' | 'Partial' | 'Unpaid';
}

export interface PayableSubLedgerRow {
  supplierKey: string;
  supplierName: string;
  partyType: 'Supplier' | 'Optimum JV';
  totalPurchased: number;
  totalPaid: number;
  outstandingBalance: number;
  billCount: number;
  bills: PayableGRNItem[];
  paymentHistory: {
    id: string;
    date: string;
    voucherNo: string;
    referenceNo: string;
    amount: number;
    method: string;
  }[];
}

// Financial Statement Report Models
export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  category: COACategory;
  classification: StatementClassification;
  normalBalance: NormalBalance;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  closingNetBalance: number;
}

export interface TrialBalanceReport {
  fromDate: string;
  toDate: string;
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
  difference: number;
}

export interface FinancialStatementLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  classification: StatementClassification;
  amount: number;
  isComputed?: boolean;
}

export interface ProfitLossReport {
  fromDate: string;
  toDate: string;
  revenueLines: FinancialStatementLine[];
  totalRevenue: number;
  cogsLines: FinancialStatementLine[];
  totalCOGS: number;
  grossProfit: number;
  grossMarginPct: number;
  factoryExpenseLines: FinancialStatementLine[];
  totalFactoryExpenses: number;
  operatingExpenseLines: FinancialStatementLine[];
  totalOperatingExpenses: number;
  depreciationLines: FinancialStatementLine[];
  totalDepreciation: number;
  totalExpenses: number;
  netProfitLoss: number;
  netMarginPct: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  currentAssets: FinancialStatementLine[];
  totalCurrentAssets: number;
  nonCurrentAssets: FinancialStatementLine[];
  totalNonCurrentAssetsGross: number;
  contraAssets: FinancialStatementLine[];
  totalAccumulatedDepreciation: number;
  totalNonCurrentAssetsNet: number;
  totalAssets: number;
  currentLiabilities: FinancialStatementLine[];
  totalCurrentLiabilities: number;
  longTermLiabilities: FinancialStatementLine[];
  totalLongTermLiabilities: number;
  totalLiabilities: number;
  equityLines: FinancialStatementLine[];
  currentYearNetProfit: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference: number;
}

export interface CashFlowStatementReport {
  fromDate: string;
  toDate: string;
  netProfit: number;
  operatingAdjustments: { label: string; amount: number }[];
  workingCapitalChanges: { label: string; amount: number }[];
  netCashFromOperating: number;
  investingActivities: { label: string; amount: number }[];
  netCashFromInvesting: number;
  financingActivities: { label: string; amount: number }[];
  netCashFromFinancing: number;
  netChangeInCash: number;
  openingCashAndBank: number;
  closingCashAndBankComputed: number;
  closingCashAndBankLedger: number;
  isReconciled: boolean;
  difference: number;
}

export interface AccountingDashboardKPIs {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cashInHand: number;
  cashAtBank: number;
  accountsReceivable: number;
  accountsPayable: number;
  optimumJVPayable: number;
  rmInventoryValue: number;
  wipInventoryValue: number;
  fgInventoryValue: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  monthlyNetProfit: number;
  ytdRevenue: number;
  ytdExpenses: number;
  ytdNetProfit: number;
  postedVouchersCount: number;
  pendingVouchersCount: number;
}
