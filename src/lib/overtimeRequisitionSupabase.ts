import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OvertimeRequisition,
  OvertimeRequisitionApprovalHistoryEntry,
  OvertimeRequisitionPurposeItem,
} from '../types/overtime.ts';
import {
  applyRequisitionDecision,
  applyRequisitionResubmission,
  buildCreatedRequisition,
  canUserApproveRequisition,
  doesActorMatchRequester,
  normalizeRequisitionPurposes,
  validateOvertimeRequisitionPayload,
  type RequisitionDecisionAction,
} from './overtimeRequisitionEngine.ts';
import { resolveOvertimePermissions } from './overtimePermissions.ts';
import { isMissingSupabaseTableError } from './supabase.ts';

const OVERTIME_REQUISITIONS_SETTINGS_ID = 'overtime_requisitions';

const sortRequisitionsDesc = (records: OvertimeRequisition[]): OvertimeRequisition[] =>
  [...records].sort((a, b) =>
    String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt))
  );

const normalizeStoredRequisition = (raw: any): OvertimeRequisition | null => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const purposes = Array.isArray(raw.purposes)
    ? normalizeRequisitionPurposes(raw.purposes, id)
    : Array.isArray(raw.purposes_json)
    ? normalizeRequisitionPurposes(raw.purposes_json, id)
    : [];
  const approvalHistory: OvertimeRequisitionApprovalHistoryEntry[] = Array.isArray(raw.approvalHistory)
    ? raw.approvalHistory
        .filter((h: any) => h && typeof h === 'object')
        .map((h: any, idx: number) => ({
          id: String(h.id || `otrh-${id}-${idx}`),
          requisitionId: String(h.requisitionId || id),
          action: (h.action || 'SUBMITTED') as OvertimeRequisitionApprovalHistoryEntry['action'],
          actorId: h.actorId ? String(h.actorId) : undefined,
          actorName: String(h.actorName || 'System'),
          actorRole: h.actorRole ? String(h.actorRole) : undefined,
          remarks: h.remarks ? String(h.remarks) : undefined,
          previousStatus: h.previousStatus || undefined,
          newStatus: (h.newStatus || raw.status || 'Pending Approval') as OvertimeRequisition['status'],
          actionAt: String(h.actionAt || raw.submittedAt || raw.createdAt || new Date().toISOString()),
        }))
    : [];
  const submittedAt = String(
    raw.submittedAt || raw.submitted_at || raw.createdAt || raw.created_at || new Date().toISOString()
  );
  return {
    id,
    requisitionNumber: String(raw.requisitionNumber || raw.requisition_number || id),
    requisitionDate: String(raw.requisitionDate || raw.requisition_date || submittedAt).slice(0, 10),
    overtimeDate: String(raw.overtimeDate || raw.overtime_date || '').slice(0, 10),
    requiredWorkers: Number(raw.requiredWorkers ?? raw.required_workers) || 0,
    requestedHours: Number(raw.requestedHours ?? raw.requested_hours) || 0,
    purpose:
      String(raw.purpose || '').trim() ||
      purposes.map((p) => p.purposeName).join(', '),
    purposes,
    remarks: raw.remarks ? String(raw.remarks) : undefined,
    requestedById: String(raw.requestedById || raw.requested_by_id || ''),
    requestedByName: String(raw.requestedByName || raw.requested_by_name || raw.requestedBy || raw.requested_by || ''),
    requestedBy: String(raw.requestedBy || raw.requested_by || raw.requestedByName || raw.requested_by_name || ''),
    requestedByRole: raw.requestedByRole || raw.requested_by_role || undefined,
    requestedByDepartment: raw.requestedByDepartment || raw.requested_by_department || undefined,
    submittedAt,
    status: (raw.status || 'Pending Approval') as OvertimeRequisition['status'],
    overtimeGranted: Boolean(raw.overtimeGranted ?? raw.overtime_granted),
    grantedAt: raw.grantedAt || raw.granted_at || undefined,
    approvedById: raw.approvedById || raw.approved_by_id || undefined,
    approvedByName: raw.approvedByName || raw.approved_by_name || undefined,
    approvedBy: raw.approvedBy || raw.approved_by || raw.approvedByName || raw.approved_by_name || undefined,
    approvedAt: raw.approvedAt || raw.approved_at || undefined,
    approvalRemarks: raw.approvalRemarks || raw.approval_remarks || undefined,
    returnedCount: Number(raw.returnedCount ?? raw.returned_count) || 0,
    lastResubmittedAt: raw.lastResubmittedAt || raw.last_resubmitted_at || undefined,
    approvalHistory,
    createdAt: String(raw.createdAt || raw.created_at || submittedAt),
    updatedAt: raw.updatedAt || raw.updated_at || undefined,
  };
};

