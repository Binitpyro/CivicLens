/**
 * CivicLens Pillar 2: Edge Vision & Canvas Pre-processing
 * Runs on low-end Android browsers (Chrome/Capacitor WebView) in <20ms
 */

export interface ProcessedImageResult {
  compressedDataUrl: string;
  dHash: string; // 16-character hex string (64-bit)
  originalWidth: number;
  originalHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  sizeBytes: number;
}

export interface PhotoQualityResult {
  meanLuma: number;      // 0..255
  blurScore: number;     // Laplacian variance on 160x120 sample
  isTooDark: boolean;
  isBlurry: boolean;
  warnings: string[];
}

const QUALITY_SAMPLE_WIDTH = 160;
const QUALITY_SAMPLE_HEIGHT = 120;
const DARK_LUMA_THRESHOLD = 35;
const BLUR_VARIANCE_THRESHOLD = 75;

/**
 * Analyzes image luminance and edge sharpness (Laplacian variance) on a
 * downsampled 160x120 canvas in <15ms for instant post-capture quality feedback.
 */
export function analyzePhotoQuality(img: HTMLImageElement | HTMLCanvasElement): PhotoQualityResult {
  const canvas = document.createElement('canvas');
  canvas.width = QUALITY_SAMPLE_WIDTH;
  canvas.height = QUALITY_SAMPLE_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return {
      meanLuma: 128,
      blurScore: 100,
      isTooDark: false,
      isBlurry: false,
      warnings: [],
    };
  }

  ctx.drawImage(img, 0, 0, QUALITY_SAMPLE_WIDTH, QUALITY_SAMPLE_HEIGHT);
  const { data } = ctx.getImageData(0, 0, QUALITY_SAMPLE_WIDTH, QUALITY_SAMPLE_HEIGHT);

  const totalPixels = QUALITY_SAMPLE_WIDTH * QUALITY_SAMPLE_HEIGHT;
  const luma = new Float32Array(totalPixels);
  let lumaSum = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    luma[p] = y;
    lumaSum += y;
  }

  const meanLuma = Math.round((lumaSum / totalPixels) * 100) / 100;

  let lapSum = 0;
  let lapSqSum = 0;
  const interiorCount = (QUALITY_SAMPLE_WIDTH - 2) * (QUALITY_SAMPLE_HEIGHT - 2);

  for (let y = 1; y < QUALITY_SAMPLE_HEIGHT - 1; y++) {
    const rowOffset = y * QUALITY_SAMPLE_WIDTH;
    for (let x = 1; x < QUALITY_SAMPLE_WIDTH - 1; x++) {
      const idx = rowOffset + x;
      const lap =
        luma[idx - QUALITY_SAMPLE_WIDTH] +
        luma[idx + QUALITY_SAMPLE_WIDTH] +
        luma[idx - 1] +
        luma[idx + 1] -
        4 * luma[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
    }
  }

  const lapMean = lapSum / interiorCount;
  const variance = Math.max(0, lapSqSum / interiorCount - lapMean * lapMean);
  const blurScore = Math.round(variance * 100) / 100;

  const isTooDark = meanLuma < DARK_LUMA_THRESHOLD;
  const isBlurry = blurScore < BLUR_VARIANCE_THRESHOLD;

  const warnings: string[] = [];
  if (isTooDark) {
    warnings.push('Photo looks too dark. Try capturing in better lighting.');
  }
  if (isBlurry) {
    warnings.push('Photo looks blurry. Hold steady and retake if details are unclear.');
  }

  return {
    meanLuma,
    blurScore,
    isTooDark,
    isBlurry,
    warnings,
  };
}

/**
 * Computes 64-bit difference hash (dHash) on an HTML Image or Canvas.
 * Resizes to 9x8, converts to grayscale, and compares horizontally adjacent pixels.
 */
export function computeCanvasDHash(img: HTMLImageElement | HTMLCanvasElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '0000000000000000';

  ctx.drawImage(img, 0, 0, 9, 8);
  const imgData = ctx.getImageData(0, 0, 9, 8).data;

  // Compute luminance for each pixel
  const grays: number[] = [];
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    grays.push(0.299 * r + 0.587 * g + 0.114 * b);
  }

  let hashBigInt = 0n;
  let bitIndex = 0n;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = grays[row * 9 + col];
      const right = grays[row * 9 + col + 1];
      if (left > right) {
        hashBigInt |= 1n << bitIndex;
      }
      bitIndex++;
    }
  }

  return hashBigInt.toString(16).padStart(16, '0');
}

/**
 * Calculates Hamming distance between two 16-char hex hashes.
 */
export function computeHammingDistance(h1: string, h2: string): number {
  if (h1.length !== 16 || h2.length !== 16) return 64;
  const b1 = BigInt(`0x${h1}`);
  const b2 = BigInt(`0x${h2}`);
  let xor = b1 ^ b2;
  let dist = 0;
  while (xor > 0n) {
    if (xor & 1n) dist++;
    xor >>= 1n;
  }
  return dist;
}

/**
 * Downscales and compresses a camera image to WebP/JPEG, and extracts its 64-bit dHash.
 */
export async function processImageForCivicLens(
  fileOrBlob: Blob,
  maxDimension: number = 800
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        let scaledWidth = originalWidth;
        let scaledHeight = originalHeight;

        if (originalWidth > maxDimension || originalHeight > maxDimension) {
          if (originalWidth > originalHeight) {
            scaledWidth = maxDimension;
            scaledHeight = Math.round((originalHeight * maxDimension) / originalWidth);
          } else {
            scaledHeight = maxDimension;
            scaledWidth = Math.round((originalWidth * maxDimension) / originalHeight);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return reject(new Error('Canvas 2D context unavailable'));
        }

        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

        // Compute 64-bit dHash for duplicate detection
        const dHash = computeCanvasDHash(canvas);

        // Export as WebP if supported, fallback to JPEG
        let compressedDataUrl = canvas.toDataURL('image/webp', 0.75);
        if (!compressedDataUrl.startsWith('data:image/webp')) {
          compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
        }

        const approxBytes = Math.round((compressedDataUrl.length * 3) / 4);

        resolve({
          compressedDataUrl,
          dHash,
          originalWidth,
          originalHeight,
          scaledWidth,
          scaledHeight,
          sizeBytes: approxBytes,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(fileOrBlob);
  });
}
