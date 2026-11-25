import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { OvertimeRequest } from '../../types/overtime';
import { 
  Layers, 
  Split, 
  AlertCircle, 
  CheckCircle2, 
  Factory, 
  Clock, 
  DollarSign, 
  SlidersHorizontal,
  Plus,
  ShieldAlert
} from 'lucide-react';

interface OvertimeBatchAllocationTabProps {
  onOpenSplitModal: (request: OvertimeRequest) => void;
}

export const OvertimeBatchAllocationTab: React.FC<OvertimeBatchAllocationTabProps> = ({
  onOpenSplitModal,
}) => {
  const { overtimeRequests, productionOrders, hasPageAction, currentUser } = useERP();
  const canViewPage = hasPageAction ? hasPageAction('overtime-management', 'view_batch_allocation') : currentUser.role === 'Super Admin';
  const canAllocateBatch = (hasPageAction ? hasPageAction('overtime-management', 'allocate_batch') : currentUser.role === 'Super Admin') && canViewPage;
  const canViewCost = hasPageAction ? hasPageAction('overtime-management', 'view_cost') : currentUser.role === 'Super Admin';
  const [filterType, setFilterType] = useState<'all' | 'unsplit' | 'split' | 'overhead'>('all');

  // Requests that are approved or verified
  const eligibleRequests = overtimeRequests.filter(req => {
    if (filterType === 'all') return true;
    if (filterType === 'unsplit') return !req.batchAllocations || req.batchAllocations.length <= 1;
    if (filterType === 'split') return req.batchAllocations && req.batchAllocations.length > 1;
    if (filterType === 'overhead') return req.batchAllocations?.some(a => a.isOverhead);
    return true;
  });

  if (!canViewPage) {
    return (
      <div className="p-8 max-w-md mx-auto mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Batch Allocation &amp; Split Access Restricted
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your account lacks <strong>Batch Allocation &amp; Split</strong> page permission under Overtime Management Hub. Contact your administrator to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner explaining Production Cost absorption */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Layers className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Direct Production Order &amp; Batch Cost Absorption</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            In accordance with industrial accounting standards, overtime hours can be split across multiple manufacturing batches (e.g. BMS Assembly vs Inverter Final Test). Maintenance &amp; non-production overtime is allocated to factory overhead.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
          <Factory className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Active Batches: <strong className="text-slate-900 dark:text-white">{productionOrders.length} Orders</strong></span>
        </div>
      </div>

      {/* Filter switches */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <SlidersHorizontal className="w-4 h-4 text-slate-400 ml-1" />
          <span className="text-slate-400 mr-1">Filter Allocation:</span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filterType === 'all' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100'}`}
          >
            All Requests ({overtimeRequests.length})
          </button>
          <button
            onClick={() => setFilterType('split')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filterType === 'split' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100'}`}
          >
            Multi-Batch Split
          </button>
          <button
            onClick={() => setFilterType('unsplit')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filterType === 'unsplit' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100'}`}
          >
            Single Batch Assigned
          </button>
          <button
            onClick={() => setFilterType('overhead')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${filterType === 'overhead' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-100'}`}
          >
            Overhead / Maintenance
          </button>
        </div>
      </div>

      {/* Table of Batch Allocations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Request # & Date</th>
                <th className="py-3 px-3">Employee</th>
                <th className="py-3 px-3">Approved OT Hours</th>
                <th className="py-3 px-3">Batch Allocation Breakdown</th>
                <th className="py-3 px-3">Direct WIP vs Overhead</th>
                {canViewCost && <th className="py-3 px-3 text-right">Total Allocated Cost</th>}
                <th className="py-3 px-4 text-right">Split Management</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {eligibleRequests.length === 0 ? (
                <tr>
                  <td colSpan={canViewCost ? 7 : 6} className="py-8 text-center text-slate-400 text-xs">
                    No overtime requests found for batch allocation.
                  </td>
                </tr>
              ) : (
                eligibleRequests.map((req) => {
                  const totalAllocatedHrs = req.batchAllocations?.reduce((sum, b) => sum + b.allocatedHours, 0) || 0;
                  const hoursMatch = Math.abs(totalAllocatedHrs - (req.actualOvertimeHours || req.expectedHours)) < 0.05;
                  const totalCost = req.calculatedOvertimeAmountBDT || 0;

                return (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900 text-xs">{req.requestNumber}</div>
                      <div className="text-xs text-slate-500">{req.overtimeDate}</div>
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="font-medium text-slate-800">{req.employeeName}</div>
                      <div className="text-xs text-slate-500">{req.department}</div>
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-900">{(req.actualOvertimeHours || req.expectedHours || 0).toFixed(2)} hrs</div>
                      {canViewCost && (
                        <div className="text-[11px] text-slate-400">Rate: ৳{(req.hourlyRateBDT || 0).toFixed(0)}/hr × {req.overtimeMultiplier ?? 2.0}x</div>
                      )}
                    </td>

                    <td className="py-3.5 px-3">
                      {req.batchAllocations && req.batchAllocations.length > 0 ? (
                        <div className="space-y-1.5 min-w-[240px]">
                          {req.batchAllocations.map((alloc) => (
                            <div 
                              key={alloc.id} 
                              className={`p-2 rounded-lg text-xs border flex items-center justify-between ${
                                alloc.isOverhead 
                                  ? 'bg-amber-50/70 border-amber-200 text-amber-900' 
                                  : 'bg-indigo-50/60 border-indigo-200 text-indigo-900'
                              }`}
                            >
                              <div>
                                <span className="font-semibold font-mono">
                                  {alloc.isOverhead ? 'FACTORY OVERHEAD' : alloc.productionBatchNumber}
                                </span>
                                <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                                  {alloc.processType} {alloc.notes ? `• ${alloc.notes}` : ''}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-bold font-mono">{alloc.allocatedHours.toFixed(2)}h</span>
                                {canViewCost && (
                                  <div className="text-[10px] text-slate-500">৳{alloc.allocatedCostBDT.toLocaleString()}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No batch allocation defined</span>
                      )}
                    </td>

                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {req.batchAllocations?.some(a => a.isOverhead) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800">
                          Factory Overhead
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
                          Direct WIP Cost
                        </span>
                      )}
                      <div className="text-[10px] text-slate-500 mt-1">
                        {hoursMatch ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 100% Absorbed
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Partial ({totalAllocatedHrs}/{req.actualOvertimeHours || req.expectedHours || 0}h)
                          </span>
                        )}
                      </div>
                    </td>

                    {canViewCost && (
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">৳{totalCost.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-400">Total BDT</div>
                      </td>
                    )}

                    <td className="py-3.5 px-4 text-right">
                      {canAllocateBatch ? (
                        <button
                          onClick={() => onOpenSplitModal(req)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Split className="w-3.5 h-3.5" />
                          Split / Allocate
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">View Only</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
