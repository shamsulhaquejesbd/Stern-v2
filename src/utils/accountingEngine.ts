/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Pure Double-Entry Accounting Engine
 * Validation, Voucher Posting, GL Entry Generation, Reversals,
 * Trial Balance, Balance Sheet, Profit & Loss, Cash Flow (Indirect Method),
 * and ERP-to-GL Transaction Mapping.
 */

import {
  COAAccount,
  COACategory,
  JournalVoucher,
  JournalVoucherLine,
  GeneralLedgerEntry,
  FinancialYear,
  TrialBalanceReport,
  TrialBalanceRow,
  ProfitLossReport,
  BalanceSheetReport,
  CashFlowStatementReport,
  FinancialStatementLine,
  AccountingDashboardKPIs,
  VoucherType,
} from '../types/accounting.ts';
import { COA_IDS } from '../mock/accountingDefaults.ts';

export const ROUND2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function formatBDT(amount: number, showSign = false): string {
  const num = ROUND2(amount || 0);
  const absFormatted = Math.abs(num).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (num < 0) return `-৳${absFormatted}`;
  if (showSign && num > 0) return `+৳${absFormatted}`;
  return `৳${absFormatted}`;
}

export function getNormalBalanceForCategory(category: COACategory, isContra = false): 'Debit' | 'Credit' {
  const natural = category === 'Asset' || category === 'Expense' ? 'Debit' : 'Credit';
  if (!isContra) return natural;
  return natural === 'Debit' ? 'Credit' : 'Debit';
}

export function resolveAccountLinkForCashBank(
  cashBankAccountId: string,
  coaAccounts: COAAccount[]
): COAAccount | undefined {
  return (
    coaAccounts.find((c) => c.linkedCashBankAccountId === cashBankAccountId) ||
    coaAccounts.find((c) => c.id === COA_IDS.MAIN_CASH)
  );
}

/**
 * Validates voucher lines against strict double-entry rules:
 * - At least 2 lines
 * - Every line must belong to an active, non-group (postable) COA account
 * - Each line has either Debit > 0 OR Credit > 0 (non-negative)
 * - Total Debit === Total Credit (tolerance 0.01)
 */
export function validateVoucherLines(
  lines: Partial<JournalVoucherLine>[],
  coaAccounts: COAAccount[]
): { valid: boolean; totalDebit: number; totalCredit: number; error?: string } {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { valid: false, totalDebit: 0, totalCredit: 0, error: 'A double-entry voucher must contain at least 2 accounting lines.' };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.accountId) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Line ${i + 1} is missing an account selection.` };
    }
    const acc = coaAccounts.find((a) => a.id === line.accountId);
    if (!acc) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Line ${i + 1} references an unknown Chart of Accounts head.` };
    }
    if (!acc.isActive) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Account "${acc.code} - ${acc.name}" is inactive and cannot receive postings.` };
    }
    if (acc.isGroup) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Group header "${acc.code} - ${acc.name}" cannot be posted directly; select a child ledger account.` };
    }

    const dr = ROUND2(Number(line.debit) || 0);
    const cr = ROUND2(Number(line.credit) || 0);
    if (dr < 0 || cr < 0) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Line ${i + 1} contains negative numbers.` };
    }
    if (dr === 0 && cr === 0) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Line ${i + 1} (${acc.name}) must have a non-zero Debit or Credit amount.` };
    }
    if (dr > 0 && cr > 0) {
      return { valid: false, totalDebit: 0, totalCredit: 0, error: `Line ${i + 1} (${acc.name}) cannot have both Debit and Credit simultaneously.` };
    }

    totalDebit = ROUND2(totalDebit + dr);
    totalCredit = ROUND2(totalCredit + cr);
  }

  if (totalDebit <= 0) {
    return { valid: false, totalDebit, totalCredit, error: 'Voucher total amount must be greater than zero.' };
  }

  const diff = Math.abs(ROUND2(totalDebit - totalCredit));
  if (diff > 0.01) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      error: `Unbalanced voucher: Total Debit (${formatBDT(totalDebit)}) does not equal Total Credit (${formatBDT(totalCredit)}). Difference: ${formatBDT(diff)}.`,
    };
  }

  return { valid: true, totalDebit, totalCredit };
}

/**
 * Checks if a transaction date is permitted by Financial Year & Accounting Period locking rules.
 */
