import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PhotoCaptureMeta } from '../db';
import {
  analyzePhotoQuality,
  computeCanvasDHash,
  type PhotoQualityResult,
} from '../services/edgeVision';
import {
  compressPhotoOffThread,
  formatTelemetryStamp,
  type TelemetryStampOptions,
} from '../services/photoWorker';
import {
  captureCameraOnlyPhoto,
  requestWebRtcCameraStream,
  stopMediaStream,
  CameraCancelledError,
  CameraPermissionError,
} from '../services/cameraService';
import {
  IconCamera,
  IconCheck,
  IconClose,
  IconAlertTriangle,
  IconSync,
  IconCompass,
} from './CivicIcons';

export interface CameraReviewModalProps {
  isOpen: boolean;
  /** 'native' reviews initialDataUrl from @capacitor/camera; 'webrtc' opens live viewfinder */
  mode: 'native' | 'webrtc';
  /** Raw DataURL returned by @capacitor/camera when mode === 'native' */
  initialDataUrl?: string | null;
  /** Current GPS & compass telemetry to preview and burn onto the compressed JPEG */
  telemetry: TelemetryStampOptions;
  /** Optional modal heading */
  title?: string;
  /** Invoked with final compressed, watermarked PhotoCaptureMeta */
  onConfirm: (photo: PhotoCaptureMeta) => void;
  /** Invoked when user closes/cancels */
  onCancel: () => void;
  /** Optional handler for retaking in native mode; defaults to re-invoking captureCameraOnlyPhoto */
  onRetakeNative?: () => void;
}

