/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Idempotent ERP-to-General Ledger Auto-Sync Mapper
 * Converts Inventory, Production, Cost Allocation, Sales, Collections,
 * Installments, Payroll, TA/DA, Warranty Service, Cash/Bank Book, and
 * Optimum JV events into strictly balanced Double-Entry Journal Vouchers.
 *
 * Guarantees zero duplicate postings via (sourceModule, sourceId) keys.
 */

import {
  COAAccount,
  JournalVoucher,
  JournalVoucherLine,
  AccountingSourceModule,
  VoucherType,
  FinancialYear,
} from '../types/accounting.ts';
import { CashBankAccount, CashBankTransaction } from '../types/cashBank.ts';
import {
  RawMaterialReceipt,
  MaterialIssue,
  FinishedGoodsProductionReceipt,
  SalesOrder,
  Payment,
  TADAEntry,
  OptimumStatementEntry,
  Product,
} from '../types/erp.ts';
import { ExpenseEntry, CostAllocationRecord } from '../types/costing.ts';
import { InstallmentPayment } from '../types/installment.ts';
import { SalaryPaymentRecord } from '../types/payroll.ts';
import { ServicePayment } from '../types/warranty.ts';
import { COA_IDS } from '../mock/accountingDefaults.ts';
import { ROUND2, resolveAccountLinkForCashBank } from './accountingEngine.ts';

export interface ERPSyncInput {
  coaAccounts: COAAccount[];
  cashBankAccounts: CashBankAccount[];
  existingVouchers: JournalVoucher[];
  financialYears: FinancialYear[];
  enforcePeriodLocking: boolean;
  // ERP state datasets
  cashBankTransactions: CashBankTransaction[];
  rawMaterialReceipts: RawMaterialReceipt[];
  materialIssues: MaterialIssue[];
  expenseEntries: ExpenseEntry[];
  costAllocations: CostAllocationRecord[];
  finishedGoodsProductionReceipts: FinishedGoodsProductionReceipt[];
  salesOrders: SalesOrder[];
  products: Product[];
  payments: Payment[];
  installmentPayments: InstallmentPayment[];
  salaryPaymentRecords: SalaryPaymentRecord[];
  tadaList: TADAEntry[];
  servicePayments: ServicePayment[];
  optimumStatement: OptimumStatementEntry[];
}

export interface ERPSyncResult {
  newVouchers: JournalVoucher[];
  skippedLockedCount: number;
  summaryByModule: Record<string, number>;
}