export function validatePeriodForDate(
  dateStr: string,
  financialYears: FinancialYear[],
  enforcePeriodLocking = true
): { allowed: boolean; financialYearId?: string; periodId?: string; reason?: string } {
  const targetFY = financialYears.find((fy) => dateStr >= fy.startDate && dateStr <= fy.endDate);
  if (!targetFY) {
    if (!enforcePeriodLocking) {
      return { allowed: true };
    }
    // Find nearest open FY or allow if none configured, otherwise inform cleanly
    if (financialYears.length === 0) return { allowed: true };
    return {
      allowed: false,
      reason: `Date ${dateStr} does not fall inside any configured Financial Year. Please create or extend a Financial Year first.`,
    };
  }

  if (enforcePeriodLocking && targetFY.status === 'Closed') {
    return {
      allowed: false,
      financialYearId: targetFY.id,
      reason: `Financial Year "${targetFY.name}" is Closed. Posting to closed fiscal years is blocked.`,
    };
  }

  const period = targetFY.periods.find((p) => dateStr >= p.startDate && dateStr <= p.endDate);
  if (period && enforcePeriodLocking && (period.status === 'Closed' || period.status === 'Locked')) {
    return {
      allowed: false,
      financialYearId: targetFY.id,
      periodId: period.id,
      reason: `Accounting Period "${period.name}" is ${period.status}. Reopen the period or select an open date.`,
    };
  }

  return {
    allowed: true,
    financialYearId: targetFY.id,
    periodId: period?.id,
  };
}

/**
 * Prevents deletion of accounts that have child accounts or posted GL/voucher history.
 */
export function canDeleteCOAAccount(
  accountId: string,
  coaAccounts: COAAccount[],
  glEntries: GeneralLedgerEntry[],
  vouchers: JournalVoucher[]
): { canDelete: boolean; reason?: string } {
  const acc = coaAccounts.find((a) => a.id === accountId);
  if (!acc) return { canDelete: false, reason: 'Account not found.' };
  if (acc.isSystem) {
    return { canDelete: false, reason: 'System control accounts cannot be deleted. You may deactivate unused custom sub-accounts.' };
  }
  const hasChildren = coaAccounts.some((a) => a.parentId === accountId);
  if (hasChildren) {
    return { canDelete: false, reason: 'Account has child sub-accounts. Remove or reassign child accounts first.' };
  }
  const hasGL = glEntries.some((e) => e.accountId === accountId);
  if (hasGL) {
    return { canDelete: false, reason: 'Account already has posted General Ledger transactions. Deactivate the account instead of deleting.' };
  }
  const hasVoucherRef = vouchers.some((v) => v.lines.some((l) => l.accountId === accountId));
  if (hasVoucherRef) {
    return { canDelete: false, reason: 'Account is referenced by existing vouchers. Deactivate the account instead.' };
  }
  return { canDelete: true };
}