const CameraReviewModalInner: React.FC<Omit<CameraReviewModalProps, 'isOpen'>> = ({
  mode,
  initialDataUrl = null,
  telemetry,
  title = 'Live Camera Evidence',
  onConfirm,
  onCancel,
  onRetakeNative,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dhashRef = useRef<string>('0000000000000000');

  const [rawDataUrl, setRawDataUrl] = useState<string | null>(
    mode === 'native' ? initialDataUrl : null
  );
  const [captureSource, setCaptureSource] = useState<'camera_native' | 'camera_webrtc'>(
    mode === 'native' ? 'camera_native' : 'camera_webrtc'
  );
  const [capturedAt, setCapturedAt] = useState<string>(
    () => telemetry.capturedAt ?? new Date().toISOString()
  );
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [streamReady, setStreamReady] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<{
    isPermission: boolean;
    message: string;
  } | null>(null);
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(
    () => mode === 'native' && Boolean(initialDataUrl)
  );
  const [confirming, setConfirming] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState<number>(0);

  const releaseStreamTracks = useCallback(() => {
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Manage live WebRTC camera stream when in viewfinder mode (no rawDataUrl captured yet)
  useEffect(() => {
    if (rawDataUrl !== null || captureSource !== 'camera_webrtc') {
      releaseStreamTracks();
      return;
    }

    let cancelled = false;

    requestWebRtcCameraStream(facingMode)
      .then((stream) => {
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        setStreamError(null);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .then(() => {
              if (!cancelled) setStreamReady(true);
            })
            .catch(() => {
              if (!cancelled) setStreamReady(true);
            });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setStreamReady(false);
        setStreamError({
          isPermission: err instanceof CameraPermissionError,
          message: err instanceof Error ? err.message : 'Unable to access live camera.',
        });
      });

    return () => {
      cancelled = true;
      releaseStreamTracks();
    };
  }, [rawDataUrl, captureSource, facingMode, retryCounter, releaseStreamTracks]);

  // Run fast Canvas luminance + blur quality check whenever a captured frame is shown
  useEffect(() => {
    if (!rawDataUrl) {
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const qualityRes = analyzePhotoQuality(img);
        dhashRef.current = computeCanvasDHash(img);
        setQuality(qualityRes);
      } catch {
        setQuality({
          meanLuma: 128,
          blurScore: 100,
          isTooDark: false,
          isBlurry: false,
          warnings: [],
        });
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setAnalyzing(false);
        setProcessError('Could not decode captured image. Please retake.');
      }
    };
    img.src = rawDataUrl;

    return () => {
      cancelled = true;
    };
  }, [rawDataUrl]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setProcessError('Canvas unavailable for frame capture.');
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const nowIso = new Date().toISOString();

    releaseStreamTracks();
    setStreamReady(false);
    setQuality(null);
    setAnalyzing(true);
    setProcessError(null);
    setCapturedAt(nowIso);
    setRawDataUrl(dataUrl);
  };

  const handleRetake = async () => {
    setQuality(null);
    setProcessError(null);

    if (captureSource === 'camera_native') {
      if (onRetakeNative) {
        onRetakeNative();
        return;
      }
      try {
        const res = await captureCameraOnlyPhoto();
        if (res.mode === 'native') {
          setAnalyzing(true);
          setCapturedAt(new Date().toISOString());
          setRawDataUrl(res.dataUrl);
        } else {
          setCaptureSource('camera_webrtc');
          setStreamReady(false);
          setRawDataUrl(null);
        }
      } catch (err) {
        if (err instanceof CameraCancelledError) {
          return;
        }
        setProcessError(err instanceof Error ? err.message : 'Unable to reopen camera.');
      }
      return;
    }

    setAnalyzing(false);
    setStreamReady(false);
    setStreamError(null);
    setRawDataUrl(null);
    setRetryCounter((c) => c + 1);
  };

  const handleConfirm = async () => {
    if (!rawDataUrl || confirming) return;
    setConfirming(true);
    setProcessError(null);

    try {
      const effectiveTelemetry: TelemetryStampOptions = {
        ...telemetry,
        capturedAt,
      };
      const compressedDataUrl = await compressPhotoOffThread(rawDataUrl, effectiveTelemetry);

      const meta: PhotoCaptureMeta = {
        data_url: compressedDataUrl,
        dhash: dhashRef.current,
        captured_at: capturedAt,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        accuracy_m: telemetry.accuracy,
        heading_deg: telemetry.headingDegrees ?? null,
        location_source: telemetry.locationSource ?? null,
        capture_source: captureSource,
        quality_warnings: quality?.warnings ?? [],
      };
      onConfirm(meta);
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Failed to process photo.');
      setConfirming(false);
    }
  };

  const handleCancel = useCallback(() => {
    releaseStreamTracks();
    onCancel();
  }, [releaseStreamTracks, onCancel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  const hasQualityWarning = Boolean(quality && (quality.isTooDark || quality.isBlurry));
  const stampPreview = formatTelemetryStamp({ ...telemetry, capturedAt });

  return (
    <div
      className="persist-modal-overlay camera-review-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="persist-modal-box camera-review-modal">
        <div className="camera-review-header">
          <div className="camera-review-title-group">
            <IconCamera size={18} color="var(--color-accent)" />
            <h3>{title}</h3>
          </div>
          <button
            type="button"
            className="camera-review-close-btn"
            onClick={handleCancel}
            aria-label="Close camera"
          >
            <IconClose size={16} />
          </button>
        </div>

        {rawDataUrl === null ? (
          <div className="camera-viewfinder-section">
            {streamError ? (
              <div className="camera-stream-error" role="alert">
                <IconAlertTriangle size={22} color="var(--color-status-urgent)" />
                <p>{streamError.message}</p>
                <div className="camera-review-actions">
                  <button
                    type="button"
                    className="btn-primary-action"
                    onClick={() => {
                      setStreamError(null);
                      setStreamReady(false);
                      setRetryCounter((c) => c + 1);
                    }}
                  >
                    {streamError.isPermission ? 'Retry Camera Permission' : 'Retry Camera'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="camera-viewfinder-box">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-viewfinder-video"
                  />
                  {!streamReady && (
                    <div className="camera-viewfinder-loading">
                      <span className="spinner" />
                      <span>Starting live camera…</span>
                    </div>
                  )}
                  <div className="camera-viewfinder-telemetry-chip tabular-nums">
                    {stampPreview.primaryLine}
                  </div>
                </div>

                <div className="camera-viewfinder-controls">
                  <button type="button" className="btn-secondary" onClick={handleCancel}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary-action camera-shutter-btn"
                    onClick={handleCaptureFrame}
                    disabled={!streamReady}
                    aria-label="Capture Photo"
                  >
                    <IconCamera size={18} />
                    <span>Capture</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setStreamReady(false);
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                    }}
                    aria-label="Flip Camera"
                  >
                    <IconSync size={15} />
                    <span>Flip</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="camera-review-body">
            <div className="camera-review-preview-wrap">
              <img
                src={rawDataUrl}
                alt="Captured civic evidence preview"
                className="camera-review-preview-img"
              />
              <div className="camera-stamp-preview tabular-nums">
                <div>{stampPreview.primaryLine}</div>
                <div className="camera-stamp-preview-sub">{stampPreview.secondaryLine}</div>
              </div>
            </div>

            {analyzing && (
              <div className="camera-quality-checking">
                <span className="spinner spinner-sm" />
                <span>Checking lighting &amp; sharpness…</span>
              </div>
            )}

            {processError && (
              <div className="camera-review-warning-banner" role="alert">
                <IconAlertTriangle size={16} color="var(--color-status-urgent)" />
                <span>{processError}</span>
              </div>
            )}

            {hasQualityWarning && quality && (
              <div className="camera-review-warning-banner" role="alert">
                <IconAlertTriangle size={18} color="var(--color-status-pending)" />
                <div className="camera-warning-text">
                  <strong>Photo Quality Check</strong>
                  <ul>
                    {quality.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {quality && !hasQualityWarning && !analyzing && (
              <div className="camera-quality-ok-banner">
                <IconCheck size={15} color="var(--color-status-active)" />
                <span className="camera-quality-ok-copy">
                  Sharpness &amp; lighting verified · <IconCompass size={13} /> Telemetry stamp ready
                </span>
              </div>
            )}

            <div className="camera-review-actions">
              {hasQualityWarning ? (
                <>
                  <button
                    type="button"
                    className="btn-primary-action"
                    onClick={handleRetake}
                    disabled={confirming}
                  >
                    Retake Photo
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleConfirm}
                    disabled={confirming || analyzing}
                  >
                    {confirming ? 'Stamping…' : 'Use Anyway'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleRetake}
                    disabled={confirming}
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    className="btn-primary-action"
                    onClick={handleConfirm}
                    disabled={confirming || analyzing || Boolean(processError)}
                  >
                    {confirming ? 'Stamping & Saving…' : 'Use Photo'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const CameraReviewModal: React.FC<CameraReviewModalProps> = ({
  isOpen,
  mode,
  initialDataUrl,
  ...rest
}) => {
  if (!isOpen) return null;
  const instanceKey = `${mode}:${initialDataUrl ?? 'live'}`;
  return (
    <CameraReviewModalInner
      key={instanceKey}
      mode={mode}
      initialDataUrl={initialDataUrl}
      {...rest}
    />
  );
};
