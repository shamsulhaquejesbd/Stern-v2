/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ensec ERP - Executive Production Cost Sheet & Accounting Engine
 * Implements Section 5 of the Manufacturing Cost Accounting Specification.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useERP } from '../../context/ERPContext';
import { 
  Calculator, Layers, CheckCircle2, X, Printer, Download, 
  TrendingUp, AlertTriangle, ArrowRight, DollarSign, Cpu, FileSpreadsheet,
  Building, Calendar, Clock, PackageCheck, BookOpen, ShieldCheck, ShieldAlert, Tag, Lock
} from 'lucide-react';
import { ProductionOrder, ProductionCostRecord } from '../../types/erp';
import { ProductionCostDetailedRecord } from '../../types/costing';
import {
  canViewManufacturingCostSheet,
  canSaveCostSheetToDB,
  canExportManufacturingCostSheets,
} from '../../types/pagePermissions';
import { getManufacturingAuthHeaders } from '../../lib/manufacturingPermissions';

interface ProductionCostSheetModalProps {
  order: ProductionOrder;
  onClose: () => void;
  onReceiveFinishedGoods?: (order: ProductionOrder, costRecord: ProductionCostRecord) => void;
}

export const ProductionCostSheetModal: React.FC<ProductionCostSheetModalProps> = ({
  order,
  onClose,
}) => {
  const { 
    getProductionCostBreakdown,
    calculateProductionCost, 
    saveProductionCost,
    productionOrders,
    finishedGoodsProductionReceipts,
    currentUser,
    productionConsumptions, 
    costAllocations,
    formatCurrency 
  } = useERP();

  const [valuationMethod, setValuationMethod] = useState<'FIFO' | 'WEIGHTED_AVERAGE'>('FIFO');
  const [activeSubTab, setActiveSubTab] = useState<'cost-sheet' | 'raw-materials' | 'expense-allocations' | 'journal-entries'>('cost-sheet');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [serverDeniedReason, setServerDeniedReason] = useState<string | null>(null);

  const hasCostSheetPermission = canViewManufacturingCostSheet(currentUser);
  const canSaveCostSheet = canSaveCostSheetToDB(currentUser);
  const canExportCostSheet = canExportManufacturingCostSheets(currentUser);

  // Enforce backend/API authorization when opening Cost Sheet
  useEffect(() => {
    if (!hasCostSheetPermission) {
      setServerDeniedReason(
        'Access Restricted: Your account does not have "View Cost Sheet" permission under Manufacturing Costing & BOM.'
      );
      return;
    }

    let cancelled = false;
    fetch(`/api/manufacturing/cost-sheet/${encodeURIComponent(order.id || order.orderNumber || order.batchNumber)}`, {
      headers: {
        ...getManufacturingAuthHeaders(currentUser),
      },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          setServerDeniedReason(
            data?.error || 'Forbidden: You do not have permission to view this Production Cost Sheet.'
          );
        } else {
          setServerDeniedReason(null);
        }
      })
      .catch(() => {
        // Keep frontend check authoritative if server fetch fails
      });

    return () => {
      cancelled = true;
    };
  }, [hasCostSheetPermission, order.id, order.orderNumber, order.batchNumber, currentUser?.id, currentUser?.role]);

  // Compute granular production cost breakdown ONLY when authorized
  const detailedRecord: ProductionCostDetailedRecord = useMemo(() => {
    if (!hasCostSheetPermission || serverDeniedReason) {
      return {
        productionOrderId: String(order.id || ''),
        orderNumber: String(order.orderNumber || ''),
        batchNumber: String(order.batchNumber || ''),
        productId: String(order.productId || ''),
        productName: String(order.productName || ''),
        productSku: String(order.model || ''),
        productionDate: String(order.date || ''),
        factoryLocation: 'Kushtia Manufacturing Plant',
        plannedQty: Number(order.plannedQty || 0),
        actualProductionQty: Number(order.completedQty || 0),
        goodFinishedQty: Number(order.completedQty || order.plannedQty || 0),
        rejectedQty: 0,
        rawMaterialBatches: [],
        rawMaterialCost: 0,
        directLabourCost: 0,
        directOvertimeCost: 0,
        electricityAllocation: 0,
        factoryRentAllocation: 0,
        generatorFuel: 0,
        machineMaintenance: 0,
        packagingCost: 0,
        otherProductionExpenses: 0,
        totalManufacturingCost: 0,
        actualUnitProductionCost: 0,
        calculatedAt: new Date().toISOString(),
        journalEntries: [],
      } as unknown as ProductionCostDetailedRecord;
    }
    return getProductionCostBreakdown(order.id, valuationMethod);
  }, [hasCostSheetPermission, serverDeniedReason, order.id, valuationMethod, productionConsumptions, costAllocations]);

  // Live order from ERP context (to reflect updates reactively)
  const currentOrder = useMemo(() => {
    return (
      productionOrders?.find(
        (po) => String(po.id) === String(order.id) || (order.orderNumber && po.orderNumber === order.orderNumber)
      ) || order
    );
  }, [productionOrders, order]);

  const totalOrderQty = Number(currentOrder.completedQty || currentOrder.plannedQty || detailedRecord.goodFinishedQty || 0);

  // Authoritative check if this production order's finished goods have already been received
  const isAlreadyReceived = useMemo(() => {
    if (currentOrder.fgReceivingStatus === 'Fully Received') return true;
    if (typeof currentOrder.receivedFgQty === 'number' && currentOrder.receivedFgQty >= totalOrderQty && totalOrderQty > 0) return true;
    if (currentOrder.remainingFgQty !== undefined && currentOrder.remainingFgQty <= 0 && (currentOrder.receivedFgQty || 0) > 0) return true;

    const matchingReceipt = finishedGoodsProductionReceipts?.find(
      (r) =>
        (r.productionOrderId && String(r.productionOrderId) === String(order.id)) ||
        (r.productionOrderNumber &&
          order.orderNumber &&
          r.productionOrderNumber.trim().toLowerCase() === order.orderNumber.trim().toLowerCase())
    );
    return Boolean(matchingReceipt);
  }, [currentOrder, totalOrderQty, finishedGoodsProductionReceipts, order]);

  const handlePrint = () => {
    if (!canExportCostSheet) return;
    window.print();
  };

  const handleExportCSV = () => {
    if (!canExportCostSheet) return;
    const rows: string[][] = [
      ['Executive Production Cost Sheet', detailedRecord.batchNumber || '', detailedRecord.orderNumber || ''],
      ['Product Name', detailedRecord.productName || '', 'Model', detailedRecord.productSku || ''],
      ['Production Date', detailedRecord.productionDate || '', 'Factory Location', detailedRecord.factoryLocation || ''],
      ['Planned Qty', String(detailedRecord.plannedQty || 0), 'Good Finished Qty', String(detailedRecord.goodFinishedQty || 0)],
      ['Valuation Method', valuationMethod],
      [],
      ['Cost Component', 'Amount (BDT)'],
      ['Raw Material Cost', String(detailedRecord.rawMaterialCost || 0)],
      ['Direct Labour Cost', String(detailedRecord.directLabourCost || 0)],
      ['Direct Overtime Cost', String(detailedRecord.directOvertimeCost || 0)],
      ['Electricity Allocation', String(detailedRecord.electricityAllocation || 0)],
      ['Factory Rent Allocation', String(detailedRecord.factoryRentAllocation || 0)],
      ['Generator Fuel', String(detailedRecord.generatorFuel || 0)],
      ['Machine Maintenance', String(detailedRecord.machineMaintenance || 0)],
      ['Packaging Cost', String(detailedRecord.packagingCost || 0)],
      ['Other Production Expenses', String(detailedRecord.otherProductionExpenses || 0)],
      ['Total Manufacturing Cost', String(detailedRecord.totalManufacturingCost || 0)],
      ['Actual Unit Production Cost', String(detailedRecord.actualUnitProductionCost || 0)],
    ];
    const csvContent = rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cost-sheet-${(detailedRecord.batchNumber || detailedRecord.orderNumber || 'batch').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveCostSheet = async () => {
    if (!canSaveCostSheet) return;
    setIsSaving(true);
    try {
      const costRecord = calculateProductionCost(order.id, valuationMethod, true);
      if (saveProductionCost) {
        await saveProductionCost(costRecord);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving cost sheet:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasCostSheetPermission || serverDeniedReason) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Cost Sheet Access Restricted
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {serverDeniedReason ||
              'You do not have "View Cost Sheet" permission under Manufacturing Costing & BOM.'}
          </p>
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6 text-xs max-h-[94vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-800">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Executive Production Cost Sheet
                </h2>
                <span className="text-[11px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-mono font-bold px-2.5 py-0.5 rounded-full">
                  Batch: {detailedRecord.batchNumber}
                </span>
                <span className="text-[11px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-md">
                  PO: {detailedRecord.orderNumber}
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                Batch-level granular actual cost calculation engine with FIFO raw materials and allocated factory expenses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canExportCostSheet && (
              <>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="p-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition flex items-center gap-1.5 font-medium cursor-pointer"
                  title="Export Cost Sheet as CSV"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 font-medium cursor-pointer"
                  title="Print Official Cost Sheet"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Cost Sheet</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 1. Production Information Card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-500" />
              Production & Batch Metadata
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              order.status === 'Completed' || order.status === 'Transferred'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}>
              {order.status || 'In Production'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Batch ID</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{detailedRecord.batchNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Product Name</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate block" title={detailedRecord.productName}>
                {detailedRecord.productName}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Model / SKU</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{detailedRecord.productSku}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Production Date</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{detailedRecord.productionDate}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Factory Location</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{detailedRecord.factoryLocation}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Planned Quantity</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{detailedRecord.plannedQty} Units</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Actual Production</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{detailedRecord.actualProductionQty} Units</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Good Finished Qty</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{detailedRecord.goodFinishedQty} Units</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Rejected / Scrap</span>
              <span className="font-mono font-bold text-rose-500">{detailedRecord.rejectedQty} Units</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Costing Valuation</span>
              <div className="flex gap-1 mt-0.5">
                <button
                  type="button"
                  onClick={() => setValuationMethod('FIFO')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    valuationMethod === 'FIFO'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  FIFO
                </button>
                <button
                  type="button"
                  onClick={() => setValuationMethod('WEIGHTED_AVERAGE')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    valuationMethod === 'WEIGHTED_AVERAGE'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  W.Avg
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SubTab Switcher */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            onClick={() => setActiveSubTab('cost-sheet')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'cost-sheet'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Production Cost Sheet Table</span>
          </button>
          <button
            onClick={() => setActiveSubTab('raw-materials')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'raw-materials'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Raw Material Batches ({detailedRecord.rawMaterialBatches.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('expense-allocations')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'expense-allocations'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
            <span>Factory Expenses Allocated ({detailedRecord.allocations.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('journal-entries')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'journal-entries'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Accounting Journal Entries ({detailedRecord.journalEntries.length})</span>
          </button>
        </div>

        {/* TAB 1: Main Production Cost Sheet Table (11 Core Components) */}
        {activeSubTab === 'cost-sheet' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Cost Component</th>
                    <th className="p-3">Cost Accounting Classification</th>
                    <th className="p-3">Basis / Absorption Method</th>
                    <th className="p-3 text-right">Amount (BDT)</th>
                    <th className="p-3 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {/* 1. Raw Material Cost */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">1</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-blue-500" />
                      Raw Material Cost
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Direct Material</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">FIFO Purchase Batch Rates</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.rawMaterialCost)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.rawMaterialCost / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 2. Direct Labour & Conversion Charge */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">2</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                      Direct Labour &amp; Conversion Charge
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Direct Conversion &amp; Labour</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Assembly Wages &amp; Conversion Fees</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.directLabourCost)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.directLabourCost / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 2b. Direct Overtime Cost */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 bg-indigo-50/30 dark:bg-indigo-950/20">
                    <td className="p-3 text-center text-slate-400 font-mono">2b</td>
                    <td className="p-3 font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      Direct Overtime Cost
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Direct Overtime Wages</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Approved OT Batch Hours (BLA 2006)</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-700 dark:text-indigo-300">
                      {formatCurrency(detailedRecord.directOvertimeCost || 0)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${(((detailedRecord.directOvertimeCost || 0) / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 3. Electricity Allocation */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">3</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                      Electricity Allocation
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Factory Overhead (Utility)</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Industrial HT Grid Absorption</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.electricityAllocation)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.electricityAllocation / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 4. Factory Rent Allocation */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">4</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-purple-500" />
                      Factory Rent Allocation
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Factory Overhead (Fixed Facility)</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Floor Area &amp; Batch Pro-rata</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.factoryRentAllocation)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.factoryRentAllocation / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 5. Generator Fuel */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">5</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
                      Generator Fuel
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Factory Overhead (Auxiliary Power)</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Diesel Machine Running Hours</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.generatorFuel)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.generatorFuel / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 6. Machine Maintenance */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">6</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                      Machine Maintenance
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Factory Overhead (Equipment Maintenance)</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Welder Electrodes &amp; Servicing</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.machineMaintenance)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.machineMaintenance / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 7. Packaging Cost */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">7</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />
                      Packaging Cost
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Direct Production Expense</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Battery Cartons &amp; EPE Foam</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.packagingCost)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.packagingCost / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 8. Other Production Expenses */}
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 text-center text-slate-400 font-mono">8</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-slate-500" />
                      Other Production Expenses
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Factory Overhead (QC &amp; Supervision)</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">Quality Testing &amp; Consumables</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(detailedRecord.otherProductionExpenses)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-500">
                      {detailedRecord.totalManufacturingCost > 0
                        ? `${((detailedRecord.otherProductionExpenses / detailedRecord.totalManufacturingCost) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                  </tr>

                  {/* 9. Total Manufacturing Cost */}
                  <tr className="bg-blue-50/70 dark:bg-blue-950/40 font-bold border-t-2 border-blue-300 dark:border-blue-700 text-sm">
                    <td className="p-3 text-center text-blue-600 font-mono">9</td>
                    <td className="p-3 font-black text-blue-900 dark:text-blue-200">
                      Total Manufacturing Cost
                    </td>
                    <td className="p-3 text-blue-800 dark:text-blue-300 text-xs font-semibold">Total Absorbed Batch Cost</td>
                    <td className="p-3 text-blue-700 dark:text-blue-300 font-mono text-[11px]">Direct + Overhead Absorbed</td>
                    <td className="p-3 text-right font-mono font-black text-blue-700 dark:text-blue-300 text-base">
                      {formatCurrency(detailedRecord.totalManufacturingCost)}
                    </td>
                    <td className="p-3 text-right font-mono text-blue-700 dark:text-blue-300">100.0%</td>
                  </tr>

                  {/* 10. Good Finished Quantity */}
                  <tr className="bg-emerald-50/60 dark:bg-emerald-950/30 font-semibold border-t border-emerald-200 dark:border-emerald-800">
                    <td className="p-3 text-center text-emerald-600 font-mono">10</td>
                    <td className="p-3 font-bold text-emerald-900 dark:text-emerald-200">
                      Good Finished Quantity
                    </td>
                    <td className="p-3 text-emerald-800 dark:text-emerald-300 text-xs">Passed Final QA Stamping</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-300 font-mono text-[11px]">Net Accepted Units</td>
                    <td className="p-3 text-right font-mono font-black text-emerald-700 dark:text-emerald-300 text-sm">
                      {detailedRecord.goodFinishedQty} Units
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-600 text-xs">
                      {detailedRecord.plannedQty > 0 ? `${((detailedRecord.goodFinishedQty / detailedRecord.plannedQty) * 100).toFixed(0)}% Yield` : '-'}
                    </td>
                  </tr>

                  {/* 11. Actual Unit Production Cost */}
                  <tr className="bg-indigo-600 text-white font-black text-base border-t-2 border-indigo-700">
                    <td className="p-3.5 text-center text-indigo-200 font-mono">11</td>
                    <td className="p-3.5">
                      Actual Unit Production Cost
                    </td>
                    <td className="p-3.5 text-xs font-normal text-indigo-100">Capitalized Inventory Valuation</td>
                    <td className="p-3.5 font-mono text-xs font-normal text-indigo-200">Total Mfg Cost / Good Qty</td>
                    <td className="p-3.5 text-right font-mono text-lg text-white">
                      {formatCurrency(detailedRecord.actualUnitProductionCost)} / Unit
                    </td>
                    <td className="p-3.5 text-right font-mono text-indigo-200 text-xs">Final FG Rate</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Verification Formula Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-800 dark:text-slate-200">Accounting Formula Applied:</span>
                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  Unit Cost = (Direct Material + Direct Labour + Allocated Factory Overhead + Direct Packaging) / Good Finished Quantity
                </p>
              </div>
              <div className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-right shrink-0">
                ৳ {detailedRecord.totalManufacturingCost.toLocaleString()} ÷ {detailedRecord.goodFinishedQty} = ৳ {detailedRecord.actualUnitProductionCost.toLocaleString()}/unit
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Raw Material Batches Consumed */}
        {activeSubTab === 'raw-materials' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                  FIFO Raw Material Batches Consumed in This Batch
                </h3>
                <p className="text-[11px] text-slate-500">
                  Detailed traceable purchase batches, barcodes, and rates issued to this production order
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                Total Material Cost: {formatCurrency(detailedRecord.rawMaterialCost)}
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 font-semibold">
                  <tr>
                    <th className="p-2.5">Material Code &amp; Name</th>
                    <th className="p-2.5">Batch Number</th>
                    <th className="p-2.5">Batch Barcode</th>
                    <th className="p-2.5 text-right">Quantity Consumed</th>
                    <th className="p-2.5 text-right">Unit Purchase Rate</th>
                    <th className="p-2.5 text-right">Total Cost (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailedRecord.rawMaterialBatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No raw material batches recorded for this production order yet.
                      </td>
                    </tr>
                  ) : (
                    detailedRecord.rawMaterialBatches.map((b, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                          {b.materialName}
                          <span className="block font-mono text-[10px] text-slate-400 font-normal">{b.materialCode}</span>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                          {b.batchNumber}
                        </td>
                        <td className="p-2.5 font-mono text-[10px] text-slate-500">
                          {b.batchBarcode || '-'}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {b.quantity.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatCurrency(b.unitPurchaseRate)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-white">
                          {formatCurrency(b.totalCostBDT)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700">
                    <td colSpan={5} className="p-2.5 text-right text-slate-700 dark:text-slate-300">
                      Total Raw Material Cost:
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                      {formatCurrency(detailedRecord.rawMaterialCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Allocated Factory Expenses */}
        {activeSubTab === 'expense-allocations' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                  Factory Expenses Allocated to Batch {detailedRecord.batchNumber}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Granular factory vouchers allocated to this batch via quantity, machine hours, or direct assignment
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                Total Allocated Expenses: {formatCurrency(detailedRecord.totalManufacturingCost - detailedRecord.rawMaterialCost)}
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 font-semibold">
                  <tr>
                    <th className="p-2.5">Voucher Number</th>
                    <th className="p-2.5">Subcategory</th>
                    <th className="p-2.5">Allocation Method</th>
                    <th className="p-2.5 text-right">Base Expense Amount</th>
                    <th className="p-2.5 text-right">Allocated Amount (BDT)</th>
                    <th className="p-2.5">Date &amp; Officer</th>
                    <th className="p-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailedRecord.allocations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No specific expense allocations logged for this batch yet. Fallback standard overhead is currently estimated.
                      </td>
                    </tr>
                  ) : (
                    detailedRecord.allocations.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {a.expenseVoucherNo}
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                          {a.expenseSubcategory}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">
                            {a.allocationMethod}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-500">
                          {formatCurrency(a.totalExpenseAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-amber-600 dark:text-amber-400 text-xs">
                          {formatCurrency(a.allocatedAmount)}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400 text-[11px]">
                          <div>{a.allocationDate}</div>
                          <span className="text-[10px] text-slate-400">{a.allocatedBy}</span>
                        </td>
                        <td className="p-2.5 text-slate-500 text-[11px] max-w-xs truncate" title={a.notes}>
                          {a.notes || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Accounting Journal Entries */}
        {activeSubTab === 'journal-entries' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                  Double-Entry Cost Accounting Journal Entries (Automatic Posting)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Balanced debit-credit postings for Raw Materials Issue, Overhead Absorption, WIP Transfers, and Finished Goods Receiving
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800">
                Balanced Dr/Cr Ledger
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 font-semibold">
                  <tr>
                    <th className="p-2.5">Account Code</th>
                    <th className="p-2.5">Account Head Title</th>
                    <th className="p-2.5">Transaction Narrative / Description</th>
                    <th className="p-2.5 text-right">Debit (BDT)</th>
                    <th className="p-2.5 text-right">Credit (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {detailedRecord.journalEntries.map((j, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-2.5 text-blue-600 dark:text-blue-400 font-bold">{j.accountCode}</td>
                      <td className="p-2.5 font-sans font-bold text-slate-900 dark:text-white">{j.accountName}</td>
                      <td className="p-2.5 font-sans text-slate-600 dark:text-slate-400 text-[11px]">{j.description}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {j.debit > 0 ? formatCurrency(j.debit) : '-'}
                      </td>
                      <td className="p-2.5 text-right font-bold text-rose-600 dark:text-rose-400">
                        {j.credit > 0 ? formatCurrency(j.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Status Notification: Finished Goods Receipt Status */}
        {isAlreadyReceived && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold">Finished Goods Received into Inventory:</span>
                <span className="ml-1 text-emerald-700 dark:text-emerald-300">
                  {currentOrder.receivedFgQty || totalOrderQty} units have been finalized &amp; received into warehouse stock. Raw material issue and cost sheet are locked against modifications.
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 shrink-0">
              Receipt Finalized
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 gap-3">
          <div className="text-xs text-slate-500">
            Calculated at: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{detailedRecord.calculatedAt}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Close
            </button>
            {canSaveCostSheet && (
              <button
                type="button"
                onClick={handleSaveCostSheet}
                disabled={isSaving || saveSuccess}
                className={`px-4 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                  saveSuccess
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{saveSuccess ? 'Saved to Database!' : isSaving ? 'Saving to Database...' : 'Save Cost Sheet to Database'}</span>
              </button>
            )}
            {isAlreadyReceived && (
              <span
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 select-none cursor-not-allowed shadow-none"
                title="Finished Goods have already been received into warehouse inventory for this production order. Duplicate receiving is locked."
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>FG Received into Inventory ({currentOrder.receivedFgQty || totalOrderQty} Units) &bull; Locked</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