export function generateVoucherNumber(voucherType: VoucherType, existingVouchers: JournalVoucher[], dateStr?: string): string {
  const prefixMap: Record<VoucherType, string> = {
    'General Journal': 'JV',
    'Payment Voucher': 'PV',
    'Receipt Voucher': 'RV',
    'Contra Voucher': 'CV',
    'Adjustment Voucher': 'AV',
    'Opening Journal': 'OB',
    'Sales Journal': 'SJ',
    'Purchase Journal': 'PJ',
    'Inventory & Production Journal': 'IJ',
    'Payroll Journal': 'PR',
    'Year-End Closing Journal': 'YC',
  };
  const prefix = prefixMap[voucherType] || 'JV';
  const year = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const matching = existingVouchers.filter((v) => v.voucherNo.startsWith(`${prefix}-${year}-`));
  let maxSeq = 0;
  matching.forEach((v) => {
    const parts = v.voucherNo.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  });
  return `${prefix}-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
}

export function buildGLEntriesFromVoucher(
  voucher: JournalVoucher,
  coaAccounts: COAAccount[]
): GeneralLedgerEntry[] {
  return voucher.lines.map((line, idx) => {
    const acc = coaAccounts.find((a) => a.id === line.accountId);
    return {
      id: `gl-${voucher.id}-${line.lineNo || idx + 1}`,
      voucherId: voucher.id,
      voucherNo: voucher.voucherNo,
      voucherType: voucher.voucherType,
      entryDate: voucher.voucherDate,
      financialYearId: voucher.financialYearId,
      periodId: voucher.periodId,
      accountId: line.accountId,
      accountCode: line.accountCode || acc?.code || '',
      accountName: line.accountName || acc?.name || '',
      accountCategory: acc?.category || 'Asset',
      description: line.description || voucher.description,
      referenceNo: voucher.referenceNo || '',
      debit: ROUND2(line.debit),
      credit: ROUND2(line.credit),
      sourceModule: voucher.sourceModule,
      sourceId: voucher.sourceId,
      partyName: line.partyName || voucher.partyName,
      createdBy: voucher.postedBy || voucher.preparedBy,
      createdAt: voucher.postedAt || new Date().toISOString(),
    };
  });
}

export function createReversalVoucherObject(
  original: JournalVoucher,
  reason: string,
  performedBy: string,
  reversalDate: string,
  existingVouchers: JournalVoucher[],
  financialYears: FinancialYear[],
  coaAccounts?: COAAccount[]
): { voucher: JournalVoucher; glEntries: GeneralLedgerEntry[]; error?: string } {
  if (original.status !== 'Posted') {
    return { voucher: original, glEntries: [], error: 'Only Posted vouchers can be reversed.' };
  }
  if (original.reversedByVoucherId) {
    return { voucher: original, glEntries: [], error: 'This voucher has already been reversed.' };
  }
  const periodCheck = validatePeriodForDate(reversalDate, financialYears, true);
  if (!periodCheck.allowed) {
    return { voucher: original, glEntries: [], error: periodCheck.reason };
  }

  const revId = `vch-rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const prefix = original.voucherNo.startsWith('REV-') ? original.voucherNo : `REV-${original.voucherNo}`;
  const uniqueVoucherNo = existingVouchers.some((v) => v.voucherNo === prefix)
    ? `${prefix}-${existingVouchers.length + 1}`
    : prefix;

  const revLines: JournalVoucherLine[] = original.lines.map((l, idx) => ({
    ...l,
    id: `vl-${revId}-${idx + 1}`,
    voucherId: revId,
    debit: ROUND2(l.credit),
    credit: ROUND2(l.debit),
    description: `Reversal of ${original.voucherNo}: ${l.description || reason}`,
  }));

  const revVoucher: JournalVoucher = {
    id: revId,
    voucherNo: uniqueVoucherNo,
    voucherType: 'Adjustment Voucher',
    voucherDate: reversalDate,
    financialYearId: periodCheck.financialYearId,
    periodId: periodCheck.periodId,
    referenceNo: original.voucherNo,
    description: `REVERSAL of ${original.voucherNo} (${original.description}) — Reason: ${reason}`,
    lines: revLines,
    totalDebit: original.totalCredit,
    totalCredit: original.totalDebit,
    status: 'Posted',
    sourceModule: original.sourceModule,
    partyType: original.partyType,
    partyId: original.partyId,
    partyName: original.partyName,
    preparedBy: performedBy,
    preparedAt: new Date().toISOString(),
    approvedBy: performedBy,
    approvedAt: new Date().toISOString(),
    postedBy: performedBy,
    postedAt: new Date().toISOString(),
    reversalReason: reason,
    reversalOfVoucherId: original.id,
  };

  return {
    voucher: revVoucher,
    glEntries: coaAccounts ? buildGLEntriesFromVoucher(revVoucher, coaAccounts) : [],
  };
}

/**
 * Computes signed net balance of an account according to its normal balance:
 * - Debit-normal (Assets, Expenses unless Contra): Sum(Debit) - Sum(Credit)
 * - Credit-normal (Liabilities, Equity, Revenue, Contra Assets): Sum(Credit) - Sum(Debit)
 */
export function computeAccountNormalBalance(
  account: COAAccount,
  debitTotal: number,
  creditTotal: number
): number {
  const normal = account.normalBalance || getNormalBalanceForCategory(account.category, account.isContra);
  return normal === 'Debit'
    ? ROUND2(debitTotal - creditTotal)
    : ROUND2(creditTotal - debitTotal);
}

/**
 * Generates Trial Balance strictly from Posted General Ledger Entries.
 * Entries < fromDate (or Opening Journal on fromDate) go into Opening Balance;
 * All other entries within [fromDate, toDate] go into Period Transactions.
 */
