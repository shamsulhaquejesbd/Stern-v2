import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Palette,
  Upload,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Lock,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Database,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext.tsx';
import { BrandLogoMark } from '../common/BrandLogoMark.tsx';
import {
  DEFAULT_SOFTWARE_NAME,
  SYSTEM_SETTINGS_TABLE_SQL,
  cleanBrandingLogoDataUrl,
  formatDocumentTitle,
  isValidBrandingLogoDataUrl,
} from '../../types/systemSettings.ts';
import { canModifySystemBranding } from '../../lib/systemSettingsPermissions.ts';
import { getSupabaseUrl } from '../../lib/supabase.ts';

type SettingsSectionId = 'branding';

interface SettingsSectionDef {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: 'branding',
    label: 'System Branding',
    description: 'Software name, logo, and global identity',
    icon: Palette,
  },
];

const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/ico',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];

const EXTENSION_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB

export const SettingsPage: React.FC = () => {
  const {
    currentUser,
    systemBranding,
    systemSettingsDbStatus,
    updateSystemBranding,
    syncSystemSettingsToDatabase,
  } = useERP();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('branding');
  const canEditBranding = canModifySystemBranding(currentUser);

  // Local form draft state synchronized with centralized systemBranding
  const [softwareName, setSoftwareName] = useState<string>(
    systemBranding.softwareName || DEFAULT_SOFTWARE_NAME
  );
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    systemBranding.logoDataUrl || null
  );
  const [logoFileName, setLogoFileName] = useState<string | null>(
    systemBranding.logoFileName || null
  );
  const [logoMimeType, setLogoMimeType] = useState<string | null>(
    systemBranding.logoMimeType || null
  );

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncingDb, setIsSyncingDb] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasLocalEditRef = useRef<boolean>(false);

  // Sync draft when server-hydrated branding arrives or updates (unless admin has active local unsaved edits)
  useEffect(() => {
    if (hasLocalEditRef.current) return;
    setSoftwareName(systemBranding.softwareName || DEFAULT_SOFTWARE_NAME);
    setLogoDataUrl(systemBranding.logoDataUrl || null);
    setLogoFileName(systemBranding.logoFileName || null);
    setLogoMimeType(systemBranding.logoMimeType || null);
  }, [
    systemBranding.softwareName,
    systemBranding.logoDataUrl,
    systemBranding.logoFileName,
    systemBranding.logoMimeType,
  ]);

  const hasUnsavedChanges =
    softwareName.trim() !== (systemBranding.softwareName || DEFAULT_SOFTWARE_NAME) ||
    (logoDataUrl || null) !== (systemBranding.logoDataUrl || null);

  const processLogoFile = (file: File) => {
    if (!canEditBranding) {
      setFeedback({
        type: 'error',
        message: 'Permission Denied: Only authorized Admin users can modify System Branding.',
      });
      return;
    }

    const extMatch = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const inferredMime = EXTENSION_MIME_MAP[ext] || file.type.toLowerCase() || '';

    const isImageMime =
      ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase()) ||
      Boolean(EXTENSION_MIME_MAP[ext]);

    if (!isImageMime) {
      setFeedback({
        type: 'error',
        message: 'Unsupported file format. Please upload a PNG, JPG, WEBP, SVG, GIF, BMP, AVIF, or ICO image.',
      });
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setFeedback({
        type: 'error',
        message: 'Logo file is too large. Please upload an image smaller than 3 MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      let result = typeof reader.result === 'string' ? reader.result : null;
      if (result && (/^data:application\/octet-stream;/i.test(result) || /^data:;/i.test(result)) && inferredMime) {
        result = result.replace(/^data:(?:application\/octet-stream)?;/i, `data:${inferredMime};`);
      }
      const cleaned = cleanBrandingLogoDataUrl(result);
      if (!cleaned || !isValidBrandingLogoDataUrl(cleaned)) {
        setFeedback({
          type: 'error',
          message: 'Could not read the selected image file as a valid logo. Please try PNG, JPG, WEBP, or SVG.',
        });
        return;
      }
      hasLocalEditRef.current = true;
      setLogoDataUrl(cleaned);
      setLogoFileName(file.name);
      setLogoMimeType(file.type || inferredMime || null);
      setFeedback(null);
    };
    reader.onerror = () => {
      setFeedback({
        type: 'error',
        message: 'Failed to read the selected logo file.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processLogoFile(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processLogoFile(file);
    }
  };

  const handleResetLogo = () => {
    if (!canEditBranding) return;
    hasLocalEditRef.current = true;
    setLogoDataUrl(null);
    setLogoFileName(null);
    setLogoMimeType(null);
    setFeedback(null);
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditBranding) {
      setFeedback({
        type: 'error',
        message: 'Permission Denied: Only authorized Admin users can modify System Branding.',
      });
      return;
    }

    const cleanName = softwareName.trim();
    if (!cleanName) {
      setFeedback({
        type: 'error',
        message: 'Software Name cannot be empty.',
      });
      return;
    }

    if (cleanName.length > 80) {
      setFeedback({
        type: 'error',
        message: 'Software Name must be 80 characters or fewer.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    const res = await updateSystemBranding({
      softwareName: cleanName,
      logoDataUrl,
      logoFileName,
      logoMimeType,
    });

    setIsSaving(false);

    if (res.success) {
      hasLocalEditRef.current = false;
      if (res.dbSynced === false) {
        setFeedback({
          type: 'warning',
          message: `Branding applied to active session and local server cache, but NOT saved to Supabase database (${
            res.dbStatus?.error || 'database sync failed'
          }). Run the SQL setup below in Supabase SQL Editor and click "Sync to Database Now".`,
        });
      } else {
        setFeedback({
          type: 'success',
          message:
            'System branding saved to database successfully. The new Software Name and Logo are now active globally across the ERP.',
        });
      }
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Failed to save system branding changes.',
      });
    }
  };

  const handleSyncToDatabase = async () => {
    if (!canEditBranding) return;
    setIsSyncingDb(true);
    setFeedback(null);

    if (hasUnsavedChanges) {
      const cleanName = softwareName.trim();
      if (!cleanName) {
        setIsSyncingDb(false);
        setFeedback({ type: 'error', message: 'Software Name cannot be empty.' });
        return;
      }
      const saveRes = await updateSystemBranding({
        softwareName: cleanName,
        logoDataUrl,
        logoFileName,
        logoMimeType,
      });
      setIsSyncingDb(false);
      if (saveRes.success && saveRes.dbSynced) {
        hasLocalEditRef.current = false;
        setFeedback({
          type: 'success',
          message: 'Saved and synchronized System Branding with the Supabase database.',
        });
      } else {
        setFeedback({
          type: 'warning',
          message:
            saveRes.dbStatus?.error ||
            saveRes.error ||
            'Database table is still unavailable. Please run the SQL script in Supabase SQL Editor first.',
        });
      }
      return;
    }

    const syncRes = await syncSystemSettingsToDatabase();
    setIsSyncingDb(false);

    if (syncRes.success && syncRes.dbSynced) {
      setFeedback({
        type: 'success',
        message: 'System branding successfully synchronized to the Supabase database.',
      });
    } else {
      setFeedback({
        type: 'warning',
        message:
          syncRes.error ||
          syncRes.dbStatus?.error ||
          'Database sync failed. Verify that the public.system_settings table exists in Supabase.',
      });
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SYSTEM_SETTINGS_TABLE_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Clipboard API fallback ignored cleanly
    }
  };

  const supabaseProjectMatch = getSupabaseUrl().match(/https:\/\/([^.]+)\.supabase\.co/i);
  const supabaseSqlEditorUrl = supabaseProjectMatch
    ? `https://supabase.com/dashboard/project/${supabaseProjectMatch[1]}/sql/new`
    : 'https://supabase.com/dashboard';

  const previewName = softwareName.trim() || DEFAULT_SOFTWARE_NAME;
  const previewBranding = {
    softwareName: previewName,
    logoDataUrl,
  };
  const showErpBadge = !/\berp\b/i.test(previewName);

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-10">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Settings className="w-5.5 h-5.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                System Settings
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/60">
                Global Configuration
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage centralized platform-wide settings and white-label branding across all users and sessions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold">
          {canEditBranding ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Write Access
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70">
              <Lock className="w-3.5 h-3.5" />
              Read-Only Access
            </span>
          )}
        </div>
      </div>

      {/* Scalable 2-Column Settings Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Navigation Rail (Extensible for Future Settings Sections) */}
        <aside className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs space-y-2">
          <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Configuration Sections
          </div>

          <nav className="space-y-1">
            {SETTINGS_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isSelected = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      isSelected ? 'text-white' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-tight">{sec.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 leading-snug ${
                        isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {sec.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 px-2.5 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              <Layers className="w-3.5 h-3.5" />
              <span>Modular Settings Registry</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
              Additional system-wide configuration modules will appear in this navigation rail.
            </p>
          </div>
        </aside>

        {/* Right Main Configuration Panel */}
        <section className="lg:col-span-9 space-y-5">
          {activeSection === 'branding' && (
            <form
              onSubmit={handleSaveChanges}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
            >
              {/* Section Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/30">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>System Branding</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Customize the application name and logo displayed in the sidebar, login gateway, and browser tab.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {systemSettingsDbStatus.synced ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-bold">
                      <Database className="w-3 h-3" />
                      Database Synced
                    </span>
                  ) : systemSettingsDbStatus.status !== 'unknown' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 text-[10px] font-bold">
                      <Database className="w-3 h-3" />
                      {systemSettingsDbStatus.status === 'table_missing'
                        ? 'DB Table Missing'
                        : 'DB Sync Required'}
                    </span>
                  ) : null}
                  {systemBranding.updatedAt && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Last updated {new Date(systemBranding.updatedAt).toLocaleString()}
                      {systemBranding.updatedBy ? ` by ${systemBranding.updatedBy}` : ''}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Permission Read-Only Alert */}
                {!canEditBranding && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2.5">
                    <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      You have view-only access to System Settings. Only authorized Admin users can modify System Branding.
                    </span>
                  </div>
                )}

                {/* Feedback Banner */}
                {feedback && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 animate-in fade-in ${
                      feedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : feedback.type === 'warning'
                        ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                        : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : feedback.type === 'warning' ? (
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    )}
                    <span className="font-medium">{feedback.message}</span>
                  </div>
                )}

                {/* Database Setup Alert & One-Click Recovery when Supabase table is missing/blocked */}
                {!systemSettingsDbStatus.synced && systemSettingsDbStatus.status !== 'unknown' && (
                  <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                      <div className="flex items-start gap-2.5">
                        <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                            Supabase Database Table Required for Persistent Storage
                          </div>
                          <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                            {systemSettingsDbStatus.error ||
                              'System Branding changes are currently saved only on the local server cache because Supabase could not persist them.'}{' '}
                            Run the SQL script below once in your Supabase SQL Editor, then click{' '}
                            <span className="font-bold">Sync to Database Now</span>.
                          </p>
                        </div>
                      </div>
                      {canEditBranding && (
                        <button
                          type="button"
                          onClick={handleSyncToDatabase}
                          disabled={isSyncingDb || isSaving}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDb ? 'animate-spin' : ''}`} />
                          <span>{isSyncingDb ? 'Syncing...' : 'Sync to Database Now'}</span>
                        </button>
                      )}
                    </div>

                    {canEditBranding && systemSettingsDbStatus.sqlFix && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                            One-Time Supabase SQL Setup
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleCopySql}
                              className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                            >
                              {copiedSql ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy SQL</span>
                                </>
                              )}
                            </button>
                            <a
                              href={supabaseSqlEditorUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-[10px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-800 flex items-center gap-1"
                            >
                              <span>Open SQL Editor</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                        <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-40 leading-relaxed border border-slate-800">
                          {systemSettingsDbStatus.sqlFix}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* A. Software Name */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="software-name-input"
                      className="block text-xs font-bold text-slate-800 dark:text-slate-200"
                    >
                      Software Name
                    </label>
                    <span className="text-[10px] font-medium text-slate-400">
                      Default: &quot;{DEFAULT_SOFTWARE_NAME}&quot; • Max 80 chars
                    </span>
                  </div>
                  <input
                    id="software-name-input"
                    name="softwareName"
                    type="text"
                    required
                    maxLength={80}
                    disabled={!canEditBranding || isSaving}
                    value={softwareName}
                    onChange={(e) => {
                      hasLocalEditRef.current = true;
                      setSoftwareName(e.target.value);
                      if (feedback) setFeedback(null);
                    }}
                    placeholder="Enter software name (e.g. Ensec or Aman ERP)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Displayed across the sidebar header, login gateway title, mobile header, and browser tab title (
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {formatDocumentTitle(previewName)}
                    </span>
                    ).
                  </p>
                </div>

                {/* B. Software Logo / Icon */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        Software Logo / Icon
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Upload a square or horizontal brand logo (PNG, JPG, WEBP, SVG, or ICO up to 3 MB). Stored persistently on the server for all users.
                      </p>
                    </div>
                    {logoDataUrl && canEditBranding && (
                      <button
                        type="button"
                        onClick={handleResetLogo}
                        disabled={isSaving}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset to Default Icon</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                    {/* Current Logo Preview Card */}
                    <div className="md:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 flex flex-col items-center justify-center text-center gap-3">
                      <BrandLogoMark branding={previewBranding} size="xl" />
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {logoDataUrl ? 'Custom Logo Configured' : 'Default System Icon'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {logoDataUrl
                            ? logoFileName || 'Persistent brand logo asset'
                            : 'Using standard gradient emblem'}
                        </div>
                      </div>
                    </div>

                    {/* Upload / Replace Dropzone */}
                    <div
                      onDragOver={(e) => {
                        if (!canEditBranding) return;
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                      }}
                      onDrop={handleDrop}
                      className={`md:col-span-7 rounded-xl border-2 border-dashed p-5 flex flex-col items-center justify-center text-center gap-2.5 transition-all ${
                        isDragging
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/40'
                      } ${!canEditBranding ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.svg,.ico,.gif,.bmp,.avif,image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/gif,image/bmp,image/avif"
                        onChange={handleFileInputChange}
                        disabled={!canEditBranding || isSaving}
                        className="hidden"
                      />
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {logoDataUrl ? 'Replace Existing Logo' : 'Upload Brand Logo or Icon'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Drag and drop your image here, or browse from your device
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!canEditBranding || isSaving}
                        className="mt-1 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{logoDataUrl ? 'Replace Logo' : 'Choose Logo File'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Placement Preview (Sidebar + Login Gateway) */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live Branding Preview
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Sidebar Top Preview */}
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Sidebar Header
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <BrandLogoMark branding={previewBranding} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-black text-sm tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent truncate">
                              {previewName}
                            </span>
                            {showErpBadge && (
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 shrink-0">
                                ERP
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-none">
                            Enterprise Resource Planning
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Login Page Header Preview */}
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Login Gateway
                      </div>
                      <div className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                        <BrandLogoMark branding={previewBranding} size="md" />
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            Welcome to {previewName}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            Sign in with your User ID and Password
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Save Action */}
              <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {hasUnsavedChanges ? (
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      You have unsaved branding changes.
                    </span>
                  ) : (
                    <span>All system branding settings are synchronized.</span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {hasUnsavedChanges && canEditBranding && (
                    <button
                      type="button"
                      onClick={() => {
                        hasLocalEditRef.current = false;
                        setSoftwareName(systemBranding.softwareName || DEFAULT_SOFTWARE_NAME);
                        setLogoDataUrl(systemBranding.logoDataUrl || null);
                        setLogoFileName(systemBranding.logoFileName || null);
                        setLogoMimeType(systemBranding.logoMimeType || null);
                        setFeedback(null);
                      }}
                      disabled={isSaving}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!canEditBranding || isSaving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Saving Changes...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
