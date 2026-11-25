import {
  OvertimeRequisition,
  OvertimeRequisitionApprovalAction,
  OvertimeRequisitionApprovalHistoryEntry,
  OvertimeRequisitionPurposeItem,
  OvertimeRequisitionStatus,
} from '../types/overtime.ts';
import { resolveOvertimePermissions } from './overtimePermissions.ts';

export type RequisitionDecisionAction = 'APPROVE' | 'REJECT' | 'RETURN';

export interface RequisitionValidationResult {
  valid: boolean;
  error?: string;
  requiredWorkers?: number;
  requestedHours?: number;
  overtimeDate?: string;
  purposes?: OvertimeRequisitionPurposeItem[];
  purposeSummary?: string;
  remarks?: string;
}

export interface RequisitionFilterCriteria {
  dateFrom?: string;
  dateTo?: string;
  overtimeDate?: string;
  status?: string;
  requestedBy?: string;
  search?: string;
}

export interface RequisitionSummaryCounts {
  total: number;
  pendingApproval: number;
  approved: number;
  rejected: number;
  returnedForCorrection: number;
}

export function getTodayIsoDate(now: Date = new Date()): string {
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const da = String(now.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

export function generateNextRequisitionNumber(
  existing: Array<Pick<OvertimeRequisition, 'requisitionNumber'>>,
  year: number = new Date().getFullYear()
): string {
  let maxSeq = 0;
  const prefix = `OTRQ-${year}-`;
  for (const item of existing) {
    const num = String(item?.requisitionNumber || '');
    if (num.startsWith(prefix)) {
      const seq = Number(num.slice(prefix.length));
      if (Number.isFinite(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    } else {
      const match = num.match(/(\d+)$/);
      if (match) {
        const seq = Number(match[1]);
        if (Number.isFinite(seq) && num.includes(`-${year}-`) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export function normalizeRequisitionPurposes(
  rawPurposes: unknown,
  requisitionId?: string
): OvertimeRequisitionPurposeItem[] {
  if (!Array.isArray(rawPurposes)) return [];
  const seen = new Set<string>();
  const normalized: OvertimeRequisitionPurposeItem[] = [];
  const nowIso = new Date().toISOString();

  rawPurposes.forEach((entry: any, idx: number) => {
    const name =
      typeof entry === 'string'
        ? entry.trim()
        : String(entry?.purposeName || entry?.name || '').trim();
    if (!name) return;

    const dedupeKey = name.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const isCustom =
      typeof entry === 'string'
        ? true
        : Boolean(entry?.isCustom || !entry?.payrollPurposeId);

    const payrollPurposeId =
      typeof entry === 'object' && entry?.payrollPurposeId
        ? String(entry.payrollPurposeId)
        : undefined;

    normalized.push({
      id:
        typeof entry === 'object' && entry?.id
          ? String(entry.id)
          : `otrp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      requisitionId,
      payrollPurposeId,
      purposeName: name,
      isCustom,
      createdAt:
        typeof entry === 'object' && entry?.createdAt
          ? String(entry.createdAt)
          : nowIso,
    });
  });

  return normalized;
}

export function formatPurposeSummary(purposes: OvertimeRequisitionPurposeItem[]): string {
  return purposes.map((p) => p.purposeName.trim()).filter(Boolean).join(', ');
}

export function validateOvertimeRequisitionPayload(input: {
  overtimeDate?: unknown;
  requiredWorkers?: unknown;
  requestedHours?: unknown;
  purposes?: unknown;
  remarks?: unknown;
}): RequisitionValidationResult {
  const overtimeDate = String(input.overtimeDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(overtimeDate)) {
    return { valid: false, error: 'Please select a valid Overtime Date (YYYY-MM-DD).' };
  }

  const workersNum = Number(input.requiredWorkers);
  if (
    input.requiredWorkers === '' ||
    input.requiredWorkers === null ||
    input.requiredWorkers === undefined ||
    !Number.isFinite(workersNum) ||
    !Number.isInteger(workersNum) ||
    workersNum < 1
  ) {
    return {
      valid: false,
      error: 'Required Workers must be a positive whole number of at least 1.',
    };
  }

  const hoursNum = Number(input.requestedHours);
  if (
    input.requestedHours === '' ||
    input.requestedHours === null ||
    input.requestedHours === undefined ||
    !Number.isFinite(hoursNum) ||
    hoursNum <= 0 ||
    hoursNum > 24
  ) {
    return {
      valid: false,
      error: 'Requested Overtime Hours must be greater than 0 and at most 24 hours per worker.',
    };
  }

  const purposes = normalizeRequisitionPurposes(input.purposes);
  if (purposes.length === 0) {
    return {
      valid: false,
      error: 'Select at least one Overtime Purpose from Payroll Settings or add a manual purpose.',
    };
  }

  const roundedHours = Math.round(hoursNum * 100) / 100;
  const remarks = typeof input.remarks === 'string' ? input.remarks.trim() : '';

  return {
    valid: true,
    overtimeDate,
    requiredWorkers: workersNum,
    requestedHours: roundedHours,
    purposes,
    purposeSummary: formatPurposeSummary(purposes),
    remarks,
  };
}

export function doesActorMatchRequester(
  requisition: Pick<OvertimeRequisition, 'requestedById' | 'requestedByName' | 'requestedBy'>,
  actor: any
): boolean {
  if (!actor) return false;
  if (actor.role === 'Super Admin') return true;
  const reqId = String(requisition.requestedById || '').trim().toLowerCase();
  const actorCandidates = [actor.id, actor.userId, actor.email]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  if (reqId && actorCandidates.includes(reqId)) return true;

  const reqName = String(requisition.requestedByName || requisition.requestedBy || '').trim().toLowerCase();
  const actorName = String(actor.name || '').trim().toLowerCase();
  return Boolean(reqName && actorName && reqName === actorName);
}

export function canEditOrResubmitRequisition(
  requisition: Pick<OvertimeRequisition, 'status' | 'requestedById' | 'requestedByName' | 'requestedBy'>,
  actor: any
): { allowed: boolean; reason?: string } {
  if (!actor) {
    return { allowed: false, reason: 'Authentication required.' };
  }
  const perms = resolveOvertimePermissions(actor);
  if (!perms.viewRequisition && actor.role !== 'Super Admin') {
    return {
      allowed: false,
      reason: 'Access Restricted: Overtime Requisition permission is required.',
    };
  }
  if (requisition.status === 'Approved' || requisition.status === 'Rejected') {
    return {
      allowed: false,
      reason: `Requisition is already ${requisition.status} and cannot be edited.`,
    };
  }
  if (requisition.status !== 'Returned for Correction') {
    return {
      allowed: false,
      reason: 'Only requisitions in "Returned for Correction" status can be edited and resubmitted.',
    };
  }
  if (!doesActorMatchRequester(requisition, actor)) {
    return {
      allowed: false,
      reason: 'Only the original requester (or Super Admin) can edit and resubmit a returned requisition.',
    };
  }
  return { allowed: true };
}

export function canUserApproveRequisition(actor: any): boolean {
  if (!actor || actor.status === 'Blocked' || actor.status === 'Inactive') return false;
  if (actor.role === 'Super Admin') return true;
  return resolveOvertimePermissions(actor).approveRequisition;
}

export function buildCreatedRequisition(params: {
  id?: string;
  existingRequisitions: Array<Pick<OvertimeRequisition, 'requisitionNumber'>>;
  overtimeDate: string;
  requiredWorkers: number;
  requestedHours: number;
  purposes: OvertimeRequisitionPurposeItem[];
  remarks?: string;
  actor: any;
  now?: Date;
}): OvertimeRequisition {
  const nowDate = params.now || new Date();
  const nowIso = nowDate.toISOString();
  const reqDate = getTodayIsoDate(nowDate);
  const year = nowDate.getFullYear();
  const id = params.id || `otrq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const requisitionNumber = generateNextRequisitionNumber(params.existingRequisitions, year);

  const purposes = params.purposes.map((p) => ({
    ...p,
    requisitionId: id,
  }));
  const purposeSummary = formatPurposeSummary(purposes);

  const actorId = String(params.actor?.id || params.actor?.userId || 'system');
  const actorName = String(params.actor?.name || 'Factory User');
  const actorRole = String(params.actor?.role || 'Staff');
  const actorDepartment = String(params.actor?.department || 'Production');

  const historyEntry: OvertimeRequisitionApprovalHistoryEntry = {
    id: `otrh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    requisitionId: id,
    action: 'SUBMITTED',
    actorId,
    actorName,
    actorRole,
    remarks: params.remarks || `Submitted overtime requisition for ${params.requiredWorkers} workers (${params.requestedHours}h/worker)`,
    newStatus: 'Pending Approval',
    actionAt: nowIso,
  };

  return {
    id,
    requisitionNumber,
    requisitionDate: reqDate,
    overtimeDate: params.overtimeDate,
    requiredWorkers: params.requiredWorkers,
    requestedHours: params.requestedHours,
    purpose: purposeSummary,
    purposes,
    remarks: params.remarks || undefined,
    requestedById: actorId,
    requestedByName: actorName,
    requestedBy: actorName,
    requestedByRole: actorRole,
    requestedByDepartment: actorDepartment,
    submittedAt: nowIso,
    status: 'Pending Approval',
    overtimeGranted: false,
    returnedCount: 0,
    approvalHistory: [historyEntry],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function applyRequisitionResubmission(
  existing: OvertimeRequisition,
  updates: {
    overtimeDate: string;
    requiredWorkers: number;
    requestedHours: number;
    purposes: OvertimeRequisitionPurposeItem[];
    remarks?: string;
  },
  actor: any,
  now: Date = new Date()
): { ok: true; requisition: OvertimeRequisition; historyEntry: OvertimeRequisitionApprovalHistoryEntry } | { ok: false; code: number; error: string } {
  const permCheck = canEditOrResubmitRequisition(existing, actor);
  if (!permCheck.allowed) {
    const isStateError =
      existing.status === 'Approved' ||
      existing.status === 'Rejected' ||
      existing.status !== 'Returned for Correction';
    return {
      ok: false,
      code: isStateError ? 409 : 403,
      error: permCheck.reason || 'Cannot edit this requisition.',
    };
  }

  const nowIso = now.toISOString();
  const purposes = updates.purposes.map((p) => ({
    ...p,
    requisitionId: existing.id,
  }));
  const purposeSummary = formatPurposeSummary(purposes);

  const historyEntry: OvertimeRequisitionApprovalHistoryEntry = {
    id: `otrh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    requisitionId: existing.id,
    action: 'RESUBMITTED',
    actorId: String(actor?.id || actor?.userId || ''),
    actorName: String(actor?.name || existing.requestedByName),
    actorRole: String(actor?.role || ''),
    remarks: updates.remarks?.trim() || 'Corrected and resubmitted for Head Office approval',
    previousStatus: existing.status,
    newStatus: 'Pending Approval',
    actionAt: nowIso,
  };

  const next: OvertimeRequisition = {
    ...existing,
    overtimeDate: updates.overtimeDate,
    requiredWorkers: updates.requiredWorkers,
    requestedHours: updates.requestedHours,
    purposes,
    purpose: purposeSummary,
    remarks: updates.remarks?.trim() || undefined,
    status: 'Pending Approval',
    overtimeGranted: false,
    grantedAt: undefined,
    lastResubmittedAt: nowIso,
    updatedAt: nowIso,
    approvalHistory: [historyEntry, ...(existing.approvalHistory || [])],
  };

  return { ok: true, requisition: next, historyEntry };
}

export function applyRequisitionDecision(
  existing: OvertimeRequisition,
  decision: RequisitionDecisionAction,
  actor: any,
  remarks: string = '',
  now: Date = new Date()
): { ok: true; requisition: OvertimeRequisition; historyEntry: OvertimeRequisitionApprovalHistoryEntry } | { ok: false; code: number; error: string } {
  if (!actor) {
    return { ok: false, code: 401, error: 'Authentication required.' };
  }
  if (!canUserApproveRequisition(actor)) {
    return {
      ok: false,
      code: 403,
      error: 'Forbidden: "Overtime Requisition Approval" permission is required for Head Office decisions.',
    };
  }
  if (existing.status !== 'Pending Approval') {
    return {
      ok: false,
      code: 409,
      error: `Duplicate or invalid transition blocked: ${existing.requisitionNumber} is currently "${existing.status}" and is not awaiting approval.`,
    };
  }

  const cleanRemarks = String(remarks || '').trim();
  if ((decision === 'REJECT' || decision === 'RETURN') && !cleanRemarks) {
    return {
      ok: false,
      code: 400,
      error:
        decision === 'REJECT'
          ? 'Please enter remarks explaining why this requisition is rejected.'
          : 'Please enter correction remarks before returning this requisition to the requester.',
    };
  }

  const nowIso = now.toISOString();
  const actorId = String(actor.id || actor.userId || '');
  const actorName = String(actor.name || 'Head Office Approver');
  const actorRole = String(actor.role || 'Head Office');

  let nextStatus: OvertimeRequisitionStatus = 'Approved';
  let action: OvertimeRequisitionApprovalAction = 'APPROVED';
  let overtimeGranted = true;
  let grantedAt: string | undefined = nowIso;
  let returnedCount = Number(existing.returnedCount || 0);

  if (decision === 'REJECT') {
    nextStatus = 'Rejected';
    action = 'REJECTED';
    overtimeGranted = false;
    grantedAt = undefined;
  } else if (decision === 'RETURN') {
    nextStatus = 'Returned for Correction';
    action = 'RETURNED_FOR_CORRECTION';
    overtimeGranted = false;
    grantedAt = undefined;
    returnedCount += 1;
  }

  const historyEntry: OvertimeRequisitionApprovalHistoryEntry = {
    id: `otrh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    requisitionId: existing.id,
    action,
    actorId,
    actorName,
    actorRole,
    remarks:
      cleanRemarks ||
      (decision === 'APPROVE' ? 'Approved by Head Office — Overtime Granted' : ''),
    previousStatus: existing.status,
    newStatus: nextStatus,
    actionAt: nowIso,
  };

  const next: OvertimeRequisition = {
    ...existing,
    status: nextStatus,
    overtimeGranted,
    grantedAt,
    approvedById: actorId,
    approvedByName: actorName,
    approvedBy: actorName,
    approvedAt: nowIso,
    approvalRemarks: cleanRemarks || undefined,
    returnedCount,
    updatedAt: nowIso,
    approvalHistory: [historyEntry, ...(existing.approvalHistory || [])],
  };

  return { ok: true, requisition: next, historyEntry };
}

export function filterOvertimeRequisitions(
  list: OvertimeRequisition[],
  filters: RequisitionFilterCriteria
): OvertimeRequisition[] {
  const from = String(filters.dateFrom || '').trim();
  const to = String(filters.dateTo || '').trim();
  const otDate = String(filters.overtimeDate || '').trim();
  const status = String(filters.status || 'all').trim();
  const requestedBy = String(filters.requestedBy || 'all').trim().toLowerCase();
  const search = String(filters.search || '').trim().toLowerCase();

  return list.filter((item) => {
    if (from && item.requisitionDate < from) return false;
    if (to && item.requisitionDate > to) return false;
    if (otDate && item.overtimeDate !== otDate) return false;
    if (status && status !== 'all' && item.status !== status) return false;
    if (requestedBy && requestedBy !== 'all') {
      const reqByName = String(item.requestedByName || item.requestedBy || '').toLowerCase();
      const reqById = String(item.requestedById || '').toLowerCase();
      if (reqByName !== requestedBy && reqById !== requestedBy) return false;
    }
    if (search) {
      const hay = [
        item.requisitionNumber,
        item.purpose,
        item.requestedByName,
        item.requestedByDepartment,
        item.remarks,
        item.approvalRemarks,
        item.overtimeDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export function computeOvertimeRequisitionSummary(
  list: OvertimeRequisition[]
): RequisitionSummaryCounts {
  let pendingApproval = 0;
  let approved = 0;
  let rejected = 0;
  let returnedForCorrection = 0;

  for (const r of list) {
    if (r.status === 'Pending Approval') pendingApproval++;
    else if (r.status === 'Approved') approved++;
    else if (r.status === 'Rejected') rejected++;
    else if (r.status === 'Returned for Correction') returnedForCorrection++;
  }

  return {
    total: list.length,
    pendingApproval,
    approved,
    rejected,
    returnedForCorrection,
  };
}
