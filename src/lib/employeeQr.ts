import QRCode from 'qrcode';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import type { FieldForceRep } from '../types/erp';
import { getSupabaseUrl } from './supabase';

export interface EmployeeQrTokenMap {
  [employeeId: string]: string;
}

const tokenCache = new Map<string, string>();

const makeCacheKey = (id: string, code?: string) => `${String(id).trim()}::${String(code || '').trim()}`;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function computeQrHmacSig(body: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto API is unavailable in this browser context.');
  }
  const enc = new TextEncoder();
  const secretSeed = `${getSupabaseUrl()}:ensec-employee-qr-v1`;
  const secretHashBuf = await subtle.digest('SHA-256', enc.encode(secretSeed));
  const secretHex = Array.from(new Uint8Array(secretHashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hmacKey = await subtle.importKey(
    'raw',
    enc.encode(secretHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await subtle.sign('HMAC', hmacKey, enc.encode(body));
  return bytesToBase64Url(new Uint8Array(sigBuf)).slice(0, 16);
}

export async function signEmployeeQrTokenLocal(
  employeeId: string,
  employeeCode?: string
): Promise<string> {
  const enc = new TextEncoder();
  const cleanId = String(employeeId || '').trim();
  const cleanCode = String(employeeCode || cleanId).trim();
  const idB64 = bytesToBase64Url(enc.encode(cleanId));
  const codeB64 = bytesToBase64Url(enc.encode(cleanCode));
  const body = `ENS1.${idB64}.${codeB64}`;
  const sig = await computeQrHmacSig(body);
  return `${body}.${sig}`;
}

export async function verifyEmployeeQrTokenLocal(
  rawPayload: string
): Promise<{ valid: boolean; employeeId?: string; employeeCode?: string; reason?: string }> {
  const trimmed = String(rawPayload || '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'Empty QR code payload.' };
  }
  const parts = trimmed.split('.');
  if (parts.length !== 4 || parts[0] !== 'ENS1') {
    return {
      valid: false,
      reason: 'Invalid employee QR code format. Only official Ensec Employee QR badges are accepted.',
    };
  }
  const [prefix, idB64, codeB64, sig] = parts;
  const body = `${prefix}.${idB64}.${codeB64}`;
  try {
    const expectedSig = await computeQrHmacSig(body);
    if (sig.length !== expectedSig.length) {
      return { valid: false, reason: 'QR code security signature verification failed.' };
    }
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (diff !== 0) {
      return { valid: false, reason: 'QR code security signature verification failed.' };
    }
    const employeeId = base64UrlToString(idB64).trim();
    const employeeCode = base64UrlToString(codeB64).trim();
    if (!employeeId) {
      return { valid: false, reason: 'QR code does not contain a valid employee ID.' };
    }
    return { valid: true, employeeId, employeeCode };
  } catch {
    return { valid: false, reason: 'Unable to decode employee QR code payload.' };
  }
}

export function tryParseJsonSafe(rawText: string): { ok: boolean; data: any } {
  const trimmed = String(rawText || '').trim();
  if (!trimmed || trimmed.startsWith('<')) {
    return { ok: false, data: null };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) };
  } catch {
    return { ok: false, data: null };
  }
}

export function getCachedEmployeeQrToken(emp: Pick<FieldForceRep, 'id' | 'code'>): string | null {
  return tokenCache.get(makeCacheKey(emp.id, emp.code)) || null;
}

/**
 * Fetches permanent HMAC-signed QR payloads for one or more employees.
 * Uses the Express backend when available and falls back seamlessly to matching
 * WebCrypto HMAC-SHA256 signing when deployed on static SPA hosting (e.g. Firebase Hosting).
 */
export async function fetchEmployeeQrTokens(
  employees: Array<Pick<FieldForceRep, 'id' | 'code'>>,
  authHeaders: Record<string, string>
): Promise<EmployeeQrTokenMap> {
  const result: EmployeeQrTokenMap = {};
  const missing: Array<{ id: string; code: string }> = [];

  for (const emp of employees) {
    if (!emp?.id) continue;
    const key = makeCacheKey(emp.id, emp.code);
    const cached = tokenCache.get(key);
    if (cached) {
      result[emp.id] = cached;
    } else {
      missing.push({ id: String(emp.id), code: String(emp.code || emp.id) });
    }
  }

  if (missing.length === 0) {
    return result;
  }

  try {
    const resp = await fetch('/api/employees/qr-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ employees: missing }),
    });

    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const rawText = await resp.text();
    const parsed = tryParseJsonSafe(rawText);

    if (resp.ok && contentType.includes('application/json') && parsed.ok && parsed.data?.tokens) {
      const serverTokens: Record<string, string> = parsed.data.tokens || {};
      let allMapped = true;
      for (const emp of missing) {
        const token = serverTokens[emp.id];
        if (token) {
          tokenCache.set(makeCacheKey(emp.id, emp.code), token);
          result[emp.id] = token;
        } else {
          allMapped = false;
        }
      }
      if (allMapped) {
        return result;
      }
    }
  } catch {
    // Fall back to deterministic WebCrypto HMAC-SHA256 token generation
  }

  // Fallback for static SPA deployments (e.g., Firebase Hosting) or offline operation
  for (const emp of missing) {
    if (!result[emp.id]) {
      const token = await signEmployeeQrTokenLocal(emp.id, emp.code);
      tokenCache.set(makeCacheKey(emp.id, emp.code), token);
      result[emp.id] = token;
    }
  }

  return result;
}

