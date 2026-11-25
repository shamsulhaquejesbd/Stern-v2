import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  ImageUp,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  SwitchCamera,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';

export interface QrScanFeedbackItem {
  id: string;
  employeeName: string;
  employeeCode: string;
  department?: string;
  action: 'IN' | 'OUT' | 'OUT_UPDATE';
  statusLabel: 'IN' | 'OUT';
  statusMessage: string;
  time12: string;
  date: string;
  scannedAtMs: number;
}

interface QrAttendanceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanRecorded?: (result: {
    date?: string;
    employeeName?: string;
    employeeCode?: string;
    action?: 'IN' | 'OUT' | 'OUT_UPDATE';
    time12?: string;
    overtimeSync?: {
      action: string;
      message?: string;
    } | null;
  }) => void;
}

function playFeedbackTone(kind: 'in' | 'out' | 'error') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (kind === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.23);
    } else if (kind === 'in') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, ctx.currentTime);
      osc.frequency.setValueAtTime(988, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 350);
  } catch {
    // Ignore audio context restrictions
  }
}

export const QrAttendanceScannerModal: React.FC<QrAttendanceScannerModalProps> = ({
  isOpen,
  onClose,
  onScanRecorded,
}) => {
  const { submitQrAttendanceScan } = useERP();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const localCooldownRef = useRef<Map<string, number>>(new Map());
  const feedbackTimerRef = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'paused' | 'error'>('starting');
  const [cameraError, setCameraError] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [nowClock, setNowClock] = useState<Date>(() => new Date());

  const [activeFeedback, setActiveFeedback] = useState<{
    type: 'success' | 'cooldown' | 'error';
    employeeName?: string;
    employeeCode?: string;
    statusMessage: string;
    action?: 'IN' | 'OUT' | 'OUT_UPDATE';
    time12?: string;
  } | null>(null);
  const [recentScans, setRecentScans] = useState<QrScanFeedbackItem[]>([]);

  // Live clock tick
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNowClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const stopCameraStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const showTransientBanner = useCallback(
    (banner: {
      type: 'success' | 'cooldown' | 'error';
      employeeName?: string;
      employeeCode?: string;
      statusMessage: string;
      action?: 'IN' | 'OUT' | 'OUT_UPDATE';
      time12?: string;
    }) => {
      setActiveFeedback(banner);
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = window.setTimeout(() => {
        setActiveFeedback(null);
      }, 3200);
    },
    []
  );

  const processDecodedQr = useCallback(
    async (rawText: string) => {
      const payload = String(rawText || '').trim();
      if (!payload || inFlightRef.current) return;

      const nowMs = Date.now();
      const lastLocalMs = localCooldownRef.current.get(payload);
      if (lastLocalMs && nowMs - lastLocalMs < 3000) {
        return;
      }

      inFlightRef.current = true;
      localCooldownRef.current.set(payload, nowMs);

      try {
        const res = await submitQrAttendanceScan(payload);
        if (res.success && res.employee) {
          localCooldownRef.current.set(payload, Date.now());
          const otCreatedOrUpdated =
            res.overtimeSync?.action === 'CREATED' || res.overtimeSync?.action === 'UPDATED';
          const combinedStatusMessage =
            otCreatedOrUpdated && res.overtimeSync?.message
              ? `${res.statusMessage || 'Recorded Successfully'} • ${res.overtimeSync.message}`
              : res.statusMessage || 'Recorded Successfully';
          const item: QrScanFeedbackItem = {
            id: `qrlog-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            employeeName: res.employee.name,
            employeeCode: res.employee.code || res.employee.id,
            department: res.employee.department,
            action: res.action || 'IN',
            statusLabel: res.statusLabel || (res.action === 'IN' ? 'IN' : 'OUT'),
            statusMessage: combinedStatusMessage,
            time12: res.recordedTime12 || res.recordedTime24 || '',
            date: res.date || '',
            scannedAtMs: Date.now(),
          };
          setRecentScans((prev) => [item, ...prev].slice(0, 25));
          showTransientBanner({
            type: 'success',
            employeeName: item.employeeName,
            employeeCode: item.employeeCode,
            statusMessage: item.statusMessage,
            action: item.action,
            time12: item.time12,
          });
          if (soundEnabled) {
            playFeedbackTone(item.action === 'IN' ? 'in' : 'out');
          }
          onScanRecorded?.({
            date: res.date,
            employeeName: item.employeeName,
            employeeCode: item.employeeCode,
            action: item.action,
            time12: item.time12,
            overtimeSync: res.overtimeSync || null,
          });
        } else if (res.duplicateBlocked) {
          showTransientBanner({
            type: 'cooldown',
            employeeName: res.employee?.name,
            employeeCode: res.employee?.code,
            statusMessage: res.error || 'Recently scanned — cooldown active (3s).',
          });
        } else {
          // Allow quicker retry after an unrecognized/failed decode attempt
          localCooldownRef.current.set(payload, Date.now() - 1500);
          showTransientBanner({
            type: 'error',
            employeeName: res.employee?.name,
            employeeCode: res.employee?.code,
            statusMessage: res.error || 'Unrecognized QR code.',
          });
          if (soundEnabled) {
            playFeedbackTone('error');
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [submitQrAttendanceScan, showTransientBanner, soundEnabled, onScanRecorded]
  );

  const handleScanImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to load selected image.'));
          el.src = objectUrl;
        });

        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas context unavailable.');
        ctx.drawImage(img, 0, 0, w, h);

        let decodedText = '';
        const NativeBarcodeDetector = (window as any).BarcodeDetector;
        if (NativeBarcodeDetector) {
          try {
            const det = new NativeBarcodeDetector({ formats: ['qr_code'] });
            const found = await det.detect(canvas);
            if (Array.isArray(found) && found[0]?.rawValue) {
              decodedText = String(found[0].rawValue);
            }
          } catch {
            // Fall through to jsQR
          }
        }

        if (!decodedText) {
          const imgData = ctx.getImageData(0, 0, w, h);
          const qr = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (qr?.data) {
            decodedText = qr.data;
          }
        }

        if (decodedText) {
          await processDecodedQr(decodedText);
        } else {
          showTransientBanner({
            type: 'error',
            statusMessage: 'No QR code detected in the selected image.',
          });
          if (soundEnabled) playFeedbackTone('error');
        }
      } catch (err: any) {
        showTransientBanner({
          type: 'error',
          statusMessage: err?.message || 'Unable to scan QR code from image.',
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    [processDecodedQr, showTransientBanner, soundEnabled]
  );

  const startCamera = useCallback(async () => {
    stopCameraStream();
    setCameraStatus('starting');
    setCameraError('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setCameraError(
        'Camera API is unavailable in this browser context. Ensure HTTPS or localhost is active.'
      );
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus('active');

      // Populate available video inputs after permission granted
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(allDevices.filter((d) => d.kind === 'videoinput'));
      } catch {
        // Ignore enumeration errors
      }
    } catch (err: any) {
      setCameraStatus('error');
      const msg = String(err?.name || err?.message || '');
      if (msg.includes('NotAllowedError') || msg.includes('PermissionDenied')) {
        setCameraError(
          'Camera permission denied. Please allow camera access in your browser settings and click Retry Camera.'
        );
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFound')) {
        setCameraError('No camera device was detected on this device.');
      } else {
        setCameraError(err?.message || 'Unable to access camera.');
      }
    }
  }, [facingMode, selectedDeviceId, stopCameraStream]);

  // Manage camera lifecycle on open/close
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setActiveFeedback(null);
      localCooldownRef.current.clear();
      return;
    }
    void startCamera();
    return () => {
      stopCameraStream();
    };
  }, [isOpen, startCamera, stopCameraStream]);

  // Continuous QR frame decode loop
  useEffect(() => {
    if (!isOpen || cameraStatus !== 'active') return;

    let cancelled = false;
    let lastDecodeMs = 0;
    let tickCount = 0;
    const NativeBarcodeDetector = (window as any).BarcodeDetector;
    let detector: any = null;
    if (NativeBarcodeDetector) {
      try {
        detector = new NativeBarcodeDetector({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
    }

    const decodeFrameWithJsQr = (video: HTMLVideoElement): string | null => {
      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvasRef.current = canvas;
      }
      const targetW = Math.min(720, video.videoWidth);
      const scale = targetW / video.videoWidth;
      const targetH = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, targetW, targetH);
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'attemptBoth',
      });
      return decoded?.data || null;
    };

    const tick = async () => {
      if (cancelled) return;
      const now = performance.now();
      const video = videoRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0 && now - lastDecodeMs >= 110) {
        lastDecodeMs = now;
        tickCount += 1;
        let detectedPayload: string | null = null;

        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (Array.isArray(barcodes) && barcodes.length > 0 && barcodes[0]?.rawValue) {
              detectedPayload = String(barcodes[0].rawValue);
            }
          } catch {
            // Switch cleanly to jsQR if native BarcodeDetector fails on this browser/driver
            detector = null;
          }
        }

        // Run jsQR when BarcodeDetector is unavailable OR every 3rd cycle as a dual-engine safety net
        if (!detectedPayload && (!detector || tickCount % 3 === 0)) {
          try {
            detectedPayload = decodeFrameWithJsQr(video);
          } catch {
            // Continue scanning frames
          }
        }

        if (detectedPayload) {
          void processDecodedQr(detectedPayload);
        }
      }

      if (!cancelled) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, cameraStatus, processDecodedQr]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const formattedClock = nowClock.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const formattedDate = nowClock.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight">
                  QR Code Attendance Scanner
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto IN / OUT
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Hold Employee QR Card in front of the camera • Records instantly with zero confirmation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-blue-300" />
              <span className="font-bold">{formattedClock}</span>
            </div>
            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              title={soundEnabled ? 'Mute scan beep' : 'Enable scan beep'}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close QR Scanner"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Camera Viewport & Live Feedback */}
          <div className="lg:col-span-7 space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] sm:aspect-video flex items-center justify-center border border-slate-800">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Scanning Frame Overlay */}
              {cameraStatus === 'active' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative w-52 h-52 sm:w-60 sm:h-60">
                    <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                    <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                    <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                    <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />
                    <div className="absolute inset-x-3 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80 animate-pulse" />
                  </div>
                </div>
              )}

              {/* Camera Starting / Paused / Error States */}
              {cameraStatus === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs">
                  <Camera className="w-8 h-8 text-blue-400 animate-pulse" />
                  <span>Starting device camera...</span>
                </div>
              )}

              {cameraStatus === 'paused' && (
                <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-3 text-slate-200 p-6 text-center">
                  <CameraOff className="w-9 h-9 text-slate-400" />
                  <div className="text-xs font-semibold">Camera scanner paused</div>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    Resume Camera
                  </button>
                </div>
              )}

              {cameraStatus === 'error' && (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-3 text-center p-6">
                  <AlertCircle className="w-9 h-9 text-rose-400" />
                  <div className="text-xs text-rose-200 max-w-sm leading-relaxed font-medium">
                    {cameraError}
                  </div>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Camera</span>
                  </button>
                </div>
              )}

              {/* Floating Real-Time Scan Notification Banner */}
              {activeFeedback && (
                <div className="absolute inset-x-3 bottom-3 z-20">
                  <div
                    className={`p-3.5 rounded-2xl shadow-xl border backdrop-blur-md flex items-center justify-between gap-3 ${
                      activeFeedback.type === 'success'
                        ? activeFeedback.action === 'IN'
                          ? 'bg-emerald-950/92 border-emerald-400/60 text-white'
                          : 'bg-blue-950/92 border-blue-400/60 text-white'
                        : activeFeedback.type === 'cooldown'
                        ? 'bg-amber-950/92 border-amber-400/60 text-amber-100'
                        : 'bg-rose-950/92 border-rose-400/60 text-rose-100'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {activeFeedback.type === 'success' ? (
                        <CheckCircle2
                          className={`w-6 h-6 shrink-0 mt-0.5 ${
                            activeFeedback.action === 'IN' ? 'text-emerald-400' : 'text-blue-400'
                          }`}
                        />
                      ) : (
                        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-amber-400" />
                      )}
                      <div className="min-w-0 text-xs">
                        {activeFeedback.employeeName && (
                          <div className="font-black text-sm truncate">
                            {activeFeedback.employeeName}{' '}
                            <span className="font-mono text-xs opacity-80">
                              ({activeFeedback.employeeCode})
                            </span>
                          </div>
                        )}
                        <div className="font-bold mt-0.5">{activeFeedback.statusMessage}</div>
                        {activeFeedback.time12 && (
                          <div className="text-[11px] opacity-90 font-mono mt-0.5">
                            Time: {activeFeedback.time12}
                          </div>
                        )}
                      </div>
                    </div>

                    {activeFeedback.type === 'success' && (
                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${
                          activeFeedback.action === 'IN'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-blue-500 text-white'
                        }`}
                      >
                        {activeFeedback.action === 'IN' ? 'IN' : 'OUT'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {devices.length > 1 ? (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold max-w-[200px]"
                  >
                    <option value="">Auto Camera ({facingMode === 'environment' ? 'Back' : 'Front'})</option>
                    {devices.map((dev, i) => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {dev.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeviceId('');
                    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-blue-600" />
                  <span>Flip Camera</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScanImageFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Scan a downloaded Employee QR badge image"
                >
                  <ImageUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Scan QR Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (cameraStatus === 'active') {
                      stopCameraStream();
                      setCameraStatus('paused');
                    } else {
                      void startCamera();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {cameraStatus === 'active' ? (
                    <>
                      <CameraOff className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pause Camera</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Start Camera</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Clock, Scan Rules & Recent Scans Feed */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Live Attendance Terminal
                </div>
                <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5">
                  {formattedClock}
                </div>
                <div className="text-[11px] text-slate-500">{formattedDate}</div>
              </div>
              <div className="text-right text-[11px] text-slate-500 space-y-0.5">
                <div className="font-bold text-emerald-600 dark:text-emerald-400">1st Scan → IN Time</div>
                <div className="font-bold text-blue-600 dark:text-blue-400">2nd+ Scan → OUT Time</div>
                <div className="text-[10px] text-slate-400">3s cooldown protection</div>
              </div>
            </div>

            <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col min-h-[240px]">
              <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Recent Scans ({recentScans.length})
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  Synced automatically
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 max-h-[300px]">
                {recentScans.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No QR scans recorded in this session yet. Point an employee QR badge at the camera to record attendance.
                  </div>
                ) : (
                  recentScans.map((item) => (
                    <div key={item.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {item.employeeName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {item.employeeCode} • {item.statusMessage}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            item.action === 'IN'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {item.action === 'IN' ? (
                            <LogIn className="w-2.5 h-2.5" />
                          ) : (
                            <LogOut className="w-2.5 h-2.5" />
                          )}
                          {item.statusLabel}
                        </span>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          {item.time12}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
