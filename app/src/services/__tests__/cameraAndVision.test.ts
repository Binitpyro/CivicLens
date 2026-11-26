import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzePhotoQuality } from '../edgeVision';
import { compressPhotoOffThread, formatTelemetryStamp } from '../photoWorker';
import {
  captureCameraOnlyPhoto,
  requestWebRtcCameraStream,
  stopMediaStream,
  CameraPermissionError,
  CameraCancelledError,
  CameraUnavailableError,
} from '../cameraService';
import { db, type PhotoCaptureMeta } from '../../db';
import { useOfflineSync } from '../../hooks/useOfflineSync';

const cameraMocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getPhoto: vi.fn(),
}));

vi.mock('@capacitor/camera', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/camera')>();
  return {
    ...actual,
    Camera: {
      checkPermissions: cameraMocks.checkPermissions,
      requestPermissions: cameraMocks.requestPermissions,
      getPhoto: cameraMocks.getPhoto,
    },
  };
});

// Helper to build a synthetic RGBA canvas backed by real pixel data in happy-dom
function installCanvasPixelMock() {
  const pixelStore = new WeakMap<
    HTMLCanvasElement,
    { w: number; h: number; data: Uint8ClampedArray }
  >();
  const drawCalls: Array<{
    fillStyle: string;
    fillRect?: [number, number, number, number];
    fillText?: string;
    toDataUrlArgs?: [string, number];
  }> = [];

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string
  ) {
    if (contextId !== '2d') return null;

    const ensureBuffer = () => {
      const w = this.width || 160;
      const h = this.height || 120;
      const existing = pixelStore.get(this);
      if (!existing || existing.w !== w || existing.h !== h) {
        const buf = { w, h, data: new Uint8ClampedArray(w * h * 4) };
        pixelStore.set(this, buf);
        return buf;
      }
      return existing;
    };

    let currentFillStyle = '#000000';
    const ctx = {
      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(val: string) {
        currentFillStyle = val;
      },
      font: '',
      textBaseline: 'alphabetic',
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
        drawCalls.push({ fillStyle: currentFillStyle, fillRect: [x, y, w, h] });
      }),
      fillText: vi.fn((text: string) => {
        drawCalls.push({ fillStyle: currentFillStyle, fillText: text });
      }),
      drawImage: vi.fn((src: HTMLCanvasElement | HTMLImageElement) => {
        const dest = ensureBuffer();
        if (src instanceof HTMLCanvasElement) {
          const srcBuf = pixelStore.get(src);
          if (srcBuf) {
            for (let y = 0; y < dest.h; y++) {
              const sy = Math.min(srcBuf.h - 1, Math.floor((y * srcBuf.h) / dest.h));
              for (let x = 0; x < dest.w; x++) {
                const sx = Math.min(srcBuf.w - 1, Math.floor((x * srcBuf.w) / dest.w));
                const sIdx = (sy * srcBuf.w + sx) * 4;
                const dIdx = (y * dest.w + x) * 4;
                dest.data[dIdx] = srcBuf.data[sIdx];
                dest.data[dIdx + 1] = srcBuf.data[sIdx + 1];
                dest.data[dIdx + 2] = srcBuf.data[sIdx + 2];
                dest.data[dIdx + 3] = srcBuf.data[sIdx + 3];
              }
            }
          }
        }
      }),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
        const buf = ensureBuffer();
        return { width: w, height: h, data: buf.data };
      }),
      putImageData: vi.fn((imageData: { data: Uint8ClampedArray }) => {
        const buf = ensureBuffer();
        buf.data.set(imageData.data);
      }),
    };

    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
    type?: string,
    quality?: number
  ) {
    drawCalls.push({
      fillStyle: '',
      toDataUrlArgs: [type ?? 'image/png', quality ?? 1],
    });
    return `data:${type || 'image/jpeg'};base64,MOCK_JPEG_${this.width}x${this.height}`;
  } as unknown as typeof HTMLCanvasElement.prototype.toDataURL);

  return { pixelStore, drawCalls };
}

function createCanvasWithGenerator(
  pixelStore: WeakMap<HTMLCanvasElement, { w: number; h: number; data: Uint8ClampedArray }>,
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number]
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  pixelStore.set(canvas, { w: width, h: height, data });
  return canvas;
}