export function buildTrialBalance(
  coaAccounts: COAAccount[],
  glEntries: GeneralLedgerEntry[],
  fromDate: string,
  toDate: string
): TrialBalanceReport {
  const postableAccounts = coaAccounts
    .filter((a) => !a.isGroup)
    .sort((a, b) => a.code.localeCompare(b.code));

  const rows: TrialBalanceRow[] = [];

  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  postableAccounts.forEach((acc) => {
    const accEntries = glEntries.filter((e) => e.accountId === acc.id && e.entryDate <= toDate);
    if (accEntries.length === 0) return;

    let openDrRaw = 0;
    let openCrRaw = 0;
    let periodDr = 0;
    let periodCr = 0;

    accEntries.forEach((e) => {
      const isOpening =
        e.entryDate < fromDate ||
        (e.entryDate === fromDate && e.voucherType === 'Opening Journal');
      if (isOpening) {
        openDrRaw = ROUND2(openDrRaw + e.debit);
        openCrRaw = ROUND2(openCrRaw + e.credit);
      } else if (e.entryDate >= fromDate && e.entryDate <= toDate) {
        periodDr = ROUND2(periodDr + e.debit);
        periodCr = ROUND2(periodCr + e.credit);
      }
    });

    // Net Opening on Dr or Cr side
    const openNet = ROUND2(openDrRaw - openCrRaw);
    const openingDebit = openNet > 0 ? openNet : 0;
    const openingCredit = openNet < 0 ? Math.abs(openNet) : 0;

    // Net Closing on Dr or Cr side
    const closeNet = ROUND2((openDrRaw + periodDr) - (openCrRaw + periodCr));
    const closingDebit = closeNet > 0 ? closeNet : 0;
    const closingCredit = closeNet < 0 ? Math.abs(closeNet) : 0;

    if (
      openingDebit === 0 &&
      openingCredit === 0 &&
      periodDr === 0 &&
      periodCr === 0 &&
      closingDebit === 0 &&
      closingCredit === 0
    ) {
      return;
    }

    totalOpeningDebit = ROUND2(totalOpeningDebit + openingDebit);
    totalOpeningCredit = ROUND2(totalOpeningCredit + openingCredit);
    totalPeriodDebit = ROUND2(totalPeriodDebit + periodDr);
    totalPeriodCredit = ROUND2(totalPeriodCredit + periodCr);
    totalClosingDebit = ROUND2(totalClosingDebit + closingDebit);
    totalClosingCredit = ROUND2(totalClosingCredit + closingCredit);

    rows.push({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      category: acc.category,
      classification: acc.classification,
      normalBalance: acc.normalBalance,
      openingDebit,
      openingCredit,
      periodDebit: periodDr,
      periodCredit: periodCr,
      closingDebit,
      closingCredit,
      closingNetBalance: computeAccountNormalBalance(acc, openDrRaw + periodDr, openCrRaw + periodCr),
    });
  });

  const diff = ROUND2(Math.abs(totalClosingDebit - totalClosingCredit));

  return {
    fromDate,
    toDate,
    rows,
    totalOpeningDebit,
    totalOpeningCredit,
    totalPeriodDebit,
    totalPeriodCredit,
    totalClosingDebit,
    totalClosingCredit,
    isBalanced: diff <= 0.01,
    difference: diff,
  };
}

/**
 * Builds Profit & Loss Statement strictly from Posted GL Entries within [fromDate, toDate].
 * Excludes Year-End Closing Journals so operational P&L figures remain visible even after year-end close.
 */
export function buildProfitLoss(
  coaAccounts: COAAccount[],
  glEntries: GeneralLedgerEntry[],
  fromDate: string,
  toDate: string
): ProfitLossReport {
  const periodEntries = glEntries.filter(
    (e) =>
      e.entryDate >= fromDate &&
      e.entryDate <= toDate &&
      e.voucherType !== 'Year-End Closing Journal' &&
      e.voucherType !== 'Opening Journal'
  );

  const revenueLines: FinancialStatementLine[] = [];
  const cogsLines: FinancialStatementLine[] = [];
  const factoryExpenseLines: FinancialStatementLine[] = [];
  const operatingExpenseLines: FinancialStatementLine[] = [];
  const depreciationLines: FinancialStatementLine[] = [];

  const postable = coaAccounts
    .filter((a) => !a.isGroup && (a.category === 'Revenue' || a.category === 'Expense'))
    .sort((a, b) => a.code.localeCompare(b.code));

  postable.forEach((acc) => {
    const entries = periodEntries.filter((e) => e.accountId === acc.id);
    if (entries.length === 0) return;

    const dr = entries.reduce((s, e) => s + e.debit, 0);
    const cr = entries.reduce((s, e) => s + e.credit, 0);
    const amount = computeAccountNormalBalance(acc, dr, cr);
    if (Math.abs(amount) < 0.01) return;

    const line: FinancialStatementLine = {
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      classification: acc.classification,
      amount,
    };

    if (acc.category === 'Revenue') {
      revenueLines.push(line);
    } else if (acc.classification === 'Cost of Goods Sold') {
      cogsLines.push(line);
    } else if (acc.classification === 'Factory Expense') {
      factoryExpenseLines.push(line);
    } else if (acc.classification === 'Depreciation & Amortization') {
      depreciationLines.push(line);
    } else {
      operatingExpenseLines.push(line);
    }
  });

  const totalRevenue = ROUND2(revenueLines.reduce((s, l) => s + l.amount, 0));
  const totalCOGS = ROUND2(cogsLines.reduce((s, l) => s + l.amount, 0));
  const grossProfit = ROUND2(totalRevenue - totalCOGS);
  const grossMarginPct = totalRevenue > 0 ? ROUND2((grossProfit / totalRevenue) * 100) : 0;

  const totalFactoryExpenses = ROUND2(factoryExpenseLines.reduce((s, l) => s + l.amount, 0));
  const totalOperatingExpenses = ROUND2(operatingExpenseLines.reduce((s, l) => s + l.amount, 0));
  const totalDepreciation = ROUND2(depreciationLines.reduce((s, l) => s + l.amount, 0));
  const totalExpenses = ROUND2(totalCOGS + totalFactoryExpenses + totalOperatingExpenses + totalDepreciation);

  const netProfitLoss = ROUND2(totalRevenue - totalExpenses);
  const netMarginPct = totalRevenue > 0 ? ROUND2((netProfitLoss / totalRevenue) * 100) : 0;

  return {
    fromDate,
    toDate,
    revenueLines,
    totalRevenue,
    cogsLines,
    totalCOGS,
    grossProfit,
    grossMarginPct,
    factoryExpenseLines,
    totalFactoryExpenses,
    operatingExpenseLines,
    totalOperatingExpenses,
    depreciationLines,
    totalDepreciation,
    totalExpenses,
    netProfitLoss,
    netMarginPct,
  };
}

