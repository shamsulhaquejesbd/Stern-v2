import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Download,
  FileArchive,
  FileText,
  Loader2,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { FieldForceRep } from '../../types/erp';
import { useERP } from '../../context/ERPContext';
import {
  downloadBulkEmployeeQrA4Pdf,
  downloadBulkEmployeeQrZip,
  downloadSingleEmployeeQrPng,
  fetchEmployeeQrTokens,
  generateQrCodeDataUrl,
} from '../../lib/employeeQr';

interface SingleQrModalProps {
  isOpen: boolean;
  employee: FieldForceRep | null;
  onClose: () => void;
}

function mountA4PortraitPageStyle(id: string): () => void {
  if (typeof document === 'undefined') return () => {};
  let styleEl = document.getElementById(id) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = id;
    styleEl.textContent = `
      @media print {
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        html, body {
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          background: #ffffff !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }
  return () => {
    const existing = document.getElementById(id);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  };
}

async function waitForPortalImagesAndPaint(portalId: string): Promise<void> {
  if (typeof document === 'undefined') return;
  const portal = document.getElementById(portalId);
  if (portal) {
    const imgs = Array.from(portal.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) {
          return typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    );
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export const EmployeeQrSingleModal: React.FC<SingleQrModalProps> = ({
  isOpen,
  employee,
  onClose,
}) => {
  const { getErpAuthHeaders, systemBranding, payrollSettings } = useERP();
  const [qrToken, setQrToken] = useState<string>('');
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const companyName =
    systemBranding?.softwareName || payrollSettings?.companyName || 'Ensec ERP';

  useEffect(() => {
    if (!isOpen || !employee) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    setQrImageUrl('');

    (async () => {
      try {
        const tokens = await fetchEmployeeQrTokens(
          [{ id: employee.id, code: employee.code }],
          getErpAuthHeaders()
        );
        const token = tokens[employee.id];
        if (!token) {
          throw new Error('Could not generate permanent QR token for this employee.');
        }
        const dataUrl = await generateQrCodeDataUrl(token, 340);
        if (!cancelled) {
          setQrToken(token);
          setQrImageUrl(dataUrl);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to generate employee QR code.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, employee, getErpAuthHeaders]);

  useEffect(() => {
    if (!isOpen) return;
    const removePageStyle = mountA4PortraitPageStyle('qr-single-a4-page-style');
    const handleBeforePrint = () => {
      document.body.classList.add('printing-qr-badges');
    };
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-qr-badges');
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-qr-badges');
      removePageStyle();
    };
  }, [isOpen]);

  if (!isOpen || !employee) return null;

  const handlePrintSingle = async () => {
    document.body.classList.add('printing-qr-badges');
    await waitForPortalImagesAndPaint('qr-badges-a4-print-portal');
    window.print();
  };

  const handleDownload = async () => {
    if (!qrToken) return;
    setIsDownloading(true);
    try {
      await downloadSingleEmployeeQrPng(employee, qrToken, companyName);
    } finally {
      setIsDownloading(false);
    }
  };

  const renderSingleBadgeCard = (isPrint = false) => {
    const gradId = isPrint ? 'qr-single-header-grad-print' : 'qr-single-header-grad-screen';
    return (
      <div className="qr-id-card-print w-full max-w-[330px] mx-auto bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden text-center print:shadow-none print:border-slate-300">
        <div
          className="relative px-4 py-3 text-white overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 50%, #1e3a8a 100%)',
            backgroundColor: '#0f172a',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 w-full h-full pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="50%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#1e3a8a" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${gradId})`} />
          </svg>
          <div className="relative z-10">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
              {companyName}
            </div>
            <div className="text-xs font-extrabold tracking-wide mt-0.5 text-white">
              ATTENDANCE ID CARD
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3 bg-white">
          <div>
            <h4 className="text-base font-black text-slate-900 leading-tight">
              {employee.name}
            </h4>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {employee.designation || 'Staff'}
            </p>
            <div
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-xs"
              style={{
                backgroundColor: '#eff6ff',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              <span>ID: {employee.code || employee.id}</span>
            </div>
          </div>

          <div className="mx-auto w-52 h-52 rounded-2xl border border-slate-200 bg-white p-2.5 flex items-center justify-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                <span className="text-[11px] font-medium">Generating secure QR...</span>
              </div>
            ) : error ? (
              <div className="text-xs text-rose-600 font-semibold px-2">{error}</div>
            ) : qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt={`QR Code for ${employee.name}`}
                className="w-full h-full object-contain"
              />
            ) : null}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Permanent Signed QR • Auto IN / OUT Attendance</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto print:hidden">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-2xs">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Employee Attendance QR Code
                </h3>
                <p className="text-[11px] text-slate-500">
                  Permanent encrypted identifier linked to {employee.code || employee.id}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Printable ID Badge Preview Area */}
          <div className="p-6 flex flex-col items-center bg-slate-50 dark:bg-slate-950/40">
            {renderSingleBadgeCard(false)}
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!qrToken || isDownloading}
              onClick={handleDownload}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-2xs"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              disabled={!qrImageUrl}
              onClick={() => void handlePrintSingle()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print QR</span>
            </button>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        qrImageUrl &&
        createPortal(
          <div
            id="qr-badges-a4-print-portal"
            className="fixed -left-[99999px] top-0 w-[194mm] opacity-0 pointer-events-none print:static print:w-full print:opacity-100 print:pointer-events-auto"
          >
            <div className="qr-a4-sheet py-6 flex justify-center">{renderSingleBadgeCard(true)}</div>
          </div>,
          document.body
        )}
    </>
  );
};