export async function generateQrCodeDataUrl(payload: string, width = 320): Promise<string> {
  return QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let current = text;
  while (current.length > 3 && ctx.measureText(`${current}…`).width > maxWidth) {
    current = current.slice(0, -1);
  }
  return `${current}…`;
}

/**
 * Renders a crisp high-resolution downloadable PNG card with Employee ID, Name,
 * Department/Designation, and scannable QR code.
 */
export async function renderEmployeeQrBadgePngBlob(
  employee: FieldForceRep,
  qrToken: string,
  companyName = 'ENSEC ERP'
): Promise<Blob> {
  const width = 640;
  const height = 840;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available.');
  }

  // White card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  // Top Header Banner
  ctx.save();
  drawRoundedRect(ctx, 16, 16, width - 32, 136, 28);
  ctx.clip();
  const headerGrad = ctx.createLinearGradient(16, 16, width - 16, 152);
  headerGrad.addColorStop(0, '#0f172a');
  headerGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(16, 16, width - 32, 136);
  ctx.restore();

  // Header text
  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(truncateText(ctx, (companyName || 'ENSEC ERP').toUpperCase(), 540), width / 2, 64);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('EMPLOYEE ATTENDANCE ID', width / 2, 102);

  // Employee Name & Role
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(truncateText(ctx, employee.name || 'Employee', 560), width / 2, 208);

  ctx.fillStyle = '#475569';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  const roleLabel = employee.designation || 'Staff';
  ctx.fillText(truncateText(ctx, roleLabel, 560), width / 2, 242);

  // Employee ID Pill Box
  const codeText = `ID: ${employee.code || employee.id}`;
  ctx.font = 'bold 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  const pillWidth = Math.min(440, Math.max(220, ctx.measureText(codeText).width + 56));
  const pillX = (width - pillWidth) / 2;
  drawRoundedRect(ctx, pillX, 266, pillWidth, 48, 12);
  ctx.fillStyle = '#eff6ff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#93c5fd';
  ctx.stroke();

  ctx.fillStyle = '#1d4ed8';
  ctx.fillText(codeText, width / 2, 298);

  // QR Frame Box
  const qrBoxSize = 400;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = 338;
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  const qrDataUrl = await generateQrCodeDataUrl(qrToken, 368);
  const qrImg = await loadImageSafe(qrDataUrl);
  if (qrImg) {
    ctx.drawImage(qrImg, qrBoxX + 16, qrBoxY + 16, 368, 368);
  }

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '600 17px system-ui, -apple-system, sans-serif';
  ctx.fillText('Scan at Attendance Terminal for Auto IN / OUT', width / 2, 774);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`Permanent Key • ${employee.id}`, width / 2, 802);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG image.'));
    }, 'image/png');
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileSegment(val: string): string {
  return String(val || 'employee')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'employee';
}