/**
 * Builds Balance Sheet strictly from Posted GL Entries up to asOfDate.
 * Guarantees Assets = Liabilities + Equity by incorporating unclosed cumulative P&L
 * into Current Year Profit / Loss inside Equity.
 */
export function buildBalanceSheet(
  coaAccounts: COAAccount[],
  glEntries: GeneralLedgerEntry[],
  asOfDate: string,
  financialYears: FinancialYear[]
): BalanceSheetReport {
  const relevant = glEntries.filter((e) => e.entryDate <= asOfDate);

  const currentAssets: FinancialStatementLine[] = [];
  const nonCurrentAssets: FinancialStatementLine[] = [];
  const contraAssets: FinancialStatementLine[] = [];
  const currentLiabilities: FinancialStatementLine[] = [];
  const longTermLiabilities: FinancialStatementLine[] = [];
  const equityLines: FinancialStatementLine[] = [];

  let unclosedRevenueNet = 0;
  let unclosedExpenseNet = 0;

  const postable = coaAccounts.filter((a) => !a.isGroup).sort((a, b) => a.code.localeCompare(b.code));

  postable.forEach((acc) => {
    const entries = relevant.filter((e) => e.accountId === acc.id);
    if (entries.length === 0) return;

    const dr = entries.reduce((s, e) => s + e.debit, 0);
    const cr = entries.reduce((s, e) => s + e.credit, 0);
    const amount = computeAccountNormalBalance(acc, dr, cr);

    if (acc.category === 'Revenue') {
      unclosedRevenueNet = ROUND2(unclosedRevenueNet + amount);
      return;
    }
    if (acc.category === 'Expense') {
      unclosedExpenseNet = ROUND2(unclosedExpenseNet + amount);
      return;
    }

    if (Math.abs(amount) < 0.01) return;

    const line: FinancialStatementLine = {
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      classification: acc.classification,
      amount,
    };

    if (acc.category === 'Asset') {
      if (acc.isContra || acc.classification === 'Contra Asset') {
        contraAssets.push(line);
      } else if (acc.classification === 'Non-Current Asset') {
        nonCurrentAssets.push(line);
      } else {
        currentAssets.push(line);
      }
    } else if (acc.category === 'Liability') {
      if (acc.classification === 'Long-Term Liability') {
        longTermLiabilities.push(line);
      } else {
        currentLiabilities.push(line);
      }
    } else if (acc.category === 'Equity') {
      equityLines.push(line);
    }
  });

  // Note: Unclosed Revenue - Unclosed Expense automatically equals remaining P&L across all open years up to asOfDate,
  // because Year-End Closing Journals debit Revenue & credit Expense into Retained Earnings!
  const currentYearNetProfit = ROUND2(unclosedRevenueNet - unclosedExpenseNet);

  // Determine FY start just for reporting display
  const activeFY = financialYears.find((fy) => asOfDate >= fy.startDate && asOfDate <= fy.endDate);
  if (Math.abs(currentYearNetProfit) >= 0.01 || activeFY) {
    equityLines.push({
      accountId: COA_IDS.CURRENT_YEAR_PNL,
      accountCode: '3400',
      accountName: 'Current Year Net Profit / (Loss)',
      classification: 'Shareholders Equity',
      amount: currentYearNetProfit,
      isComputed: true,
    });
  }

  const totalCurrentAssets = ROUND2(currentAssets.reduce((s, l) => s + l.amount, 0));
  const totalNonCurrentAssetsGross = ROUND2(nonCurrentAssets.reduce((s, l) => s + l.amount, 0));
  const totalAccumulatedDepreciation = ROUND2(contraAssets.reduce((s, l) => s + l.amount, 0));
  const totalNonCurrentAssetsNet = ROUND2(totalNonCurrentAssetsGross - totalAccumulatedDepreciation);
  const totalAssets = ROUND2(totalCurrentAssets + totalNonCurrentAssetsNet);

  const totalCurrentLiabilities = ROUND2(currentLiabilities.reduce((s, l) => s + l.amount, 0));
  const totalLongTermLiabilities = ROUND2(longTermLiabilities.reduce((s, l) => s + l.amount, 0));
  const totalLiabilities = ROUND2(totalCurrentLiabilities + totalLongTermLiabilities);

  const totalEquity = ROUND2(equityLines.reduce((s, l) => s + l.amount, 0));
  const totalLiabilitiesAndEquity = ROUND2(totalLiabilities + totalEquity);
  const difference = ROUND2(Math.abs(totalAssets - totalLiabilitiesAndEquity));

  return {
    asOfDate,
    currentAssets,
    totalCurrentAssets,
    nonCurrentAssets,
    totalNonCurrentAssetsGross,
    contraAssets,
    totalAccumulatedDepreciation,
    totalNonCurrentAssetsNet,
    totalAssets,
    currentLiabilities,
    totalCurrentLiabilities,
    longTermLiabilities,
    totalLongTermLiabilities,
    totalLiabilities,
    equityLines,
    currentYearNetProfit,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: difference <= 0.01,
    difference,
  };
}

