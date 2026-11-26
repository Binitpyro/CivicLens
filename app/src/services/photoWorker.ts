// Client-Side Canvas Photo Compression Utility (strips EXIF metadata, resizes to <=1024x768 JPEG, and burns optional telemetry watermark)

export interface TelemetryStampOptions {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  headingDegrees?: number | null;
  locationSource?: 'gps' | 'manual_pin' | null;
  capturedAt?: string;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function formatCompassCardinal(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return CARDINALS[idx];
}

export function formatTelemetryStamp(telemetry: TelemetryStampOptions): {
  primaryLine: string;
  secondaryLine: string;
} {
  const coordsText =
    telemetry.latitude != null && telemetry.longitude != null
      ? `${Math.abs(telemetry.latitude).toFixed(5)}°${telemetry.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(telemetry.longitude).toFixed(5)}°${telemetry.longitude >= 0 ? 'E' : 'W'}`
      : 'Coordinates Pending';

  let sourceAccText = 'GPS';
  if (telemetry.locationSource === 'manual_pin') {
    sourceAccText = 'MANUAL PIN';
  } else if (telemetry.accuracy != null && Number.isFinite(telemetry.accuracy)) {
    sourceAccText = `±${Math.round(telemetry.accuracy)}m GPS`;
  }

  const bearingText =
    telemetry.headingDegrees != null && Number.isFinite(telemetry.headingDegrees)
      ? `${Math.round(((telemetry.headingDegrees % 360) + 360) % 360)}° ${formatCompassCardinal(telemetry.headingDegrees)}`
      : null;

  const primaryLine = [coordsText, sourceAccText, bearingText].filter(Boolean).join(' · ');

  const dateObj = telemetry.capturedAt ? new Date(telemetry.capturedAt) : new Date();
  const validDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${validDate.getFullYear()}-${pad2(validDate.getMonth() + 1)}-${pad2(validDate.getDate())} ${pad2(validDate.getHours())}:${pad2(validDate.getMinutes())}`;

  const secondaryLine = `${dateStr} · CivicLens Verified`;

  return { primaryLine, secondaryLine };
}

function drawTelemetryWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  telemetry: TelemetryStampOptions
): void {
  const { primaryLine, secondaryLine } = formatTelemetryStamp(telemetry);
  const fontSize = Math.max(10, Math.min(14, Math.round(width * 0.015)));
  const lineHeight = Math.round(fontSize * 1.35);
  const padX = Math.max(8, Math.round(width * 0.015));
  const padY = Math.max(6, Math.round(fontSize * 0.5));
  const barHeight = Math.min(height, padY * 2 + lineHeight * 2);

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(0, height - barHeight, width, barHeight);

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(primaryLine, padX, height - barHeight + padY, Math.max(40, width - padX * 2));

  ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
  ctx.font = `500 ${Math.max(9, fontSize - 1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(
    secondaryLine,
    padX,
    height - barHeight + padY + lineHeight,
    Math.max(40, width - padX * 2)
  );
  ctx.restore();
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

export async function compressPhotoOffThread(
  fileOrDataUrl: File | Blob | string,
  telemetry?: TelemetryStampOptions
): Promise<string> {
  const MAX_W = 1024;
  const MAX_H = 768;

  // 1. Prefer modern createImageBitmap for asynchronous off-main-thread decode on Blobs/Files
  if (typeof fileOrDataUrl !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(fileOrDataUrl);
      const scale = Math.min(MAX_W / bitmap.width, MAX_H / bitmap.height, 1);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        throw new Error('Canvas context unavailable');
      }

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      if (telemetry) {
        drawTelemetryWatermark(ctx, width, height, telemetry);
      }
      return canvas.toDataURL('image/jpeg', 0.60);
    } catch {
      // Fall back to Image/FileReader below if createImageBitmap encounters an issue
    }
  }

  // 2. Standard Image / DataURL fallback
  const dataUrl =
    typeof fileOrDataUrl === 'string'
      ? fileOrDataUrl
      : await readBlobAsDataUrl(fileOrDataUrl);

  const img = await loadImageFromSrc(dataUrl);
  const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(img, 0, 0, width, height);
  if (telemetry) {
    drawTelemetryWatermark(ctx, width, height, telemetry);
  }
  return canvas.toDataURL('image/jpeg', 0.60);
}
