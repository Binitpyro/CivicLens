import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export class CameraPermissionError extends Error {
  readonly code = 'CAMERA_PERMISSION_DENIED';

  constructor(
    message = 'Camera permission is required to capture live on-site evidence. Please allow camera access and try again.'
  ) {
    super(message);
    this.name = 'CameraPermissionError';
  }
}

export class CameraCancelledError extends Error {
  readonly code = 'CAMERA_CANCELLED';

  constructor(message = 'Photo capture was cancelled.') {
    super(message);
    this.name = 'CameraCancelledError';
  }
}

export class CameraUnavailableError extends Error {
  readonly code = 'CAMERA_UNAVAILABLE';

  constructor(
    message = 'Live camera hardware is unavailable on this device or browser. Gallery uploads are disabled.'
  ) {
    super(message);
    this.name = 'CameraUnavailableError';
  }
}

export type CameraCaptureResult =
  | {
      mode: 'native';
      dataUrl: string;
      captureSource: 'camera_native';
    }
  | {
      mode: 'webrtc';
      captureSource: 'camera_webrtc';
    };

function extractErrorText(err: unknown): { message: string; code: string } {
  if (err && typeof err === 'object') {
    const record = err as { message?: unknown; code?: unknown };
    return {
      message: typeof record.message === 'string' ? record.message : String(err),
      code: typeof record.code === 'string' ? record.code : '',
    };
  }
  return { message: String(err ?? ''), code: '' };
}

/**
 * Initiates a strict camera-only photo capture (no gallery/album picker, no video).
 * - On native Android/iOS (Capacitor): invokes `@capacitor/camera` with `CameraSource.Camera`.
 * - On Web/PWA: validates `getUserMedia` availability and signals `mode: 'webrtc'` so
 *   `CameraReviewModal` opens the in-app live `<video>` viewfinder.
 */
export async function captureCameraOnlyPhoto(): Promise<CameraCaptureResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const currentPerms = await Camera.checkPermissions();
      if (currentPerms.camera !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] });
        if (requested.camera !== 'granted') {
          throw new CameraPermissionError();
        }
      }

      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        quality: 85,
        allowEditing: false,
        saveToGallery: false,
        correctOrientation: true,
      });

      if (!photo.dataUrl) {
        throw new CameraUnavailableError('Native camera returned an empty image.');
      }

      return {
        mode: 'native',
        dataUrl: photo.dataUrl,
        captureSource: 'camera_native',
      };
    } catch (err) {
      if (
        err instanceof CameraPermissionError ||
        err instanceof CameraCancelledError ||
        err instanceof CameraUnavailableError
      ) {
        throw err;
      }

      const { message, code } = extractErrorText(err);
      if (code === 'OS-PLUG-CAMR-0003' || /permission|denied/i.test(message)) {
        throw new CameraPermissionError(message || undefined);
      }
      if (/cancel/i.test(message)) {
        throw new CameraCancelledError(message || undefined);
      }
      throw new CameraUnavailableError(message || undefined);
    }
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    throw new CameraUnavailableError(
      'Live camera viewfinder requires HTTPS or a supported camera-enabled browser. File uploads are disabled.'
    );
  }

  return {
    mode: 'webrtc',
    captureSource: 'camera_webrtc',
  };
}

/**
 * Requests a live still-photo preview MediaStream for Web/PWA viewfinder mode.
 * Never requests audio and never falls back to file inputs.
 */
export async function requestWebRtcCameraStream(
  facingMode: 'environment' | 'user' = 'environment'
): Promise<MediaStream> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    throw new CameraUnavailableError();
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
    const message =
      err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission|denied/i.test(message)) {
      throw new CameraPermissionError(
        'Camera permission was blocked in the browser. Allow camera access in site settings and retry.'
      );
    }
    throw new CameraUnavailableError(
      message || 'Could not start live camera viewfinder. Ensure a camera is connected and not in use.'
    );
  }
}

/**
 * Stops all active media tracks on a MediaStream safely.
 */
export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignore already-stopped tracks
    }
  }
}
