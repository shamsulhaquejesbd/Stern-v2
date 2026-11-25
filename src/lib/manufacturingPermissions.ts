/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensec ERP - Shared Manufacturing Cost Visibility & Cost Sheet Authorization Engine
 * Enforces the 7 independent user-level cost visibility & cost sheet permissions
 * across both frontend views and Express backend API endpoints.
 */

export const MANUFACTURING_COST_PERMISSION_KEYS = {
  VIEW_RAW_MATERIAL_COST: 'view_raw_material_cost',
  VIEW_OPTIMUM_CONVERSION: 'view_optimum_conversion',
  VIEW_UNIT_COST_BDT: 'view_unit_cost_bdt',
  VIEW_COST_SHEET: 'view_cost_sheet',
  VIEW_BATCH_RATE: 'view_batch_rate',
  VIEW_TOTAL_COST: 'view_total_cost',
  VIEW_TOTAL_MATERIAL_ISSUE_VALUE: 'view_total_material_issue_value',
} as const;

export type ManufacturingCostPermissionKey =
  (typeof MANUFACTURING_COST_PERMISSION_KEYS)[keyof typeof MANUFACTURING_COST_PERMISSION_KEYS];

export interface ManufacturingCostPermissions {
  viewRawMaterialCost: boolean;
  viewOptimumConversion: boolean;
  viewUnitCostBdt: boolean;
  viewCostSheet: boolean;
  viewBatchRate: boolean;
  viewTotalCost: boolean;
  viewTotalMaterialIssueValue: boolean;
}

export const ALL_MANUFACTURING_COST_PERMISSIONS_OFF: ManufacturingCostPermissions = {
  viewRawMaterialCost: false,
  viewOptimumConversion: false,
  viewUnitCostBdt: false,
  viewCostSheet: false,
  viewBatchRate: false,
  viewTotalCost: false,
  viewTotalMaterialIssueValue: false,
};

export const ALL_MANUFACTURING_COST_PERMISSIONS_ON: ManufacturingCostPermissions = {
  viewRawMaterialCost: true,
  viewOptimumConversion: true,
  viewUnitCostBdt: true,
  viewCostSheet: true,
  viewBatchRate: true,
  viewTotalCost: true,
  viewTotalMaterialIssueValue: true,
};

/**
 * Resolves all 7 independent Manufacturing Costing & BOM permissions for a user.
 * Super Admin always has full visibility; all other users depend strictly on
 * each independent boolean flag stored in user.permissions.pagePermissions.manufacturing.
 */
export function resolveManufacturingCostPermissions(user: any): ManufacturingCostPermissions {
  if (!user) {
    return { ...ALL_MANUFACTURING_COST_PERMISSIONS_OFF };
  }
  if (user.role === 'Super Admin') {
    return { ...ALL_MANUFACTURING_COST_PERMISSIONS_ON };
  }

  let rawPermissions = user.permissions;
  if (typeof rawPermissions === 'string') {
    try {
      rawPermissions = JSON.parse(rawPermissions);
    } catch {
      rawPermissions = null;
    }
  }

  const pagePerms = rawPermissions?.pagePermissions;
  const mfgPerms =
    pagePerms && typeof pagePerms === 'object'
      ? pagePerms.manufacturing || pagePerms['manufacturing-costing'] || {}
      : {};

  return {
    viewRawMaterialCost: Boolean(mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_RAW_MATERIAL_COST]),
    viewOptimumConversion: Boolean(mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_OPTIMUM_CONVERSION]),
    viewUnitCostBdt: Boolean(mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_UNIT_COST_BDT]),
    viewCostSheet: Boolean(mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_COST_SHEET]),
    viewBatchRate: Boolean(mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_BATCH_RATE]),
    viewTotalCost: Boolean(mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_TOTAL_COST]),
    viewTotalMaterialIssueValue: Boolean(
      mfgPerms[MANUFACTURING_COST_PERMISSION_KEYS.VIEW_TOTAL_MATERIAL_ISSUE_VALUE]
    ),
  };
}

