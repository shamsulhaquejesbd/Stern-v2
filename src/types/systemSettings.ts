/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized System Configuration & Branding Types
 * Designed to scale cleanly as new system-wide configuration sections are added.
 */

export const DEFAULT_SOFTWARE_NAME = 'Ensec';
export const DEFAULT_SOFTWARE_TAGLINE = 'Lithium Battery BD';

export interface SystemBrandingConfig {
  softwareName: string;
  logoDataUrl: string | null;
  logoFileName?: string | null;
  logoMimeType?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface SystemSettingsConfig {
  id: string;
  branding: SystemBrandingConfig;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface SystemSettingsDbStatus {
  synced: boolean;
  status: 'synced' | 'table_missing' | 'rls_blocked' | 'error' | 'not_configured' | 'unknown';
  error?: string | null;
  sqlFix?: string | null;
}

export const SYSTEM_SETTINGS_TABLE_SQL = `-- Run this in your Supabase SQL Editor to enable persistent database storage for Settings -> System Branding:
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  software_name TEXT NOT NULL DEFAULT 'Ensec',
  logo_data_url TEXT,
  branding_json JSONB NOT NULL DEFAULT '{"softwareName":"Ensec","logoDataUrl":null}'::jsonb,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all system_settings" ON public.system_settings;
CREATE POLICY "Allow public all system_settings" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.system_settings TO postgres, anon, authenticated, service_role;

INSERT INTO public.system_settings (id, software_name, branding_json)
VALUES ('default', 'Ensec', '{"softwareName":"Ensec","logoDataUrl":null}'::jsonb)
ON CONFLICT (id) DO NOTHING;`;

export const DEFAULT_SYSTEM_BRANDING: SystemBrandingConfig = {
  softwareName: DEFAULT_SOFTWARE_NAME,
  logoDataUrl: null,
  logoFileName: null,
  logoMimeType: null,
  updatedAt: null,
  updatedBy: null,
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
  id: 'default',
  branding: { ...DEFAULT_SYSTEM_BRANDING },
  updatedAt: null,
  updatedBy: null,
};

export const ALLOWED_LOGO_DATA_URL_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|svg\+xml|gif|bmp|avif|ico|x-icon|vnd\.microsoft\.icon)(?:;[a-z0-9._+-]+=[^;,]+)*;base64,[A-Za-z0-9+/=]+$/i;

export const MAX_LOGO_DATA_URL_LENGTH = 5 * 1024 * 1024; // ~3.7MB raw file

export function cleanBrandingLogoDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^data:image\//i.test(trimmed)) {
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed;
}

export function isValidBrandingLogoDataUrl(value: unknown): value is string {
  const cleaned = cleanBrandingLogoDataUrl(value);
  if (!cleaned || cleaned.length > MAX_LOGO_DATA_URL_LENGTH) return false;
  if (ALLOWED_LOGO_DATA_URL_REGEX.test(cleaned)) return true;
  // Also allow HTTPS URLs if explicitly stored in DB
  if (/^https:\/\/[^\s]+$/i.test(cleaned)) return true;
  return false;
}

export function normalizeSoftwareName(name: unknown): string {
  if (typeof name !== 'string') return DEFAULT_SOFTWARE_NAME;
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_SOFTWARE_NAME;
  return trimmed.slice(0, 80);
}

export function normalizeSystemBranding(raw?: Partial<SystemBrandingConfig> | null): SystemBrandingConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SYSTEM_BRANDING };
  }
  const softwareName = normalizeSoftwareName(raw.softwareName);
  const cleanedLogo = cleanBrandingLogoDataUrl(raw.logoDataUrl);
  const logoDataUrl =
    cleanedLogo && isValidBrandingLogoDataUrl(cleanedLogo)
      ? cleanedLogo
      : null;

  return {
    softwareName,
    logoDataUrl,
    logoFileName: logoDataUrl && typeof raw.logoFileName === 'string' ? raw.logoFileName.slice(0, 160) : null,
    logoMimeType: logoDataUrl && typeof raw.logoMimeType === 'string' ? raw.logoMimeType.slice(0, 80) : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null,
  };
}

export function normalizeSystemSettings(raw?: Partial<SystemSettingsConfig> | null): SystemSettingsConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'default',
      branding: { ...DEFAULT_SYSTEM_BRANDING },
      updatedAt: null,
      updatedBy: null,
    };
  }

  const branding = normalizeSystemBranding(raw.branding);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : 'default',
    branding,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : branding.updatedAt ?? null,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : branding.updatedBy ?? null,
  };
}

export function formatSoftwareDisplayTitle(softwareName?: string | null): string {
  const clean = normalizeSoftwareName(softwareName);
  if (/\berp\b/i.test(clean)) {
    return clean;
  }
  return `${clean} ERP`;
}

export function formatDocumentTitle(softwareName?: string | null): string {
  const clean = normalizeSoftwareName(softwareName);
  if (clean.toLowerCase() === 'ensec') {
    return 'Ensec ERP & Distribution Management Platform';
  }
  if (/\berp\b/i.test(clean)) {
    return `${clean} — Distribution Management Platform`;
  }
  return `${clean} ERP — Distribution Management Platform`;
}