/**
 * Cash Flow Statement (Indirect Method) strictly derived from Posted GL Entries.
 * Reconciles Opening Cash & Bank -> Closing Cash & Bank accurately to the paisa.
 */
export function buildCashFlowStatement(
  coaAccounts: COAAccount[],
  glEntries: GeneralLedgerEntry[],
  fromDate: string,
  toDate: string
): CashFlowStatementReport {
  const isCashOrBank = (acc: COAAccount) =>
    acc.category === 'Asset' &&
    (acc.parentId === COA_IDS.CASH_IN_HAND_GROUP ||
      acc.parentId === COA_IDS.CASH_AT_BANK_GROUP ||
      Boolean(acc.linkedCashBankAccountId));

  const cashBankAccountIds = new Set(coaAccounts.filter(isCashOrBank).map((a) => a.id));

  // Entries strictly constituting Opening Cash at start of [fromDate..toDate]
  const isOpeningForRange = (e: GeneralLedgerEntry) =>
    e.entryDate < fromDate || (e.entryDate === fromDate && e.voucherType === 'Opening Journal');

  const isPeriodOperational = (e: GeneralLedgerEntry) =>
    e.entryDate >= fromDate &&
    e.entryDate <= toDate &&
    e.voucherType !== 'Opening Journal' &&
    e.voucherType !== 'Year-End Closing Journal';

  // Compute Opening Cash & Bank balance
  const openingCashAndBank = ROUND2(
    glEntries
      .filter((e) => cashBankAccountIds.has(e.accountId) && isOpeningForRange(e))
      .reduce((s, e) => s + (e.debit - e.credit), 0)
  );

  // Compute actual Closing Cash & Bank balance from GL up to toDate
  const closingCashAndBankLedger = ROUND2(
    glEntries
      .filter((e) => cashBankAccountIds.has(e.accountId) && e.entryDate <= toDate)
      .reduce((s, e) => s + (e.debit - e.credit), 0)
  );

  // 1. Net Profit for [fromDate..toDate]
  const pl = buildProfitLoss(coaAccounts, glEntries, fromDate, toDate);
  const netProfit = pl.netProfitLoss;

  // Helper: Net movement during [fromDate..toDate] (excluding Opening & Year-End Closing) for an account
  const periodDelta = (acc: COAAccount): number => {
    const ents = glEntries.filter((e) => e.accountId === acc.id && isPeriodOperational(e));
    const dr = ents.reduce((s, e) => s + e.debit, 0);
    const cr = ents.reduce((s, e) => s + e.credit, 0);
    return computeAccountNormalBalance(acc, dr, cr);
  };

  // Helper: Opening Journal entries posted *within* (fromDate, toDate] after fromDate also affect Asset/Liab/Eq cash or non-cash;
  // capture any direct Cash opening injected mid-range if applicable so reconciliation stays exact.
  const midPeriodCashOpening = ROUND2(
    glEntries
      .filter(
        (e) =>
          cashBankAccountIds.has(e.accountId) &&
          e.entryDate > fromDate &&
          e.entryDate <= toDate &&
          e.voucherType === 'Opening Journal'
      )
      .reduce((s, e) => s + (e.debit - e.credit), 0)
  );

  const nonCashBalanceAccounts = coaAccounts.filter(
    (a) =>
      !a.isGroup &&
      !cashBankAccountIds.has(a.id) &&
      (a.category === 'Asset' || a.category === 'Liability' || a.category === 'Equity')
  );

  // 2. Non-cash Adjustments (Depreciation)
  const accumDepDelta = ROUND2(
    nonCashBalanceAccounts
      .filter((a) => a.isContra || a.classification === 'Contra Asset')
      .reduce((s, a) => s + periodDelta(a), 0)
  );

  const operatingAdjustments: { label: string; amount: number }[] = [];
  if (Math.abs(accumDepDelta) >= 0.01) {
    operatingAdjustments.push({ label: 'Depreciation & Non-Cash Charges', amount: accumDepDelta });
  }

  // 3. Working Capital Changes (Current Assets excl. Cash/Bank & Current Liabilities)
  const workingCapitalChanges: { label: string; amount: number }[] = [];
  let receivablesDelta = 0;
  let inventoryDelta = 0;
  let otherCurrentAssetDelta = 0;
  let payableDelta = 0;
  let optimumPayableDelta = 0;
  let otherCurrentLiabDelta = 0;

  nonCashBalanceAccounts.forEach((acc) => {
    const d = periodDelta(acc);
    if (Math.abs(d) < 0.01) return;

    if (acc.category === 'Asset' && acc.classification === 'Current Asset') {
      if (acc.id === COA_IDS.ACCOUNTS_RECEIVABLE || acc.id === COA_IDS.INSTALLMENT_RECEIVABLE) {
        receivablesDelta = ROUND2(receivablesDelta + d);
      } else if (
        acc.id === COA_IDS.RM_INVENTORY ||
        acc.id === COA_IDS.WIP_INVENTORY ||
        acc.id === COA_IDS.FG_INVENTORY
      ) {
        inventoryDelta = ROUND2(inventoryDelta + d);
      } else {
        otherCurrentAssetDelta = ROUND2(otherCurrentAssetDelta + d);
      }
    } else if (acc.category === 'Liability' && acc.classification === 'Current Liability') {
      if (acc.id === COA_IDS.SHORT_TERM_LOANS) {
        // Short-term financing treated in Financing below
        return;
      }
      if (acc.id === COA_IDS.ACCOUNTS_PAYABLE || acc.id === COA_IDS.SUPPLIER_PAYABLES) {
        payableDelta = ROUND2(payableDelta + d);
      } else if (acc.id === COA_IDS.OPTIMUM_JV_PAYABLE) {
        optimumPayableDelta = ROUND2(optimumPayableDelta + d);
      } else {
        otherCurrentLiabDelta = ROUND2(otherCurrentLiabDelta + d);
      }
    }
  });

  if (Math.abs(receivablesDelta) >= 0.01) {
    workingCapitalChanges.push({
      label: '(Increase) / Decrease in Accounts & Installment Receivables',
      amount: ROUND2(-receivablesDelta),
    });
  }
  if (Math.abs(inventoryDelta) >= 0.01) {
    workingCapitalChanges.push({
      label: '(Increase) / Decrease in Inventories (RM / WIP / FG)',
      amount: ROUND2(-inventoryDelta),
    });
  }
  if (Math.abs(otherCurrentAssetDelta) >= 0.01) {
    workingCapitalChanges.push({
      label: '(Increase) / Decrease in Advances & Other Current Assets',
      amount: ROUND2(-otherCurrentAssetDelta),
    });
  }
  if (Math.abs(payableDelta) >= 0.01) {
    workingCapitalChanges.push({
      label: 'Increase / (Decrease) in Trade & Supplier Payables',
      amount: payableDelta,
    });
  }
  if (Math.abs(optimumPayableDelta) >= 0.01) {
    workingCapitalChanges.push({
      label: 'Increase / (Decrease) in Optimum JV Clearing Payable',
      amount: optimumPayableDelta,
    });
  }
  if (Math.abs(otherCurrentLiabDelta) >= 0.01) {
    workingCapitalChanges.push({
      label: 'Increase / (Decrease) in Salary, VAT & Accrued Liabilities',
      amount: otherCurrentLiabDelta,
    });
  }

  const netCashFromOperating = ROUND2(
    netProfit +
      operatingAdjustments.reduce((s, x) => s + x.amount, 0) +
      workingCapitalChanges.reduce((s, x) => s + x.amount, 0)
  );

  // 4. Investing Activities (Non-Current Assets)
  const investingActivities: { label: string; amount: number }[] = [];
  nonCashBalanceAccounts
    .filter((a) => a.category === 'Asset' && a.classification === 'Non-Current Asset')
    .forEach((acc) => {
      const d = periodDelta(acc);
      if (Math.abs(d) >= 0.01) {
        investingActivities.push({
          label: `Purchase / (Disposal) of ${acc.name}`,
          amount: ROUND2(-d),
        });
      }
    });
  const netCashFromInvesting = ROUND2(investingActivities.reduce((s, x) => s + x.amount, 0));

  // 5. Financing Activities (Short-Term Loans, Long-Term Loans, Equity Capital)
  const financingActivities: { label: string; amount: number }[] = [];
  nonCashBalanceAccounts
    .filter(
      (a) =>
        a.id === COA_IDS.SHORT_TERM_LOANS ||
        a.classification === 'Long-Term Liability' ||
        a.category === 'Equity'
    )
    .forEach((acc) => {
      const d = periodDelta(acc);
      if (Math.abs(d) >= 0.01) {
        financingActivities.push({
          label: `${acc.name} Proceeds / (Repayment)`,
          amount: d,
        });
      }
    });

  if (Math.abs(midPeriodCashOpening) >= 0.01) {
    financingActivities.push({
      label: 'Mid-Period Opening Balance Injection',
      amount: midPeriodCashOpening,
    });
  }

  const netCashFromFinancing = ROUND2(financingActivities.reduce((s, x) => s + x.amount, 0));
  const netChangeInCash = ROUND2(netCashFromOperating + netCashFromInvesting + netCashFromFinancing);
  const closingCashAndBankComputed = ROUND2(openingCashAndBank + netChangeInCash);
  const difference = ROUND2(Math.abs(closingCashAndBankComputed - closingCashAndBankLedger));

  return {
    fromDate,
    toDate,
    netProfit,
    operatingAdjustments,
    workingCapitalChanges,
    netCashFromOperating,
    investingActivities,
    netCashFromInvesting,
    financingActivities,
    netCashFromFinancing,
    netChangeInCash,
    openingCashAndBank,
    closingCashAndBankComputed,
    closingCashAndBankLedger,
    isReconciled: difference <= 0.01,
    difference,
  };
}