/**
 * Checks authorization for viewing/retrieving a Production Cost Sheet.
 */
export function authorizeCostSheetForUser(user: any): { allowed: boolean; reason?: string } {
  if (!user) {
    return {
      allowed: false,
      reason: 'Authentication required to access Production Cost Sheet.',
    };
  }
  const perms = resolveManufacturingCostPermissions(user);
  if (!perms.viewCostSheet) {
    return {
      allowed: false,
      reason:
        'Access Restricted: Your user account does not have "View Cost Sheet" permission under Manufacturing Costing & BOM.',
    };
  }
  return { allowed: true };
}

/**
 * Strips restricted cost fields from a ProductionOrder according to the user's
 * independent Batches & Orders cost visibility permissions.
 */
export function sanitizeProductionOrderForUser<T extends Record<string, any>>(
  order: T,
  user: any
): T {
  const perms = resolveManufacturingCostPermissions(user);
  const sanitized: Record<string, any> = { ...order };

  if (!perms.viewRawMaterialCost) {
    delete sanitized.rawMaterialCostBDT;
    delete sanitized.raw_material_cost_bdt;
  }

  if (!perms.viewOptimumConversion) {
    delete sanitized.conversionCostBDT;
    delete sanitized.conversion_cost_bdt;
    delete sanitized.optimumLaborCostBDT;
    delete sanitized.optimum_labor_cost_bdt;
    delete sanitized.factoryOverheadBDT;
    delete sanitized.factory_overhead_bdt;
  }

  if (!perms.viewUnitCostBdt) {
    delete sanitized.costPerUnitBDT;
    delete sanitized.cost_per_unit_bdt;
    delete sanitized.unitCostBDT;
    delete sanitized.unit_cost_bdt;
  }

  // Prevent reverse-engineering hidden cost columns from totalProductionCostBDT
  if (!perms.viewRawMaterialCost || !perms.viewOptimumConversion || !perms.viewUnitCostBdt) {
    delete sanitized.totalProductionCostBDT;
    delete sanitized.total_production_cost_bdt;
  }

  return sanitized as T;
}

/**
 * Sanitizes a MaterialIssue record (and its line items) according to the 3
 * independent Issue Raw Materials cost visibility permissions.
 */
export function sanitizeMaterialIssueRecordForUser<T extends Record<string, any>>(
  issue: T,
  user: any
): T {
  const perms = resolveManufacturingCostPermissions(user);
  const sanitized: Record<string, any> = { ...issue };

  if (Array.isArray(sanitized.items)) {
    sanitized.items = sanitized.items.map((item: Record<string, any>) => {
      const nextItem: Record<string, any> = { ...item };
      if (!perms.viewBatchRate) {
        delete nextItem.unitCostBDT;
        delete nextItem.unitCost;
        delete nextItem.unitPurchaseRate;
        delete nextItem.unit_cost_bdt;
      }
      if (!perms.viewTotalCost) {
        delete nextItem.totalMaterialCostBDT;
        delete nextItem.totalCostBDT;
        delete nextItem.totalCost;
        delete nextItem.total_material_cost_bdt;
      }
      return nextItem;
    });
  }

  if (!perms.viewTotalMaterialIssueValue) {
    delete sanitized.totalMaterialCostBDT;
    delete sanitized.totalMaterialCost;
    delete sanitized.total_material_cost_bdt;
  }

  return sanitized as T;
}

/**
 * Sanitizes the full Issue Raw Materials modal API payload according to
 * View Batch Rate, View Total Cost, and View Total Material Issue Value.
 */