async function loadFromSystemSettings(
  sb: SupabaseClient
): Promise<{ records: OvertimeRequisition[]; error?: string }> {
  const { data, error } = await sb
    .from('system_settings')
    .select('id, settings_json, updated_at')
    .eq('id', OVERTIME_REQUISITIONS_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    return { records: [], error: error.message || 'Failed to load overtime requisitions from Supabase.' };
  }

  const rawRecords = Array.isArray((data as any)?.settings_json?.records)
    ? (data as any).settings_json.records
    : [];
  const byId = new Map<string, OvertimeRequisition>();
  for (const item of rawRecords) {
    const normalized = normalizeStoredRequisition(item);
    if (normalized) byId.set(normalized.id, normalized);
  }
  return { records: sortRequisitionsDesc(Array.from(byId.values())) };
}

async function saveToSystemSettings(
  sb: SupabaseClient,
  records: OvertimeRequisition[],
  updatedBy: string,
  verifyRecord?: { id: string; expectedStatus?: OvertimeRequisition['status']; expectedUpdatedAt?: string }
): Promise<{ ok: boolean; error?: string }> {
  const byId = new Map<string, OvertimeRequisition>();
  for (const rec of records) {
    const normalized = normalizeStoredRequisition(rec);
    if (normalized) byId.set(normalized.id, normalized);
  }
  const deduped = sortRequisitionsDesc(Array.from(byId.values()));
  const nowIso = new Date().toISOString();

  const { error: upsertErr } = await sb
    .from('system_settings')
    .upsert(
      {
        id: OVERTIME_REQUISITIONS_SETTINGS_ID,
        software_name: 'Overtime Requisitions',
        logo_data_url: null,
        branding_json: { type: 'overtime_requisitions', version: 1 },
        settings_json: { records: deduped },
        updated_by: updatedBy || 'System',
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

  if (upsertErr) {
    return { ok: false, error: upsertErr.message || 'Failed to save overtime requisition to Supabase.' };
  }

  const verified = await loadFromSystemSettings(sb);
  if (verified.error) {
    return { ok: false, error: `Supabase save verification failed: ${verified.error}` };
  }
  if (verifyRecord) {
    const found = verified.records.find((r) => r.id === verifyRecord.id);
    if (!found) {
      return { ok: false, error: 'Supabase write could not be confirmed on read-back.' };
    }
    if (verifyRecord.expectedStatus && found.status !== verifyRecord.expectedStatus) {
      return { ok: false, error: 'Supabase write verification status mismatch.' };
    }
    if (verifyRecord.expectedUpdatedAt && found.updatedAt !== verifyRecord.expectedUpdatedAt) {
      return { ok: false, error: 'Supabase write verification timestamp mismatch.' };
    }
  }
  return { ok: true };
}

export async function loadOvertimeRequisitionsDirect(sb: SupabaseClient): Promise<{
  requisitions: OvertimeRequisition[];
  primaryTableAvailable: boolean;
  error?: string;
}> {
  const [
    { data: reqRows, error: reqErr },
    { data: purposeRows },
    { data: histRows },
  ] = await Promise.all([
    sb.from('overtime_requisitions').select('*').order('submitted_at', { ascending: false }),
    sb.from('overtime_requisition_purposes').select('*').order('created_at', { ascending: true }),
    sb.from('overtime_requisition_approval_history').select('*').order('action_at', { ascending: false }),
  ]);

  if (!reqErr && Array.isArray(reqRows)) {
    const purposesByReq = new Map<string, OvertimeRequisitionPurposeItem[]>();
    if (Array.isArray(purposeRows)) {
      for (const p of purposeRows) {
        const reqId = String(p.requisition_id || '');
        const arr = purposesByReq.get(reqId) || [];
        arr.push({
          id: String(p.id),
          requisitionId: reqId,
          payrollPurposeId: p.payroll_purpose_id ? String(p.payroll_purpose_id) : undefined,
          purposeName: String(p.purpose_name || ''),
          isCustom: Boolean(p.is_custom),
          createdAt: p.created_at || undefined,
        });
        purposesByReq.set(reqId, arr);
      }
    }

    const historyByReq = new Map<string, OvertimeRequisitionApprovalHistoryEntry[]>();
    if (Array.isArray(histRows)) {
      for (const h of histRows) {
        const reqId = String(h.requisition_id || '');
        const arr = historyByReq.get(reqId) || [];
        arr.push({
          id: String(h.id),
          requisitionId: reqId,
          action: (h.action || 'SUBMITTED') as OvertimeRequisitionApprovalHistoryEntry['action'],
          actorId: h.actor_id ? String(h.actor_id) : undefined,
          actorName: String(h.actor_name || 'System'),
          actorRole: h.actor_role ? String(h.actor_role) : undefined,
          remarks: h.remarks ? String(h.remarks) : undefined,
          previousStatus: h.previous_status || undefined,
          newStatus: (h.new_status || 'Pending Approval') as OvertimeRequisition['status'],
          actionAt: h.action_at || new Date().toISOString(),
        });
        historyByReq.set(reqId, arr);
      }
    }

    const mapped: OvertimeRequisition[] = reqRows.map((r: any) => {
      const id = String(r.id);
      const fallbackPurposes = Array.isArray(r.purposes_json)
        ? normalizeRequisitionPurposes(r.purposes_json, id)
        : [];
      const purposes = purposesByReq.get(id) || fallbackPurposes;
      return {
        id,
        requisitionNumber: String(r.requisition_number || id),
        requisitionDate: String(r.requisition_date || '').slice(0, 10),
        overtimeDate: String(r.overtime_date || '').slice(0, 10),
        requiredWorkers: Number(r.required_workers) || 0,
        requestedHours: Number(r.requested_hours) || 0,
        purpose: String(r.purpose || '').trim() || purposes.map((p) => p.purposeName).join(', '),
        purposes,
        remarks: r.remarks || undefined,
        requestedById: String(r.requested_by_id || ''),
        requestedByName: String(r.requested_by_name || r.requested_by || ''),
        requestedBy: String(r.requested_by || r.requested_by_name || ''),
        requestedByRole: r.requested_by_role || undefined,
        requestedByDepartment: r.requested_by_department || undefined,
        submittedAt: r.submitted_at || r.created_at || new Date().toISOString(),
        status: (r.status || 'Pending Approval') as OvertimeRequisition['status'],
        overtimeGranted: Boolean(r.overtime_granted),
        grantedAt: r.granted_at || undefined,
        approvedById: r.approved_by_id || undefined,
        approvedByName: r.approved_by_name || undefined,
        approvedBy: r.approved_by || r.approved_by_name || undefined,
        approvedAt: r.approved_at || undefined,
        approvalRemarks: r.approval_remarks || undefined,
        returnedCount: Number(r.returned_count) || 0,
        lastResubmittedAt: r.last_resubmitted_at || undefined,
        approvalHistory: historyByReq.get(id) || [],
        createdAt: r.created_at || r.submitted_at || new Date().toISOString(),
        updatedAt: r.updated_at || undefined,
      };
    });

    return {
      requisitions: sortRequisitionsDesc(mapped),
      primaryTableAvailable: true,
    };
  }

  if (isMissingSupabaseTableError(reqErr)) {
    const settingsRes = await loadFromSystemSettings(sb);
    if (settingsRes.error) {
      return { requisitions: [], primaryTableAvailable: false, error: settingsRes.error };
    }
    return { requisitions: settingsRes.records, primaryTableAvailable: false };
  }

  return {
    requisitions: [],
    primaryTableAvailable: false,
    error: reqErr?.message || 'Failed to query overtime_requisitions in Supabase.',
  };
}

export async function refreshOvertimeRequisitionsDirect(
  sb: SupabaseClient,
  actor: any
): Promise<{
  success: boolean;
  requisitions: OvertimeRequisition[];
  grantedRequisitions: OvertimeRequisition[];
  error?: string;
}> {
  const loaded = await loadOvertimeRequisitionsDirect(sb);
  if (loaded.error) {
    return {
      success: false,
      requisitions: [],
      grantedRequisitions: [],
      error: loaded.error,
    };
  }
  const canApprove = canUserApproveRequisition(actor);
  const scoped = canApprove
    ? loaded.requisitions
    : loaded.requisitions.filter((r) => doesActorMatchRequester(r, actor));
  const granted = loaded.requisitions.filter((r) => r.status === 'Approved' && r.overtimeGranted);
  return {
    success: true,
    requisitions: scoped,
    grantedRequisitions: granted,
  };
}

async function insertIntoPrimaryTablesDirect(
  sb: SupabaseClient,
  reqRecord: OvertimeRequisition
): Promise<{ ok: boolean; missingTable?: boolean; isUniqueConflict?: boolean; error?: string }> {
  const { data: insertedRow, error: reqErr } = await sb
    .from('overtime_requisitions')
    .insert({
      id: reqRecord.id,
      requisition_number: reqRecord.requisitionNumber,
      requisition_date: reqRecord.requisitionDate,
      overtime_date: reqRecord.overtimeDate,
      required_workers: reqRecord.requiredWorkers,
      requested_hours: reqRecord.requestedHours,
      purpose: reqRecord.purpose,
      purposes_json: reqRecord.purposes,
      remarks: reqRecord.remarks || null,
      requested_by_id: reqRecord.requestedById,
      requested_by_name: reqRecord.requestedByName,
      requested_by: reqRecord.requestedBy,
      requested_by_role: reqRecord.requestedByRole || null,
      requested_by_department: reqRecord.requestedByDepartment || null,
      submitted_at: reqRecord.submittedAt,
      status: reqRecord.status,
      overtime_granted: Boolean(reqRecord.overtimeGranted),
      granted_at: reqRecord.grantedAt || null,
      approved_by_id: reqRecord.approvedById || null,
      approved_by_name: reqRecord.approvedByName || null,
      approved_by: reqRecord.approvedBy || null,
      approved_at: reqRecord.approvedAt || null,
      approval_remarks: reqRecord.approvalRemarks || null,
      returned_count: Number(reqRecord.returnedCount) || 0,
      last_resubmitted_at: reqRecord.lastResubmittedAt || null,
      created_at: reqRecord.createdAt,
      updated_at: reqRecord.updatedAt || reqRecord.createdAt,
    })
    .select('id')
    .maybeSingle();

  if (reqErr) {
    const code = String(reqErr.code || '').trim();
    return {
      ok: false,
      missingTable: isMissingSupabaseTableError(reqErr),
      isUniqueConflict: code === '23505',
      error: reqErr.message || 'Failed to insert overtime requisition into Supabase.',
    };
  }

  if (!insertedRow?.id) {
    return {
      ok: false,
      error: 'Supabase insert completed without returning a persisted requisition record (check RLS policies).',
    };
  }

  if (reqRecord.purposes.length > 0) {
    const { error: purposeErr } = await sb.from('overtime_requisition_purposes').upsert(
      reqRecord.purposes.map((p) => ({
        id: p.id,
        requisition_id: reqRecord.id,
        payroll_purpose_id: p.payrollPurposeId || null,
        purpose_name: p.purposeName,
        is_custom: Boolean(p.isCustom),
        created_at: p.createdAt || reqRecord.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (purposeErr && !isMissingSupabaseTableError(purposeErr)) {
      await sb.from('overtime_requisitions').delete().eq('id', reqRecord.id);
      return {
        ok: false,
        error: `Failed to save overtime_requisition_purposes: ${purposeErr.message}`,
      };
    }
  }

  if (reqRecord.approvalHistory.length > 0) {
    const { error: histErr } = await sb
      .from('overtime_requisition_approval_history')
      .upsert(
        reqRecord.approvalHistory.map((h) => ({
          id: h.id,
          requisition_id: reqRecord.id,
          action: h.action,
          actor_id: h.actorId || null,
          actor_name: h.actorName,
          actor_role: h.actorRole || null,
          remarks: h.remarks || null,
          previous_status: h.previousStatus || null,
          new_status: h.newStatus,
          action_at: h.actionAt,
        })),
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (histErr && !isMissingSupabaseTableError(histErr)) {
      await sb.from('overtime_requisitions').delete().eq('id', reqRecord.id);
      return {
        ok: false,
        error: `Failed to save overtime_requisition_approval_history: ${histErr.message}`,
      };
    }
  }

  return { ok: true };
}

export async function createOvertimeRequisitionDirect(
  sb: SupabaseClient,
  payload: {
    overtimeDate: string;
    requiredWorkers: number;
    requestedHours: number;
    purposes: Array<Partial<OvertimeRequisitionPurposeItem> | string>;
    remarks?: string;
  },
  actor: any
): Promise<{ success: boolean; dbSynced: boolean; requisition?: OvertimeRequisition; error?: string }> {
  const perms = resolveOvertimePermissions(actor);
  if (!actor || (!perms.viewRequisition && actor.role !== 'Super Admin')) {
    return {
      success: false,
      dbSynced: false,
      error: 'Forbidden: "Overtime Requisition" permission is required to submit a requisition.',
    };
  }

  const validation = validateOvertimeRequisitionPayload(payload);
  if (!validation.valid) {
    return {
      success: false,
      dbSynced: false,
      error: validation.error,
    };
  }

  const actorLabel = String(actor?.name || actor?.email || actor?.id || 'System');

  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await loadOvertimeRequisitionsDirect(sb);
    if (loaded.error) {
      return { success: false, dbSynced: false, error: loaded.error };
    }

    const created = buildCreatedRequisition({
      existingRequisitions: loaded.requisitions,
      overtimeDate: validation.overtimeDate!,
      requiredWorkers: validation.requiredWorkers!,
      requestedHours: validation.requestedHours!,
      purposes: validation.purposes!,
      remarks: validation.remarks,
      actor,
    });

    if (loaded.primaryTableAvailable) {
      const primaryRes = await insertIntoPrimaryTablesDirect(sb, created);
      if (primaryRes.ok) {
        return { success: true, dbSynced: true, requisition: created };
      }
      if (primaryRes.isUniqueConflict && attempt === 0) {
        continue;
      }
      if (primaryRes.missingTable) {
        const fallbackRes = await saveToSystemSettings(
          sb,
          [created, ...loaded.requisitions.filter((r) => r.id !== created.id)],
          actorLabel,
          { id: created.id, expectedStatus: created.status }
        );
        if (!fallbackRes.ok) {
          return {
            success: false,
            dbSynced: false,
            error: fallbackRes.error || 'Failed to save overtime requisition in Supabase.',
          };
        }
        return { success: true, dbSynced: true, requisition: created };
      }
      return {
        success: false,
        dbSynced: false,
        error: primaryRes.error || 'Failed to insert overtime requisition into Supabase.',
      };
    }

    const fallbackRes = await saveToSystemSettings(
      sb,
      [created, ...loaded.requisitions.filter((r) => r.id !== created.id)],
      actorLabel,
      { id: created.id, expectedStatus: created.status }
    );
    if (!fallbackRes.ok) {
      return {
        success: false,
        dbSynced: false,
        error: fallbackRes.error || 'Failed to save overtime requisition in Supabase.',
      };
    }
    return { success: true, dbSynced: true, requisition: created };
  }

  return {
    success: false,
    dbSynced: false,
    error: 'Could not generate a unique requisition number in Supabase. Please retry.',
  };
}

export async function updateOvertimeRequisitionDirect(
  sb: SupabaseClient,
  id: string,
  payload: {
    overtimeDate: string;
    requiredWorkers: number;
    requestedHours: number;
    purposes: Array<Partial<OvertimeRequisitionPurposeItem> | string>;
    remarks?: string;
  },
  actor: any
): Promise<{ success: boolean; dbSynced: boolean; requisition?: OvertimeRequisition; error?: string }> {
  const perms = resolveOvertimePermissions(actor);
  if (!actor || (!perms.viewRequisition && actor.role !== 'Super Admin')) {
    return {
      success: false,
      dbSynced: false,
      error: 'Forbidden: "Overtime Requisition" permission is required to edit returned requisitions.',
    };
  }

  const validation = validateOvertimeRequisitionPayload(payload);
  if (!validation.valid) {
    return { success: false, dbSynced: false, error: validation.error };
  }

  const loaded = await loadOvertimeRequisitionsDirect(sb);
  if (loaded.error) {
    return { success: false, dbSynced: false, error: loaded.error };
  }

  const existing = loaded.requisitions.find((r) => r.id === id);
  if (!existing) {
    return { success: false, dbSynced: false, error: `Overtime Requisition "${id}" not found.` };
  }

  const result = applyRequisitionResubmission(
    existing,
    {
      overtimeDate: validation.overtimeDate!,
      requiredWorkers: validation.requiredWorkers!,
      requestedHours: validation.requestedHours!,
      purposes: validation.purposes!,
      remarks: validation.remarks,
    },
    actor
  );

  if ('error' in result) {
    return { success: false, dbSynced: false, error: result.error };
  }

  const actorLabel = String(actor?.name || actor?.email || actor?.id || 'System');

  if (loaded.primaryTableAvailable) {
    const { data: updatedRow, error: updErr } = await sb
      .from('overtime_requisitions')
      .update({
        overtime_date: result.requisition.overtimeDate,
        required_workers: result.requisition.requiredWorkers,
        requested_hours: result.requisition.requestedHours,
        purpose: result.requisition.purpose,
        purposes_json: result.requisition.purposes,
        remarks: result.requisition.remarks || null,
        status: result.requisition.status,
        overtime_granted: false,
        granted_at: null,
        last_resubmitted_at: result.requisition.lastResubmittedAt || result.requisition.updatedAt,
        updated_at: result.requisition.updatedAt,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (updErr) {
      if (isMissingSupabaseTableError(updErr)) {
        const fallbackRes = await saveToSystemSettings(
          sb,
          loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
          actorLabel,
          { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
        );
        if (!fallbackRes.ok) {
          return { success: false, dbSynced: false, error: fallbackRes.error };
        }
        return { success: true, dbSynced: true, requisition: result.requisition };
      }
      return { success: false, dbSynced: false, error: updErr.message };
    }

    if (!updatedRow?.id) {
      return {
        success: false,
        dbSynced: false,
        error: 'Supabase update did not modify any requisition row (check RLS policies or concurrent edits).',
      };
    }

    const { error: delPurpErr } = await sb.from('overtime_requisition_purposes').delete().eq('requisition_id', id);
    if (delPurpErr && !isMissingSupabaseTableError(delPurpErr)) {
      return { success: false, dbSynced: false, error: delPurpErr.message };
    }

    if (result.requisition.purposes.length > 0) {
      const { error: insPurpErr } = await sb.from('overtime_requisition_purposes').insert(
        result.requisition.purposes.map((p) => ({
          id: p.id,
          requisition_id: id,
          payroll_purpose_id: p.payrollPurposeId || null,
          purpose_name: p.purposeName,
          is_custom: Boolean(p.isCustom),
          created_at: p.createdAt || new Date().toISOString(),
        }))
      );
      if (insPurpErr && !isMissingSupabaseTableError(insPurpErr)) {
        return { success: false, dbSynced: false, error: insPurpErr.message };
      }
    }

    const { error: insHistErr } = await sb.from('overtime_requisition_approval_history').insert({
      id: result.historyEntry.id,
      requisition_id: id,
      action: result.historyEntry.action,
      actor_id: result.historyEntry.actorId || null,
      actor_name: result.historyEntry.actorName,
      actor_role: result.historyEntry.actorRole || null,
      remarks: result.historyEntry.remarks || null,
      previous_status: result.historyEntry.previousStatus || null,
      new_status: result.historyEntry.newStatus,
      action_at: result.historyEntry.actionAt,
    });
    if (insHistErr && !isMissingSupabaseTableError(insHistErr)) {
      return { success: false, dbSynced: false, error: insHistErr.message };
    }

    return { success: true, dbSynced: true, requisition: result.requisition };
  }

  const fallbackRes = await saveToSystemSettings(
    sb,
    loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
    actorLabel,
    { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
  );
  if (!fallbackRes.ok) {
    return { success: false, dbSynced: false, error: fallbackRes.error };
  }
  return { success: true, dbSynced: true, requisition: result.requisition };
}

export async function decideOvertimeRequisitionDirect(
  sb: SupabaseClient,
  id: string,
  decision: RequisitionDecisionAction,
  remarks: string | undefined,
  actor: any
): Promise<{ success: boolean; dbSynced: boolean; requisition?: OvertimeRequisition; error?: string }> {
  if (!canUserApproveRequisition(actor)) {
    return {
      success: false,
      dbSynced: false,
      error: 'Forbidden: "Overtime Requisition Approval" permission is required for Head Office decisions.',
    };
  }

  const loaded = await loadOvertimeRequisitionsDirect(sb);
  if (loaded.error) {
    return { success: false, dbSynced: false, error: loaded.error };
  }

  const existing = loaded.requisitions.find((r) => r.id === id);
  if (!existing) {
    return { success: false, dbSynced: false, error: `Overtime Requisition "${id}" not found.` };
  }

  const result = applyRequisitionDecision(existing, decision, actor, remarks || '');
  if ('error' in result) {
    return { success: false, dbSynced: false, error: result.error };
  }

  const actorLabel = String(actor?.name || actor?.email || actor?.id || 'System');

  if (loaded.primaryTableAvailable) {
    const { data: updatedRow, error: updErr } = await sb
      .from('overtime_requisitions')
      .update({
        status: result.requisition.status,
        overtime_granted: result.requisition.overtimeGranted,
        granted_at: result.requisition.grantedAt || null,
        approved_by_id: result.requisition.approvedById || null,
        approved_by_name: result.requisition.approvedByName || null,
        approved_by: result.requisition.approvedBy || null,
        approved_at: result.requisition.approvedAt || null,
        approval_remarks: result.requisition.approvalRemarks || null,
        returned_count: result.requisition.returnedCount || 0,
        updated_at: result.requisition.updatedAt,
      })
      .eq('id', id)
      .eq('status', 'Pending Approval')
      .select('id')
      .maybeSingle();

    if (updErr) {
      if (isMissingSupabaseTableError(updErr)) {
        const fallbackRes = await saveToSystemSettings(
          sb,
          loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
          actorLabel,
          { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
        );
        if (!fallbackRes.ok) {
          return { success: false, dbSynced: false, error: fallbackRes.error };
        }
        return { success: true, dbSynced: true, requisition: result.requisition };
      }
      return { success: false, dbSynced: false, error: updErr.message };
    }

    if (!updatedRow?.id) {
      return {
        success: false,
        dbSynced: false,
        error: 'Decision could not be persisted because the requisition status changed or RLS blocked the update.',
      };
    }

    const { error: histErr } = await sb.from('overtime_requisition_approval_history').insert({
      id: result.historyEntry.id,
      requisition_id: id,
      action: result.historyEntry.action,
      actor_id: result.historyEntry.actorId || null,
      actor_name: result.historyEntry.actorName,
      actor_role: result.historyEntry.actorRole || null,
      remarks: result.historyEntry.remarks || null,
      previous_status: result.historyEntry.previousStatus || null,
      new_status: result.historyEntry.newStatus,
      action_at: result.historyEntry.actionAt,
    });
    if (histErr && !isMissingSupabaseTableError(histErr)) {
      return { success: false, dbSynced: false, error: histErr.message };
    }

    return { success: true, dbSynced: true, requisition: result.requisition };
  }

  const fallbackRes = await saveToSystemSettings(
    sb,
    loaded.requisitions.map((r) => (r.id === id ? result.requisition : r)),
    actorLabel,
    { id, expectedStatus: result.requisition.status, expectedUpdatedAt: result.requisition.updatedAt }
  );
  if (!fallbackRes.ok) {
    return { success: false, dbSynced: false, error: fallbackRes.error };
  }
  return { success: true, dbSynced: true, requisition: result.requisition };
}