/**
 * Computes comprehensive Accounting Dashboard KPIs strictly from Posted GL + Vouchers.
 */
export function computeAccountingDashboardKPIs(
  coaAccounts: COAAccount[],
  glEntries: GeneralLedgerEntry[],
  vouchers: JournalVoucher[],
  financialYears: FinancialYear[],
  referenceDate = new Date().toISOString().slice(0, 10)
): AccountingDashboardKPIs {
  const bs = buildBalanceSheet(coaAccounts, glEntries, referenceDate, financialYears);
  const monthStart = `${referenceDate.slice(0, 7)}-01`;
  const monthPL = buildProfitLoss(coaAccounts, glEntries, monthStart, referenceDate);

  const activeFY = financialYears.find((f) => f.isActive) || financialYears[0];
  const ytdStart = activeFY ? activeFY.startDate : `${referenceDate.slice(0, 4)}-01-01`;
  const ytdPL = buildProfitLoss(coaAccounts, glEntries, ytdStart, referenceDate);

  const sumAccounts = (ids: Set<string>): number =>
    ROUND2(
      glEntries
        .filter((e) => ids.has(e.accountId) && e.entryDate <= referenceDate)
        .reduce((s, e) => {
          const acc = coaAccounts.find((a) => a.id === e.accountId);
          return s + (acc ? computeAccountNormalBalance(acc, e.debit, e.credit) : e.debit - e.credit);
        }, 0)
    );

  const cashIds = new Set(
    coaAccounts.filter((a) => !a.isGroup && a.parentId === COA_IDS.CASH_IN_HAND_GROUP).map((a) => a.id)
  );
  const bankIds = new Set(
    coaAccounts.filter((a) => !a.isGroup && a.parentId === COA_IDS.CASH_AT_BANK_GROUP).map((a) => a.id)
  );

  return {
    totalAssets: bs.totalAssets,
    totalLiabilities: bs.totalLiabilities,
    totalEquity: bs.totalEquity,
    cashInHand: sumAccounts(cashIds),
    cashAtBank: sumAccounts(bankIds),
    accountsReceivable: sumAccounts(new Set([COA_IDS.ACCOUNTS_RECEIVABLE, COA_IDS.INSTALLMENT_RECEIVABLE])),
    accountsPayable: sumAccounts(new Set([COA_IDS.ACCOUNTS_PAYABLE, COA_IDS.SUPPLIER_PAYABLES])),
    optimumJVPayable: sumAccounts(new Set([COA_IDS.OPTIMUM_JV_PAYABLE])),
    rmInventoryValue: sumAccounts(new Set([COA_IDS.RM_INVENTORY])),
    wipInventoryValue: sumAccounts(new Set([COA_IDS.WIP_INVENTORY])),
    fgInventoryValue: sumAccounts(new Set([COA_IDS.FG_INVENTORY])),
    monthlyRevenue: monthPL.totalRevenue,
    monthlyExpenses: monthPL.totalExpenses,
    monthlyNetProfit: monthPL.netProfitLoss,
    ytdRevenue: ytdPL.totalRevenue,
    ytdExpenses: ytdPL.totalExpenses,
    ytdNetProfit: ytdPL.netProfitLoss,
    postedVouchersCount: vouchers.filter((v) => v.status === 'Posted').length,
    pendingVouchersCount: vouchers.filter((v) => v.status === 'Draft' || v.status === 'Pending Approval' || v.status === 'Approved').length,
  };
}