const cleanDate = (d?: string): string => {
  if (!d) return new Date().toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

function findExpenseCOAId(categoryOrSub: string = '', isFactory = false): string {
  const s = categoryOrSub.toLowerCase();
  if (s.includes('cogs') || s.includes('cost of goods')) return COA_IDS.COGS;
  if (s.includes('overtime')) return COA_IDS.OVERTIME_EXPENSE;
  if (s.includes('labour') || s.includes('labor') || s.includes('assembly') || s.includes('conversion')) return COA_IDS.ASSEMBLY_LABOR_COST;
  if (s.includes('factory rent')) return COA_IDS.FACTORY_RENT;
  if (s.includes('electricity') || s.includes('utility') || s.includes('utilities') || s.includes('generator')) return COA_IDS.FACTORY_ELECTRICITY;
  if (isFactory || s.includes('factory') || s.includes('maintenance') || s.includes('packaging') || s.includes('quality')) return COA_IDS.FACTORY_OVERHEAD;
  if (s.includes('salary') || s.includes('payroll') || s.includes('staff')) return COA_IDS.SALARY_EXPENSES;
  if (s.includes('rent')) return COA_IDS.RENT_EXPENSES;
  if (s.includes('tada') || s.includes('ta/da') || s.includes('travel') || s.includes('conveyance')) return COA_IDS.TADA_EXPENSES;
  if (s.includes('transport') || s.includes('freight') || s.includes('delivery')) return COA_IDS.TRANSPORTATION_EXPENSES;
  if (s.includes('market') || s.includes('promo') || s.includes('ad')) return COA_IDS.MARKETING_EXPENSES;
  if (s.includes('bank charge') || s.includes('commission')) return COA_IDS.BANK_CHARGES;
  if (s.includes('depreciation')) return COA_IDS.DEPRECIATION_EXPENSES;
  if (s.includes('office') || s.includes('admin') || s.includes('warehouse')) return COA_IDS.OFFICE_EXPENSES;
  return COA_IDS.OTHER_EXPENSES;
}

function findRevenueCOAId(categoryOrDesc: string = ''): string {
  const s = categoryOrDesc.toLowerCase();
  if (s.includes('repair') || s.includes('battery repair') || s.includes('warranty')) return COA_IDS.BATTERY_REPAIR_INCOME;
  if (s.includes('interest') || s.includes('finance') || s.includes('non-operating')) return COA_IDS.NON_OPERATING_INCOME;
  if (s.includes('service') || s.includes('install') || s.includes('testing') || s.includes('consult')) return COA_IDS.SERVICE_INCOME;
  if (s.includes('sales') || s.includes('finished')) return COA_IDS.FINISHED_GOODS_SALES;
  return COA_IDS.OTHER_OPERATING_INCOME;
}

function resolvePaymentAssetCOAId(
  method: string | undefined,
  bankAccountId: string | undefined,
  cashBankAccounts: CashBankAccount[],
  coaAccounts: COAAccount[]
): string {
  if (bankAccountId) {
    const matched = coaAccounts.find(
      (c) => c.linkedCashBankAccountId === bankAccountId || c.id === bankAccountId
    );
    if (matched) return matched.id;
  }
  const m = (method || '').toLowerCase();
  if (m.includes('cash') && !m.includes('bank')) {
    return COA_IDS.MAIN_CASH;
  }
  if (m.includes('city')) return COA_IDS.BANK_CITY;
  if (m.includes('islami')) return COA_IDS.BANK_ISLAMI;
  if (m.includes('dbbl') || m.includes('dutch')) return COA_IDS.BANK_DBBL;
  if (m.includes('bank') || m.includes('cheque') || m.includes('transfer') || m.includes('mfs') || m.includes('bkash') || m.includes('nagad')) {
    const firstBank = cashBankAccounts.find((a) => a.type === 'Bank');
    if (firstBank) {
      return resolveAccountLinkForCashBank(firstBank.id, coaAccounts)?.id || COA_IDS.BANK_DBBL;
    }
    return COA_IDS.BANK_DBBL;
  }
  return COA_IDS.MAIN_CASH;
}

export function syncAllERPEventsToAccounting(input: ERPSyncInput): ERPSyncResult {
  const {
    coaAccounts,
    cashBankAccounts,
    existingVouchers,
    financialYears,
    enforcePeriodLocking,
  } = input;

  const coaById = new Map(coaAccounts.map((a) => [a.id, a]));
  const alreadySyncedKeys = new Set<string>();
  const existingVoucherNos = new Set<string>();

  existingVouchers.forEach((v) => {
    existingVoucherNos.add(v.voucherNo);
    if (v.status !== 'Reversed' && v.sourceModule && v.sourceId) {
      alreadySyncedKeys.add(`${v.sourceModule}::${v.sourceId}`);
    }
  });

  const newVouchers: JournalVoucher[] = [];
  let skippedLockedCount = 0;
  const summaryByModule: Record<string, number> = {};
  let seqCounter = existingVouchers.length + 1;

  const isDateUnlocked = (dateStr: string): { ok: boolean; fyId?: string; periodId?: string } => {
    const fy = financialYears.find((f) => dateStr >= f.startDate && dateStr <= f.endDate);
    if (!fy) return { ok: !enforcePeriodLocking || financialYears.length === 0 };
    if (enforcePeriodLocking && fy.status === 'Closed') return { ok: false };
    const p = fy.periods.find((per) => dateStr >= per.startDate && dateStr <= per.endDate);
    if (p && enforcePeriodLocking && (p.status === 'Closed' || p.status === 'Locked')) {
      return { ok: false };
    }
    return { ok: true, fyId: fy.id, periodId: p?.id };
  };

  const buildVoucher = (params: {
    sourceModule: AccountingSourceModule;
    sourceId: string;
    voucherType: VoucherType;
    voucherNoHint?: string;
    date: string;
    referenceNo: string;
    description: string;
    partyType?: JournalVoucher['partyType'];
    partyId?: string;
    partyName?: string;
    createdBy?: string;
    lines: Array<{ accountId: string; debit: number; credit: number; description?: string; partyName?: string; costCenter?: string }>;
  }) => {
    const key = `${params.sourceModule}::${params.sourceId}`;
    if (alreadySyncedKeys.has(key)) return;

    const dateStr = cleanDate(params.date);
    const lock = isDateUnlocked(dateStr);
    if (!lock.ok) {
      skippedLockedCount += 1;
      return;
    }

    const validLines: JournalVoucherLine[] = [];
    const voucherId = `vch-auto-${params.sourceModule.replace(/\s+/g, '-').toLowerCase()}-${params.sourceId}-${Date.now().toString().slice(-4)}`;
    let totalDr = 0;
    let totalCr = 0;

    params.lines.forEach((l, i) => {
      const dr = ROUND2(l.debit);
      const cr = ROUND2(l.credit);
      if (dr <= 0 && cr <= 0) return;
      const acc = coaById.get(l.accountId) || coaById.get(COA_IDS.OTHER_EXPENSES);
      if (!acc || acc.isGroup) return;
      totalDr = ROUND2(totalDr + dr);
      totalCr = ROUND2(totalCr + cr);
      validLines.push({
        id: `vl-${voucherId}-${i + 1}`,
        voucherId,
        lineNo: i + 1,
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        description: l.description || params.description,
        debit: dr,
        credit: cr,
        partyType: params.partyType,
        partyId: params.partyId,
        partyName: l.partyName || params.partyName,
        costCenter: l.costCenter,
      });
    });

    if (validLines.length < 2 || totalDr <= 0 || Math.abs(totalDr - totalCr) > 0.01) {
      return;
    }

    let voucherNo = params.voucherNoHint || `JV-AUTO-${dateStr.slice(0, 4)}-${String(seqCounter).padStart(4, '0')}`;
    while (existingVoucherNos.has(voucherNo)) {
      seqCounter += 1;
      voucherNo = `${params.voucherNoHint || 'JV-AUTO'}-${seqCounter}`;
    }
    seqCounter += 1;

    existingVoucherNos.add(voucherNo);
    alreadySyncedKeys.add(key);
    summaryByModule[params.sourceModule] = (summaryByModule[params.sourceModule] || 0) + 1;

    const nowIso = new Date().toISOString();
    newVouchers.push({
      id: voucherId,
      voucherNo,
      voucherType: params.voucherType,
      voucherDate: dateStr,
      financialYearId: lock.fyId,
      periodId: lock.periodId,
      referenceNo: params.referenceNo,
      description: params.description,
      lines: validLines,
      totalDebit: totalDr,
      totalCredit: totalCr,
      status: 'Posted',
      sourceModule: params.sourceModule,
      sourceId: params.sourceId,
      partyType: params.partyType,
      partyId: params.partyId,
      partyName: params.partyName,
      preparedBy: params.createdBy || 'ERP Auto-Sync',
      preparedAt: nowIso,
      approvedBy: 'System Auto-Posting',
      approvedAt: nowIso,
      postedBy: params.createdBy || 'ERP Auto-Sync',
      postedAt: nowIso,
    });
  };

  // 1. Existing CashBankTransactions (manual Cash Book / Bank Book entries not yet in vouchers)
  // Handle Contra pairs nicely so each contra transfer becomes 1 balanced Contra Voucher
  const processedContraVouchers = new Set<string>();
  input.cashBankTransactions.forEach((t) => {
    if (t.status === 'Reversed') return;
    if (t.type === 'Reversal / Adjustment') return;

    const amt = ROUND2(t.amount || t.debit || t.credit);
    if (amt <= 0) return;

    if (t.isContra && (t.type === 'Cash to Bank Deposit' || t.type === 'Bank to Cash Withdrawal')) {
      const baseNo = t.voucherNo.replace(/-(B|C)$/, '');
      if (processedContraVouchers.has(baseNo)) return;
      processedContraVouchers.add(baseNo);

      const fromId =
        t.credit > 0
          ? resolveAccountLinkForCashBank(t.accountId, coaAccounts)?.id || COA_IDS.MAIN_CASH
          : resolveAccountLinkForCashBank(t.targetAccountId || '', coaAccounts)?.id || COA_IDS.MAIN_CASH;
      const toId =
        t.debit > 0
          ? resolveAccountLinkForCashBank(t.accountId, coaAccounts)?.id || COA_IDS.BANK_DBBL
          : resolveAccountLinkForCashBank(t.targetAccountId || '', coaAccounts)?.id || COA_IDS.BANK_DBBL;

      if (fromId === toId) return;
      buildVoucher({
        sourceModule: 'CashBank',
        sourceId: `contra-${baseNo}`,
        voucherType: 'Contra Voucher',
        voucherNoHint: baseNo,
        date: t.date,
        referenceNo: t.referenceNo,
        description: t.description,
        partyType: 'Other',
        partyName: 'Internal Cash/Bank Transfer',
        createdBy: t.createdBy,
        lines: [
          { accountId: toId, debit: amt, credit: 0, description: `Deposit/Inflow: ${t.description}` },
          { accountId: fromId, debit: 0, credit: amt, description: `Withdrawal/Outflow: ${t.description}` },
        ],
      });
      return;
    }

    const cbCOA = resolveAccountLinkForCashBank(t.accountId, coaAccounts)?.id || COA_IDS.MAIN_CASH;
    if (t.type === 'Opening Balance') {
      buildVoucher({
        sourceModule: 'CashBank',
        sourceId: t.id,
        voucherType: 'Opening Journal',
        voucherNoHint: t.voucherNo,
        date: t.date,
        referenceNo: t.referenceNo,
        description: t.description,
        createdBy: t.createdBy,
        lines: [
          { accountId: cbCOA, debit: amt, credit: 0 },
          { accountId: COA_IDS.OPENING_BALANCE_EQUITY, debit: 0, credit: amt },
        ],
      });
    } else if (t.type === 'Service Income') {
      const revId = findRevenueCOAId(t.category || t.description);
      buildVoucher({
        sourceModule: 'CashBank',
        sourceId: t.id,
        voucherType: 'Receipt Voucher',
        voucherNoHint: t.voucherNo,
        date: t.date,
        referenceNo: t.referenceNo,
        description: t.description,
        partyType: 'Customer',
        partyName: t.partyName,
        createdBy: t.createdBy,
        lines: [
          { accountId: cbCOA, debit: amt, credit: 0 },
          { accountId: revId, debit: 0, credit: amt },
        ],
      });
    } else if (t.type === 'Operational Expense') {
      const expId = findExpenseCOAId(t.category || t.description, false);
      buildVoucher({
        sourceModule: 'CashBank',
        sourceId: t.id,
        voucherType: 'Payment Voucher',
        voucherNoHint: t.voucherNo,
        date: t.date,
        referenceNo: t.referenceNo,
        description: t.description,
        partyType: 'Other',
        partyName: t.partyName,
        createdBy: t.createdBy,
        lines: [
          { accountId: expId, debit: amt, credit: 0 },
          { accountId: cbCOA, debit: 0, credit: amt },
        ],
      });
    } else if (t.type === 'Sales Collection') {
      buildVoucher({
        sourceModule: 'CashBank',
        sourceId: t.id,
        voucherType: 'Receipt Voucher',
        voucherNoHint: t.voucherNo,
        date: t.date,
        referenceNo: t.invoiceNo || t.referenceNo,
        description: t.description,
        partyType: 'Customer',
        partyName: t.partyName,
        createdBy: t.createdBy,
        lines: [
          { accountId: cbCOA, debit: amt, credit: 0 },
          { accountId: COA_IDS.ACCOUNTS_RECEIVABLE, debit: 0, credit: amt },
        ],
      });
    }
  });

  // 2. Raw Material Purchases / GRN -> Dr RM Inventory / Cr Supplier Payables
  input.rawMaterialReceipts.forEach((grn) => {
    if (grn.status === 'Cancelled' || grn.status === 'Draft') return;
    const total = ROUND2(grn.totalPurchaseValue || 0);
    if (total <= 0) return;

    buildVoucher({
      sourceModule: 'Raw Material Receipt',
      sourceId: grn.id,
      voucherType: 'Purchase Journal',
      voucherNoHint: `PJ-${grn.grnNumber}`,
      date: grn.receiveDate,
      referenceNo: grn.grnNumber,
      description: `RM Purchase GRN ${grn.grnNumber} from ${grn.supplierName} (${grn.warehouseName})`,
      partyType: 'Supplier',
      partyId: grn.supplierId,
      partyName: grn.supplierName,
      createdBy: grn.receivedBy,
      lines: [
        { accountId: COA_IDS.RM_INVENTORY, debit: total, credit: 0, description: `Inventory received (${grn.totalReceivedQty} units)` },
        { accountId: COA_IDS.SUPPLIER_PAYABLES, debit: 0, credit: total, description: `Payable to ${grn.supplierName}`, partyName: grn.supplierName },
      ],
    });
  });

  // 3. Raw Material Issue to Production -> Dr WIP Inventory / Cr RM Inventory
  input.materialIssues.forEach((mi) => {
    if (mi.status === 'Cancelled') return;
    const totalCost = ROUND2(mi.totalMaterialCostBDT || mi.totalMaterialCost || 0);
    if (totalCost <= 0) return;

    buildVoucher({
      sourceModule: 'Material Issue',
      sourceId: mi.id,
      voucherType: 'Inventory & Production Journal',
      voucherNoHint: `IJ-${mi.issueNumber}`,
      date: mi.issueDate,
      referenceNo: mi.issueNumber,
      description: `Material Issue ${mi.issueNumber} to Production Order ${mi.productionOrderNumber}`,
      partyType: 'Other',
      partyName: mi.productionOrderNumber,
      createdBy: mi.issuedBy,
      lines: [
        { accountId: COA_IDS.WIP_INVENTORY, debit: totalCost, credit: 0, costCenter: mi.productionOrderNumber },
        { accountId: COA_IDS.RM_INVENTORY, debit: 0, credit: totalCost, costCenter: mi.productionOrderNumber },
      ],
    });
  });

  // 4. Manufacturing & Business Expense Entries (ERPContext) -> Dr Expense Account / Cr Cash/Bank/Outstanding
  input.expenseEntries.forEach((exp) => {
    if (exp.approvalStatus === 'Rejected') return;
    const amt = ROUND2(exp.amount || 0);
    if (amt <= 0) return;

    const expCoaId = findExpenseCOAId(exp.subcategory || exp.mainCategory, exp.mainCategory === 'Factory Expenses');
    const crCoaId =
      exp.paymentMethod === 'Payable'
        ? COA_IDS.OUTSTANDING_EXPENSES
        : resolvePaymentAssetCOAId(exp.paymentMethod, exp.accountId, cashBankAccounts, coaAccounts);

    buildVoucher({
      sourceModule: 'Operational Expense',
      sourceId: exp.id,
      voucherType: exp.paymentMethod === 'Payable' ? 'General Journal' : 'Payment Voucher',
      voucherNoHint: `EX-${exp.voucherNumber}`,
      date: exp.expenseDate,
      referenceNo: exp.voucherNumber,
      description: `${exp.mainCategory} (${exp.subcategory}): ${exp.description}`,
      createdBy: exp.createdBy,
      lines: [
        { accountId: expCoaId, debit: amt, credit: 0, costCenter: exp.costCenter },
        { accountId: crCoaId, debit: 0, credit: amt, costCenter: exp.costCenter },
      ],
    });
  });

  // 5. Production Cost Allocations -> Transfer allocated Factory Expense into WIP Inventory
  input.costAllocations.forEach((alloc) => {
    const amt = ROUND2(alloc.allocatedAmount || 0);
    if (amt <= 0) return;
    const expCoaId = findExpenseCOAId(alloc.expenseSubcategory || alloc.expenseCategory, true);

    buildVoucher({
      sourceModule: 'Production Cost Allocation',
      sourceId: alloc.id,
      voucherType: 'Inventory & Production Journal',
      voucherNoHint: `CA-${alloc.productionBatchNumber}-${alloc.id.slice(-4)}`,
      date: alloc.allocationDate,
      referenceNo: alloc.expenseVoucherNo,
      description: `Cost allocation (${alloc.expenseSubcategory}) to Batch ${alloc.productionBatchNumber} (${alloc.productName})`,
      createdBy: alloc.allocatedBy,
      lines: [
        { accountId: COA_IDS.WIP_INVENTORY, debit: amt, credit: 0, costCenter: alloc.productionBatchNumber },
        { accountId: expCoaId, debit: 0, credit: amt, costCenter: alloc.productionBatchNumber },
      ],
    });
  });

  // 6. Finished Goods Receipt from Production -> Dr FG Inventory / Cr WIP Inventory
  input.finishedGoodsProductionReceipts.forEach((fgr) => {
    const val = ROUND2(fgr.valuationTotalBDT || fgr.totalProductionCostBDT || 0);
    if (val <= 0) return;

    buildVoucher({
      sourceModule: 'Finished Goods Receipt',
      sourceId: fgr.id,
      voucherType: 'Inventory & Production Journal',
      voucherNoHint: `FG-${fgr.receiptNumber}`,
      date: fgr.receiveDate,
      referenceNo: fgr.receiptNumber,
      description: `Finished Goods Receipt ${fgr.receiptNumber}: ${fgr.acceptedQty} x ${fgr.productName} (${fgr.warehouseName})`,
      createdBy: fgr.receivedBy,
      lines: [
        { accountId: COA_IDS.FG_INVENTORY, debit: val, credit: 0, costCenter: fgr.productionBatchNumber },
        { accountId: COA_IDS.WIP_INVENTORY, debit: 0, credit: val, costCenter: fgr.productionBatchNumber },
      ],
    });
  });

  // 7. Sales Orders (Dispatched / Invoiced / Approved) -> Recognize Revenue & AR (plus COGS if product production cost known)
  input.salesOrders.forEach((so) => {
    if (so.status === 'Cancelled' || so.status === 'Booked') return;
    const netAmount = ROUND2(so.netAmountBDT || 0);
    if (netAmount <= 0) return;

    const invRef = so.invoiceNumber || so.invoiceNo || so.orderNumber;
    const vat = ROUND2(so.taxVatBDT || 0);
    const salesRev = ROUND2(netAmount - vat);
    const isInstallment = (so.paymentMethod || '').toLowerCase().includes('installment') || (so.channel || '').toLowerCase().includes('installment');
    const arAccountId = isInstallment ? COA_IDS.INSTALLMENT_RECEIVABLE : COA_IDS.ACCOUNTS_RECEIVABLE;

    // Estimate COGS from product productionCostBDT / unitCost if available
    let estimatedCOGS = 0;
    if (Array.isArray(so.items)) {
      so.items.forEach((item) => {
        const prod = input.products.find((p) => p.id === item.productId);
        const unitCost = Number(prod?.productionCostBDT || prod?.unitCostBDT || 0);
        if (unitCost > 0) {
          estimatedCOGS = ROUND2(estimatedCOGS + unitCost * (Number(item.quantity) || 0));
        }
      });
    }

    const lines: Array<{ accountId: string; debit: number; credit: number; description?: string; partyName?: string }> = [
      { accountId: arAccountId, debit: netAmount, credit: 0, description: `Receivable for ${invRef}`, partyName: so.customerName },
      { accountId: COA_IDS.FINISHED_GOODS_SALES, debit: 0, credit: salesRev > 0 ? salesRev : netAmount, description: `Sales Revenue ${invRef}` },
    ];
    if (vat > 0 && salesRev > 0) {
      lines.push({ accountId: COA_IDS.VAT_PAYABLE, debit: 0, credit: vat, description: `VAT on ${invRef}` });
    }
    if (estimatedCOGS > 0) {
      lines.push({ accountId: COA_IDS.COGS, debit: estimatedCOGS, credit: 0, description: `COGS for ${invRef}` });
      lines.push({ accountId: COA_IDS.FG_INVENTORY, debit: 0, credit: estimatedCOGS, description: `FG dispatch ${invRef}` });
    }

    buildVoucher({
      sourceModule: 'Sales Order',
      sourceId: so.id,
      voucherType: 'Sales Journal',
      voucherNoHint: `SJ-${so.orderNumber}`,
      date: so.date,
      referenceNo: invRef,
      description: `Sales Invoice ${invRef} — ${so.customerName || so.distributorName || 'Customer'} (${so.channel})`,
      partyType: so.distributorId ? 'Distributor' : 'Customer',
      partyId: so.customerId || so.distributorId,
      partyName: so.customerName || so.distributorName,
      createdBy: so.salespersonName || 'Sales Billing',
      lines,
    });
  });

  // 8. Customer / Distributor Payments (Approved in PaymentModule) -> Dr Cash/Bank / Cr Accounts Receivable
  input.payments.forEach((pay) => {
    if (pay.status !== 'Approved') return;
    const amt = ROUND2(pay.approvedAmount || pay.amountBDT || pay.paymentAmount || 0);
    if (amt <= 0) return;

    const assetCoaId = resolvePaymentAssetCOAId(pay.paymentMethod || pay.paymentMode, pay.bankId, cashBankAccounts, coaAccounts);
    buildVoucher({
      sourceModule: 'Customer Payment',
      sourceId: pay.id,
      voucherType: 'Receipt Voucher',
      voucherNoHint: `RV-${pay.tranNo}`,
      date: pay.tranDate || new Date().toISOString().slice(0, 10),
      referenceNo: pay.tranNo,
      description: `Customer/Distributor Collection ${pay.tranNo} from ${pay.customerName || pay.distributorName || 'Client'}`,
      partyType: pay.distributorId ? 'Distributor' : 'Customer',
      partyId: pay.customerId || pay.distributorId,
      partyName: pay.customerName || pay.distributorName,
      createdBy: pay.requestedBy,
      lines: [
        { accountId: assetCoaId, debit: amt, credit: 0 },
        { accountId: COA_IDS.ACCOUNTS_RECEIVABLE, debit: 0, credit: amt, partyName: pay.customerName || pay.distributorName },
      ],
    });
  });

  // 9. Installment Collections -> Dr Cash/Bank / Cr Installment Receivables (or AR)
  input.installmentPayments.forEach((ip) => {
    const amt = ROUND2(ip.amountBDT || 0);
    if (amt <= 0) return;
    const assetCoaId = resolvePaymentAssetCOAId(ip.paymentMethod, ip.bankAccountId, cashBankAccounts, coaAccounts);
    buildVoucher({
      sourceModule: 'Installment Payment',
      sourceId: ip.id,
      voucherType: 'Receipt Voucher',
      voucherNoHint: `RV-${ip.paymentReceiptNo}`,
      date: ip.paymentDate,
      referenceNo: ip.paymentReceiptNo,
      description: `Installment collection ${ip.paymentReceiptNo} (${ip.agreementNo}) — ${ip.customerName}`,
      partyType: 'Customer',
      partyId: ip.customerId,
      partyName: ip.customerName,
      createdBy: ip.receivedByName,
      lines: [
        { accountId: assetCoaId, debit: amt, credit: 0 },
        { accountId: COA_IDS.INSTALLMENT_RECEIVABLE, debit: 0, credit: amt, partyName: ip.customerName },
      ],
    });
  });

  // 10. Salary Disbursements -> Dr Salary Expenses / Cr Cash or Bank
  input.salaryPaymentRecords.forEach((sal) => {
    const amt = ROUND2(sal.paidAmountBDT || sal.amountBDT || sal.netPayableBDT || 0);
    if (amt <= 0) return;
    const assetCoaId = resolvePaymentAssetCOAId(sal.paymentMethod, sal.bankAccountId, cashBankAccounts, coaAccounts);
    buildVoucher({
      sourceModule: 'Payroll Salary',
      sourceId: sal.id,
      voucherType: 'Payroll Journal',
      voucherNoHint: `PR-${sal.monthYear}-${sal.id.slice(-4)}`,
      date: sal.paymentDate,
      referenceNo: sal.transactionReference || sal.monthYear,
      description: `Salary payment (${sal.monthYear}) to ${sal.employeeName}`,
      partyType: 'Employee',
      partyId: sal.employeeId || sal.fieldForceId,
      partyName: sal.employeeName,
      createdBy: sal.disbursedBy,
      lines: [
        { accountId: COA_IDS.SALARY_EXPENSES, debit: amt, credit: 0, partyName: sal.employeeName },
        { accountId: assetCoaId, debit: 0, credit: amt },
      ],
    });
  });

  // 11. Approved TA/DA Claims -> Dr TA/DA Expense / Cr TA/DA Payable (or Cash)
  input.tadaList.forEach((tada) => {
    const status = (tada.status || '').toLowerCase();
    if (status !== 'approved' && status !== 'paid' && status !== 'disbursed') return;
    const amt = ROUND2((tada as any).approvedAmountBDT || (tada as any).totalAmountBDT || (tada as any).amountBDT || 0);
    if (amt <= 0) return;
    const crAccount = status === 'paid' || status === 'disbursed' ? COA_IDS.MAIN_CASH : COA_IDS.TADA_PAYABLE;

    buildVoucher({
      sourceModule: 'TADA',
      sourceId: tada.id,
      voucherType: status === 'paid' ? 'Payment Voucher' : 'General Journal',
      voucherNoHint: `TD-${tada.id.slice(-5).toUpperCase()}`,
      date: (tada as any).date || (tada as any).travelDate || new Date().toISOString().slice(0, 10),
      referenceNo: (tada as any).claimNumber || tada.id,
      description: `Field TA/DA Conveyance — ${(tada as any).salespersonName || (tada as any).employeeName || 'Officer'}`,
      partyType: 'Employee',
      partyName: (tada as any).salespersonName || (tada as any).employeeName,
      lines: [
        { accountId: COA_IDS.TADA_EXPENSES, debit: amt, credit: 0 },
        { accountId: crAccount, debit: 0, credit: amt },
      ],
    });
  });

  // 12. Warranty Service Payments -> Dr Cash/Bank / Cr Battery Repair Income
  input.servicePayments.forEach((sp) => {
    const amt = ROUND2(sp.amountBDT || 0);
    if (amt <= 0) return;
    const assetCoaId = resolvePaymentAssetCOAId(sp.paymentMethod, undefined, cashBankAccounts, coaAccounts);
    buildVoucher({
      sourceModule: 'Warranty Service',
      sourceId: sp.id,
      voucherType: 'Receipt Voucher',
      voucherNoHint: `WS-${sp.receiptNumber}`,
      date: sp.paymentDate,
      referenceNo: sp.receiptNumber,
      description: `Battery Repair / Service Fee ${sp.invoiceNumber} — ${sp.customerName}`,
      partyType: 'Customer',
      partyName: sp.customerName,
      lines: [
        { accountId: assetCoaId, debit: amt, credit: 0 },
        { accountId: COA_IDS.BATTERY_REPAIR_INCOME, debit: 0, credit: amt },
      ],
    });
  });

  // 13. Ensec & Optimum Joint Production / JV Statement Entries
  // Strictly maintains Optimum JV Conversion & Clearing Payable separate from Ensec's internal expenses
  input.optimumStatement.forEach((opt) => {
    const debitAmt = ROUND2(opt.debitBDT || opt.debitEnsecBDT || 0);
    const creditAmt = ROUND2(opt.creditBDT || opt.creditOptimumBDT || 0);
    const typeLower = (opt.type || opt.transactionType || '').toLowerCase();

    if (debitAmt > 0) {
      const drHead = typeLower.includes('raw material') || typeLower.includes('import')
        ? COA_IDS.RM_INVENTORY
        : COA_IDS.ASSEMBLY_LABOR_COST;

      buildVoucher({
        sourceModule: 'Optimum JV',
        sourceId: opt.id,
        voucherType: 'General Journal',
        voucherNoHint: `OPT-${opt.id.slice(-5).toUpperCase()}`,
        date: opt.date || new Date().toISOString().slice(0, 10),
        referenceNo: opt.reference || opt.id,
        description: opt.description || opt.notes || `Optimum JV Entry (${opt.type || opt.transactionType})`,
        partyType: 'Optimum JV',
        partyName: 'Optimum JV (Kushtia Factory Partner)',
        lines: [
          { accountId: drHead, debit: debitAmt, credit: 0, partyName: 'Optimum JV' },
          { accountId: COA_IDS.OPTIMUM_JV_PAYABLE, debit: 0, credit: debitAmt, partyName: 'Optimum JV' },
        ],
      });
    } else if (creditAmt > 0) {
      buildVoucher({
        sourceModule: 'Optimum JV',
        sourceId: opt.id,
        voucherType: 'Payment Voucher',
        voucherNoHint: `OPT-PAY-${opt.id.slice(-5).toUpperCase()}`,
        date: opt.date || new Date().toISOString().slice(0, 10),
        referenceNo: opt.reference || opt.id,
        description: opt.description || opt.notes || 'Ensec JV Settlement Payment to Optimum',
        partyType: 'Optimum JV',
        partyName: 'Optimum JV (Kushtia Factory Partner)',
        lines: [
          { accountId: COA_IDS.OPTIMUM_JV_PAYABLE, debit: creditAmt, credit: 0, partyName: 'Optimum JV' },
          { accountId: COA_IDS.BANK_CITY, debit: 0, credit: creditAmt, partyName: 'Optimum JV' },
        ],
      });
    }
  });

  return {
    newVouchers,
    skippedLockedCount,
    summaryByModule,
  };
}