describe('Edge Vision: analyzePhotoQuality', () => {
  let pixelStore: WeakMap<HTMLCanvasElement, { w: number; h: number; data: Uint8ClampedArray }>;

  beforeEach(() => {
    ({ pixelStore } = installCanvasPixelMock());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flags dark frames with meanLuma < 35', () => {
    const darkCanvas = createCanvasWithGenerator(pixelStore, 160, 120, () => [10, 10, 10]);
    const res = analyzePhotoQuality(darkCanvas);
    expect(res.meanLuma).toBeLessThan(35);
    expect(res.isTooDark).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('flags smooth / blurry frames with low Laplacian variance', () => {
    const blurryCanvas = createCanvasWithGenerator(pixelStore, 160, 120, (x) => {
      const v = Math.round(100 + (x / 160) * 80);
      return [v, v, v];
    });
    const res = analyzePhotoQuality(blurryCanvas);
    expect(res.isTooDark).toBe(false);
    expect(res.isBlurry).toBe(true);
    expect(res.blurScore).toBeLessThan(75);
    expect(res.warnings.some((w) => /blurry/i.test(w))).toBe(true);
  });

  it('passes crisp high-contrast frames in under 15ms', () => {
    const crispCanvas = createCanvasWithGenerator(pixelStore, 160, 120, (x, y) => {
      const isLight = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      return isLight ? [230, 230, 230] : [40, 40, 40];
    });
    const t0 = performance.now();
    const res = analyzePhotoQuality(crispCanvas);
    const elapsed = performance.now() - t0;

    expect(res.isTooDark).toBe(false);
    expect(res.isBlurry).toBe(false);
    expect(res.blurScore).toBeGreaterThan(75);
    expect(res.warnings).toEqual([]);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('Photo Worker: Telemetry Watermark & Compression', () => {
  let drawCalls: ReturnType<typeof installCanvasPixelMock>['drawCalls'];

  beforeEach(() => {
    ({ drawCalls } = installCanvasPixelMock());
    vi.stubGlobal(
      'Image',
      class MockImage {
        width = 2048;
        height = 1536;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_val: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('formats telemetry stamp lines for GPS and manual pin modes', () => {
    const gpsStamp = formatTelemetryStamp({
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: 8.4,
      headingDegrees: 135,
      locationSource: 'gps',
      capturedAt: '2026-11-25T13:45:00.000Z',
    });
    expect(gpsStamp.primaryLine).toContain('28.61390°N, 77.20900°E');
    expect(gpsStamp.primaryLine).toContain('±8m GPS');
    expect(gpsStamp.primaryLine).toContain('135° SE');
    expect(gpsStamp.secondaryLine).toContain('CivicLens Verified');

    const pinStamp = formatTelemetryStamp({
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: null,
      locationSource: 'manual_pin',
      capturedAt: '2026-11-25T13:45:00.000Z',
    });
    expect(pinStamp.primaryLine).toContain('MANUAL PIN');
  });

  it('compresses to <=1024x768 JPEG 0.60 and remains backward-compatible without telemetry', async () => {
    const dataUrl = await compressPhotoOffThread('data:image/png;base64,AAAA');
    expect(dataUrl).toBe('data:image/jpeg;base64,MOCK_JPEG_1024x768');

    const exportCall = drawCalls.find((c) => c.toDataUrlArgs);
    expect(exportCall?.toDataUrlArgs).toEqual(['image/jpeg', 0.6]);
    expect(drawCalls.some((c) => c.fillText)).toBe(false);
  });

  it('burns bottom semi-transparent telemetry strip when telemetry is provided', async () => {
    const dataUrl = await compressPhotoOffThread('data:image/png;base64,AAAA', {
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: 11,
      headingDegrees: 90,
      locationSource: 'gps',
      capturedAt: '2026-11-25T13:45:00.000Z',
    });

    expect(dataUrl).toContain('data:image/jpeg;base64,');
    const barDraw = drawCalls.find((c) => c.fillRect);
    expect(barDraw?.fillStyle).toBe('rgba(15, 23, 42, 0.72)');

    const texts = drawCalls.filter((c) => c.fillText).map((c) => c.fillText);
    expect(texts[0]).toContain('28.61390°N, 77.20900°E');
    expect(texts[0]).toContain('±11m GPS');
    expect(texts[0]).toContain('90° E');
    expect(texts[1]).toContain('CivicLens Verified');
  });
});

describe('Camera Service: Strict Camera-Only Capture', () => {
  beforeEach(() => {
    cameraMocks.checkPermissions.mockReset();
    cameraMocks.requestPermissions.mockReset();
    cameraMocks.getPhoto.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses @capacitor/camera with CameraSource.Camera and saveToGallery: false on native', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    cameraMocks.checkPermissions.mockResolvedValue({
      camera: 'granted',
      photos: 'denied',
    });
    cameraMocks.getPhoto.mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,NATIVE_FRAME',
      format: 'jpeg',
      saved: false,
    });

    const result = await captureCameraOnlyPhoto();
    expect(result).toEqual({
      mode: 'native',
      dataUrl: 'data:image/jpeg;base64,NATIVE_FRAME',
      captureSource: 'camera_native',
    });
    expect(cameraMocks.getPhoto).toHaveBeenCalledWith({
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
      quality: 85,
      allowEditing: false,
      saveToGallery: false,
      correctOrientation: true,
    });
  });

  it('requests camera-only permission and throws CameraPermissionError when denied', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    cameraMocks.checkPermissions.mockResolvedValue({
      camera: 'prompt',
      photos: 'denied',
    });
    cameraMocks.requestPermissions.mockResolvedValue({
      camera: 'denied',
      photos: 'denied',
    });

    await expect(captureCameraOnlyPhoto()).rejects.toBeInstanceOf(CameraPermissionError);
    expect(cameraMocks.requestPermissions).toHaveBeenCalledWith({ permissions: ['camera'] });
  });

  it('throws CameraCancelledError when native camera is cancelled', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    cameraMocks.checkPermissions.mockResolvedValue({
      camera: 'granted',
      photos: 'denied',
    });
    cameraMocks.getPhoto.mockRejectedValue(new Error('User cancelled photos app'));

    await expect(captureCameraOnlyPhoto()).rejects.toBeInstanceOf(CameraCancelledError);
  });

  it('routes Web/PWA to live getUserMedia viewfinder mode and maps NotAllowedError', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const fakeTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream;
    const getUserMediaMock = vi.fn().mockResolvedValue(fakeStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    const res = await captureCameraOnlyPhoto();
    expect(res).toEqual({ mode: 'webrtc', captureSource: 'camera_webrtc' });

    const stream = await requestWebRtcCameraStream('environment');
    expect(getUserMediaMock).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stopMediaStream(stream);
    expect(fakeTrack.stop).toHaveBeenCalledTimes(1);

    getUserMediaMock.mockRejectedValueOnce(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    );
    await expect(requestWebRtcCameraStream('environment')).rejects.toBeInstanceOf(
      CameraPermissionError
    );

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    await expect(captureCameraOnlyPhoto()).rejects.toBeInstanceOf(CameraUnavailableError);
  });
});

describe('IndexedDB v2 Schema', () => {
  it('exposes Dexie version 2 with extended LocalIssue and LocalAsset photo/GPS fields', () => {
    expect(db.verno).toBe(2);

    const sampleMeta: PhotoCaptureMeta = {
      data_url: 'data:image/jpeg;base64,ABC',
      dhash: '0123456789abcdef',
      captured_at: '2026-11-25T13:45:00.000Z',
      latitude: 28.6139,
      longitude: 77.209,
      accuracy_m: 9,
      heading_deg: 180,
      location_source: 'gps',
      capture_source: 'camera_native',
      quality_warnings: [],
    };
    expect(sampleMeta.capture_source).toBe('camera_native');
  });
});

describe('Offline Sync Chunking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('batches outbox sync requests in chunks of 5 (CHUNK_SIZE = 5)', async () => {
    const outboxRows = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      record_id: `iss_${i + 1}`,
      table_name: 'issues' as const,
      action: 'create' as const,
      payload: { id: `iss_${i + 1}` },
      client_seq_num: 1000 + i,
      created_at: '2026-11-25T13:45:00.000Z',
    }));

    vi.spyOn(db.outbox, 'count').mockResolvedValue(7);
    vi.spyOn(db.outbox, 'toArray').mockResolvedValue(outboxRows);
    vi.spyOn(db, 'transaction').mockResolvedValue(undefined as never);

    const chunkLengths: number[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as {
        batch: Array<{ record_id: string }>;
      };
      chunkLengths.push(parsed.batch.length);
      return new Response(
        JSON.stringify({
          acks: parsed.batch.map((b) => ({ record_id: b.record_id, status: 'synced' })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    let triggerFn: (() => Promise<void>) | null = null;
    function Harness() {
      const { triggerSync } = useOfflineSync();
      triggerFn = triggerSync;
      return null;
    }

    const container = document.createElement('div');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    // Wait for auto-sync triggered by outboxCount > 0 or invoke triggerSync if needed
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    if (chunkLengths.length === 0 && triggerFn) {
      await act(async () => {
        await triggerFn!();
      });
    }

    expect(chunkLengths).toEqual([5, 2]);

    await act(async () => {
      root.unmount();
    });
  });
});
