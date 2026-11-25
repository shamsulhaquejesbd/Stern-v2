/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared System Settings Authorization Helpers
 * Enforced consistently across UI components and Express backend endpoints.
 */

function extractPermissions(user: any): {
  pagePermissions?: Record<string, Record<string, boolean>>;
  allowedModules: string[];
  canManageUsersAndPermissions: boolean;
} {
  let raw = user?.permissions;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  const pagePermissions =
    raw?.pagePermissions && typeof raw.pagePermissions === 'object'
      ? raw.pagePermissions
      : undefined;

  const allowedModules = Array.isArray(raw?.allowedModules)
    ? raw.allowedModules.map((m: any) => String(m))
    : [];

  const canManageUsersAndPermissions = Boolean(raw?.features?.canManageUsersAndPermissions);

  return { pagePermissions, allowedModules, canManageUsersAndPermissions };
}

export function isActiveErpUser(user: any): boolean {
  if (!user || !user.id || user.id === 'guest') return false;
  if (user.status === 'Blocked' || user.status === 'Inactive') return false;
  return true;
}

export function canViewSystemSettings(user: any): boolean {
  if (!isActiveErpUser(user)) return false;
  if (user.role === 'Super Admin') return true;

  const { pagePermissions, allowedModules } = extractPermissions(user);
  const settingsPerms = pagePermissions?.['settings'];
  if (settingsPerms && typeof settingsPerms === 'object') {
    if (settingsPerms.view !== undefined) {
      return Boolean(settingsPerms.view);
    }
    if (settingsPerms.edit_branding) {
      return true;
    }
  }

  return allowedModules.includes('settings');
}

export function canModifySystemBranding(user: any): boolean {
  if (!isActiveErpUser(user)) return false;
  if (user.role === 'Super Admin') return true;

  const { pagePermissions, canManageUsersAndPermissions } = extractPermissions(user);
  const settingsPerms = pagePermissions?.['settings'];
  if (settingsPerms && typeof settingsPerms === 'object') {
    if (settingsPerms.edit_branding !== undefined) {
      return Boolean(settingsPerms.edit_branding);
    }
  }

  return canManageUsersAndPermissions && canViewSystemSettings(user);
}