export async function downloadSingleEmployeeQrPng(
  employee: FieldForceRep,
  qrToken: string,
  companyName?: string
): Promise<void> {
  const blob = await renderEmployeeQrBadgePngBlob(employee, qrToken, companyName);
  const filename = `${sanitizeFileSegment(employee.code || employee.id)}_${sanitizeFileSegment(employee.name)}_QR.png`;
  triggerBlobDownload(blob, filename);
}

export async function downloadBulkEmployeeQrZip(
  employees: FieldForceRep[],
  tokensById: EmployeeQrTokenMap,
  companyName?: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const zip = new JSZip();
  const folder = zip.folder('employee_qr_codes');
  const csvLines = ['Employee ID,Employee Name,Designation,Department,Status,Filename'];

  let processed = 0;
  const total = employees.length;

  for (const emp of employees) {
    const token = tokensById[emp.id];
    if (!token || !folder) continue;
    const filename = `${sanitizeFileSegment(emp.code || emp.id)}_${sanitizeFileSegment(emp.name)}_QR.png`;
    const blob = await renderEmployeeQrBadgePngBlob(emp, token, companyName);
    folder.file(filename, blob);
    csvLines.push(
      [
        `"${(emp.code || emp.id || '').replace(/"/g, '""')}"`,
        `"${(emp.name || '').replace(/"/g, '""')}"`,
        `"${(emp.designation || '').replace(/"/g, '""')}"`,
        `"${(emp.department || '').replace(/"/g, '""')}"`,
        `"${emp.status || (emp.isActive === false ? 'Inactive' : 'Active')}"`,
        `"${filename}"`,
      ].join(',')
    );
    processed += 1;
    onProgress?.(processed, total);
  }

  zip.file('employee_qr_index.csv', csvLines.join('\n'));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const todayStr = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(zipBlob, `ensec_employee_qr_codes_${todayStr}.zip`);
  return processed;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadBulkEmployeeQrA4Pdf(
  employees: FieldForceRep[],
  tokensById: EmployeeQrTokenMap,
  companyName?: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const cols = 3;
  const rows = 3;
  const perPage = cols * rows;
  const marginX = 8;
  const marginY = 8;
  const gapX = 5;
  const gapY = 5;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const maxCardW = (pageW - marginX * 2 - gapX * (cols - 1)) / cols;
  const maxCardH = (pageH - marginY * 2 - gapY * (rows - 1)) / rows;
  // Match 640:840 portrait card aspect ratio cleanly inside each cell
  const aspect = 640 / 840;
  let cardW = maxCardW;
  let cardH = cardW / aspect;
  if (cardH > maxCardH) {
    cardH = maxCardH;
    cardW = cardH * aspect;
  }
  const cellW = (pageW - marginX * 2 - gapX * (cols - 1)) / cols;
  const xPadInsideCell = (cellW - cardW) / 2;

  let processed = 0;
  const validEmps = employees.filter((e) => Boolean(tokensById[e.id]));
  const total = validEmps.length;

  for (let i = 0; i < validEmps.length; i++) {
    const emp = validEmps[i];
    const token = tokensById[emp.id];
    const pageIndex = Math.floor(i / perPage);
    const indexOnPage = i % perPage;
    if (pageIndex > 0 && indexOnPage === 0) {
      pdf.addPage('a4', 'portrait');
    }
    const col = indexOnPage % cols;
    const row = Math.floor(indexOnPage / cols);
    const x = marginX + col * (cellW + gapX) + xPadInsideCell;
    const y = marginY + row * (cardH + gapY);

    const blob = await renderEmployeeQrBadgePngBlob(emp, token, companyName);
    const dataUrl = await blobToDataUrl(blob);
    pdf.addImage(dataUrl, 'PNG', x, y, cardW, cardH, undefined, 'FAST');

    processed += 1;
    onProgress?.(processed, total);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  pdf.save(`ensec_employee_qr_cards_a4_${todayStr}.pdf`);
  return processed;
}