export function sanitizeMaterialIssueContextForUser(
  payload: {
    order: Record<string, any>;
    existingIssue?: Record<string, any> | null;
    items: Record<string, any>[];
    batches: Record<string, any>[];
    rawMaterials: Record<string, any>[];
    totalMaterialIssueValue?: number;
  },
  user: any
) {
  const perms = resolveManufacturingCostPermissions(user);

  const sanitizedOrder = sanitizeProductionOrderForUser(payload.order, user);
  const sanitizedExistingIssue = payload.existingIssue
    ? sanitizeMaterialIssueRecordForUser(payload.existingIssue, user)
    : null;

  const sanitizedItems = (payload.items || []).map((item) => {
    const nextItem: Record<string, any> = { ...item };
    if (!perms.viewBatchRate) {
      delete nextItem.unitCost;
      delete nextItem.unitCostBDT;
      delete nextItem.unitPurchaseRate;
    }
    if (!perms.viewTotalCost) {
      delete nextItem.totalCost;
      delete nextItem.totalCostBDT;
      delete nextItem.totalMaterialCostBDT;
    }
    return nextItem;
  });

  const sanitizedBatches = (payload.batches || []).map((batch) => {
    const nextBatch: Record<string, any> = { ...batch };
    if (!perms.viewBatchRate) {
      delete nextBatch.unitPurchaseRate;
      delete nextBatch.unit_purchase_rate;
      delete nextBatch.unitCostBDT;
    }
    return nextBatch;
  });

  const sanitizedRawMaterials = (payload.rawMaterials || []).map((rm) => {
    const nextRm: Record<string, any> = { ...rm };
    if (!perms.viewBatchRate) {
      delete nextRm.lastPurchaseUnitCostBDT;
      delete nextRm.standardCostBDT;
      delete nextRm.unitPurchaseRate;
    }
    return nextRm;
  });

  const result: {
    permissions: ManufacturingCostPermissions;
    order: Record<string, any>;
    existingIssue: Record<string, any> | null;
    items: Record<string, any>[];
    batches: Record<string, any>[];
    rawMaterials: Record<string, any>[];
    totalMaterialIssueValue?: number;
  } = {
    permissions: perms,
    order: sanitizedOrder,
    existingIssue: sanitizedExistingIssue,
    items: sanitizedItems,
    batches: sanitizedBatches,
    rawMaterials: sanitizedRawMaterials,
  };

  if (perms.viewTotalMaterialIssueValue && payload.totalMaterialIssueValue !== undefined) {
    result.totalMaterialIssueValue = payload.totalMaterialIssueValue;
  }

  return result;
}

/**
 * Helper to attach requester identity headers for backend/API authorization verification.
 */
export function getManufacturingAuthHeaders(user: any): Record<string, string> {
  if (!user) return {};
  const headers: Record<string, string> = {};
  if (user.id) headers['x-user-id'] = String(user.id);
  if (user.userId) headers['x-user-code'] = String(user.userId);
  if (user.email) headers['x-user-email'] = String(user.email);
  return headers;
}

export const BOM_VISIBILITY_PERMISSION_KEYS = {
  VIEW_BOM_EXPORT: 'view_bom_export',
  VIEW_BOM_UPLOAD: 'view_bom_upload',
} as const;

export interface BomVisibilityPermissions {
  viewBomExport: boolean;
  viewBomUpload: boolean;
}

export function resolveBomVisibilityPermissions(user: any): BomVisibilityPermissions {
  if (!user) {
    return { viewBomExport: false, viewBomUpload: false };
  }
  if (user.role === 'Super Admin') {
    return { viewBomExport: true, viewBomUpload: true };
  }

  let rawPermissions = user.permissions;
  if (typeof rawPermissions === 'string') {
    try {
      rawPermissions = JSON.parse(rawPermissions);
    } catch {
      rawPermissions = null;
    }
  }

  const pagePerms = rawPermissions?.pagePermissions;
  const mfgPerms =
    pagePerms && typeof pagePerms === 'object'
      ? pagePerms.manufacturing || {}
      : {};

  return {
    viewBomExport: Boolean(mfgPerms[BOM_VISIBILITY_PERMISSION_KEYS.VIEW_BOM_EXPORT]),
    viewBomUpload: Boolean(mfgPerms[BOM_VISIBILITY_PERMISSION_KEYS.VIEW_BOM_UPLOAD]),
  };
}