interface BulkQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BADGES_PER_A4_PAGE = 9; // 3 columns x 3 rows vertical ID cards on A4 Portrait (210mm x 297mm)

export const EmployeeQrBulkModal: React.FC<BulkQrModalProps> = ({ isOpen, onClose }) => {
  const { fieldForceReps, getErpAuthHeaders, systemBranding, payrollSettings } = useERP();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [onlyActive, setOnlyActive] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tokensById, setTokensById] = useState<Record<string, string>>({});
  const [qrImagesById, setQrImagesById] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  const companyName =
    systemBranding?.softwareName || payrollSettings?.companyName || 'Ensec ERP';

  const categories = useMemo(() => {
    const set = new Set<string>();
    fieldForceReps.forEach((r) => {
      if (r.employeeCategory) set.add(r.employeeCategory);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [fieldForceReps]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fieldForceReps.filter((emp) => {
      const active = emp.status === 'Active' || emp.isActive !== false;
      if (onlyActive && !active) return false;
      if (categoryFilter !== 'ALL' && emp.employeeCategory !== categoryFilter) return false;
      if (q) {
        const hay = `${emp.code} ${emp.name} ${emp.department || ''} ${emp.designation || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [fieldForceReps, onlyActive, categoryFilter, search]);

  // Select all filtered employees by default on open
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set(filteredEmployees.map((e) => e.id)));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || fieldForceReps.length === 0) return;
    let cancelled = false;
    setIsGenerating(true);
    setError('');

    (async () => {
      try {
        const tokenMap = await fetchEmployeeQrTokens(
          fieldForceReps.map((e) => ({ id: e.id, code: e.code })),
          getErpAuthHeaders()
        );
        if (cancelled) return;
        setTokensById(tokenMap);

        const imgEntries = await Promise.all(
          fieldForceReps.map(async (emp) => {
            const t = tokenMap[emp.id];
            if (!t) return [emp.id, ''] as const;
            const url = await generateQrCodeDataUrl(t, 280);
            return [emp.id, url] as const;
          })
        );
        if (!cancelled) {
          const nextImgs: Record<string, string> = {};
          for (const [id, url] of imgEntries) {
            if (url) nextImgs[id] = url;
          }
          setQrImagesById(nextImgs);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to generate bulk employee QR codes.');
        }
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, fieldForceReps, getErpAuthHeaders]);

  const printableEmployees = useMemo(() => {
    return filteredEmployees.filter((emp) => selectedIds.has(emp.id));
  }, [filteredEmployees, selectedIds]);

  const badgePages = useMemo(() => {
    const pages: FieldForceRep[][] = [];
    for (let i = 0; i < printableEmployees.length; i += BADGES_PER_A4_PAGE) {
      pages.push(printableEmployees.slice(i, i + BADGES_PER_A4_PAGE));
    }
    return pages;
  }, [printableEmployees]);

  useEffect(() => {
    if (!isOpen) return;
    const removePageStyle = mountA4PortraitPageStyle('qr-bulk-a4-page-style');
    const handleBeforePrint = () => {
      document.body.classList.add('printing-qr-badges');
    };
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-qr-badges');
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-qr-badges');
      removePageStyle();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(filteredEmployees.map((e) => e.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkPrintA4 = async () => {
    if (printableEmployees.length === 0) return;
    document.body.classList.add('printing-qr-badges');
    await waitForPortalImagesAndPaint('qr-badges-a4-print-portal');
    window.print();
  };

  const handleBulkZipDownload = async () => {
    if (printableEmployees.length === 0) return;
    setIsZipping(true);
    setExportProgress({ done: 0, total: printableEmployees.length });
    try {
      await downloadBulkEmployeeQrZip(
        printableEmployees,
        tokensById,
        companyName,
        (done, total) => setExportProgress({ done, total })
      );
    } finally {
      setIsZipping(false);
      setExportProgress(null);
    }
  };

  const handleBulkA4PdfDownload = async () => {
    if (printableEmployees.length === 0) return;
    setIsExportingPdf(true);
    setExportProgress({ done: 0, total: printableEmployees.length });
    try {
      await downloadBulkEmployeeQrA4Pdf(
        printableEmployees,
        tokensById,
        companyName,
        (done, total) => setExportProgress({ done, total })
      );
    } finally {
      setIsExportingPdf(false);
      setExportProgress(null);
    }
  };

  const renderBadgeCard = (emp: FieldForceRep, isPrintSheet = false) => {
    const gradId = `qr-bulk-hdr-${isPrintSheet ? 'p' : 's'}-${String(emp.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
      <div
        key={`${isPrintSheet ? 'print' : 'preview'}-badge-${emp.id}`}
        className={`qr-id-card-print bg-white rounded-2xl border border-slate-200 overflow-hidden text-center flex flex-col justify-between break-inside-avoid ${
          isPrintSheet ? 'h-[86mm] shadow-none' : 'shadow-xs h-full min-h-[305px]'
        }`}
      >
        {/* Top Navy Header (Inline SVG gradient ensures vivid print even if Background graphics is off) */}
        <div
          className={`relative px-2.5 text-white overflow-hidden shrink-0 ${
            isPrintSheet ? 'py-2' : 'py-2.5'
          }`}
          style={{
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 50%, #1e3a8a 100%)',
            backgroundColor: '#0f172a',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 w-full h-full pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="50%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#1e3a8a" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${gradId})`} />
          </svg>
          <div className="relative z-10">
            <div className="text-[8.5px] font-bold uppercase tracking-widest text-blue-200 truncate">
              {companyName}
            </div>
            <div className="text-[10.5px] font-extrabold tracking-wide leading-tight mt-0.5 text-white">
              ATTENDANCE ID CARD
            </div>
          </div>
        </div>

        {/* Center Identity & QR Body */}
        <div
          className={`flex-1 flex flex-col items-center justify-between bg-white min-h-0 ${
            isPrintSheet ? 'px-2.5 pt-2 pb-2' : 'px-3 pt-3 pb-2.5'
          }`}
        >
          <div className="w-full min-w-0">
            <h4
              className={`font-black text-slate-900 leading-tight truncate ${
                isPrintSheet ? 'text-[12px]' : 'text-[13px]'
              }`}
              title={emp.name}
            >
              {emp.name}
            </h4>
            <p className="text-[10px] font-semibold text-slate-500 mt-0.5 truncate">
              {emp.designation || 'Staff'}
            </p>
            <div
              className="mt-1.5 inline-flex items-center justify-center px-2.5 py-0.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 font-mono font-bold text-[10px]"
              style={{
                backgroundColor: '#eff6ff',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              <span>ID: {emp.code || emp.id}</span>
            </div>
          </div>

          {/* Centered QR Code Box */}
          <div
            className={`mx-auto rounded-xl border border-slate-200 bg-white p-1.5 flex items-center justify-center shrink-0 ${
              isPrintSheet ? 'w-[35mm] h-[35mm] my-1' : 'w-32 h-32 my-2'
            }`}
          >
            {qrImagesById[emp.id] ? (
              <img
                src={qrImagesById[emp.id]}
                alt={`QR ${emp.code}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            )}
          </div>

          {/* Footer Tagline */}
          <div className="w-full pt-1.5 border-t border-slate-100 flex items-center justify-center gap-1 text-[7.5px] font-semibold text-slate-500 whitespace-nowrap overflow-hidden">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
            <span className="truncate">Permanent Signed QR • Auto IN / OUT Attendance</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto print:hidden">
        <div className="w-full max-w-6xl max-h-[94vh] flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          {/* Top Modal Action Bar */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Bulk Employee QR Code Generator (A4 Print &amp; ZIP / PDF Download)
                </h3>
                <p className="text-[11px] text-slate-500">
                  A4 Portrait Card Sheet Layout (9 Cards / Page • 3 × 3) • Permanent HMAC-Signed Employee ID Cards
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isGenerating || isZipping || isExportingPdf || printableEmployees.length === 0}
                onClick={handleBulkZipDownload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-colors"
              >
                {isZipping ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileArchive className="w-3.5 h-3.5" />
                )}
                <span>
                  {isZipping && exportProgress
                    ? `ZIP ${exportProgress.done}/${exportProgress.total}...`
                    : `Download ZIP (${printableEmployees.length})`}
                </span>
              </button>

              <button
                type="button"
                disabled={isGenerating || isZipping || isExportingPdf || printableEmployees.length === 0}
                onClick={handleBulkA4PdfDownload}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-colors"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>
                  {isExportingPdf && exportProgress
                    ? `PDF ${exportProgress.done}/${exportProgress.total}...`
                    : `Download A4 PDF`}
                </span>
              </button>

              <button
                type="button"
                disabled={isGenerating || printableEmployees.length === 0}
                onClick={() => void handleBulkPrintA4()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print A4 Sheets ({printableEmployees.length})</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter & Selection Toolbar */}
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[210px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, ID, department..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Active Only</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">
                Selected: <b className="text-slate-900 dark:text-white">{printableEmployees.length}</b> / {filteredEmployees.length}
              </span>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold text-[11px] hover:bg-blue-100"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[11px] hover:bg-slate-200"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Scrollable A4 Sheet Preview */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950">
            {error ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            ) : isGenerating && Object.keys(qrImagesById).length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <div className="text-xs font-semibold">Generating permanent employee QR cards...</div>
              </div>
            ) : (
              <>
                {/* Selection Chips Strip */}
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {filteredEmployees.map((emp) => {
                    const isChecked = selectedIds.has(emp.id);
                    return (
                      <button
                        key={`chip-${emp.id}`}
                        type="button"
                        onClick={() => toggleSelect(emp.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                          isChecked
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {isChecked && <CheckCircle2 className="w-3 h-3" />}
                        <span className="font-mono">{emp.code}</span>
                        <span>• {emp.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* A4 Printable Sheet-by-Sheet Preview */}
                {printableEmployees.length === 0 ? (
                  <div className="mx-auto max-w-[210mm] bg-white p-12 rounded-2xl shadow-sm border border-slate-200 text-center text-xs text-slate-400">
                    Select one or more employees above to preview A4 QR cards, print, or download PDF/ZIP.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {badgePages.map((pageEmps, pageIdx) => (
                      <div
                        key={`preview-page-${pageIdx}`}
                        className="mx-auto max-w-[210mm] bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200"
                      >
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 text-[11px] font-bold text-slate-500">
                          <span>
                            A4 Sheet {pageIdx + 1} of {badgePages.length}
                          </span>
                          <span>{pageEmps.length} Cards (3 × 3 A4 Portrait Layout)</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {pageEmps.map((emp) => renderBadgeCard(emp, false))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        printableEmployees.length > 0 &&
        createPortal(
          <div
            id="qr-badges-a4-print-portal"
            className="fixed -left-[99999px] top-0 w-[194mm] opacity-0 pointer-events-none print:static print:w-full print:opacity-100 print:pointer-events-auto"
          >
            {badgePages.map((pageEmps, pageIdx) => (
              <div key={`print-page-${pageIdx}`} className="qr-a4-sheet">
                <div className="grid grid-cols-3 gap-[5mm]">
                  {pageEmps.map((emp) => renderBadgeCard(emp, true))}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
