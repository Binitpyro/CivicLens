import Dexie, { type Table } from 'dexie';

export interface PhotoCaptureMeta {
  data_url: string;
  dhash: string;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  heading_deg: number | null;
  location_source: 'gps' | 'manual_pin' | null;
  capture_source: 'camera_native' | 'camera_webrtc';
  quality_warnings: string[];
}

export interface LocalAsset {
  id: string;
  ward_id: number;
  asset_type: string;
  name: string;
  lbd_asset_id?: string;
  status: string;
  latitude: number;
  longitude: number;
  photo_url?: string;
  attributes: Record<string, any>;
  version_id: number;
  sync_state: 'saved' | 'syncing' | 'submitted';
}

export interface LocalIssue {
  id: string;
  asset_id?: string;
  ward_id: number;
  category: string;
  severity: string;
  description: string;
  photo_url?: string;
  photos?: PhotoCaptureMeta[];
  gps_accuracy_m?: number | null;
  heading_deg?: number | null;
  location_source?: 'gps' | 'manual_pin';
  resolution_photo_url?: string;
  resolution_photo_meta?: PhotoCaptureMeta;
  encrypted_phone?: string;
  latitude: number;
  longitude: number;
  status: string;
  version_id: number;
  client_seq_num: number;
  date_reported: string;
  sync_state: 'saved' | 'syncing' | 'submitted';
}

export interface OutboxItem {
  id?: number;
  record_id: string;
  table_name: 'assets' | 'issues';
  action: 'create' | 'update' | 'delete';
  payload: any;
  client_seq_num: number;
  created_at: string;
}

class CivicLensDexie extends Dexie {
  assets!: Table<LocalAsset, string>;
  issues!: Table<LocalIssue, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super('CivicLensDB');
    this.version(1).stores({
      assets: 'id, ward_id, asset_type, status, sync_state',
      issues: 'id, ward_id, category, severity, status, sync_state, client_seq_num',
      outbox: '++id, record_id, table_name, action, payload, client_seq_num, created_at',
    });
    this.version(2).stores({
      assets: 'id, ward_id, asset_type, status, sync_state',
      issues: 'id, ward_id, category, severity, status, sync_state, client_seq_num, location_source',
      outbox: '++id, record_id, table_name, action, payload, client_seq_num, created_at',
    });
  }
}

export const db = new CivicLensDexie();

// Dynamic AES-GCM-256 Web Crypto PII Encryption Helper
function getOrGenerateDeviceSeed(): string {
  try {
    const existing = localStorage.getItem('civiclens_device_key_seed');
    if (existing) return existing;
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const newSeed = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('civiclens_device_key_seed', newSeed);
    return newSeed;
  } catch {
    return 'civiclens-device-fallback-seed';
  }
}

let cachedCryptoKeyPromise: Promise<CryptoKey> | null = null;
let legacyCryptoKeyPromise: Promise<CryptoKey> | null = null;

function getCryptoKey(seed?: string): Promise<CryptoKey> {
  const activeSeed = seed || getOrGenerateDeviceSeed();
  return (async () => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(activeSeed));
    return crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  })();
}

function getActiveCryptoKey(): Promise<CryptoKey> {
  if (!cachedCryptoKeyPromise) {
    cachedCryptoKeyPromise = getCryptoKey();
  }
  return cachedCryptoKeyPromise;
}

function getLegacyCryptoKey(): Promise<CryptoKey> {
  if (!legacyCryptoKeyPromise) {
    legacyCryptoKeyPromise = getCryptoKey('civiclens-local-pii-secret-2026');
  }
  return legacyCryptoKeyPromise;
}

export async function encryptPII(text: string): Promise<string> {
  if (!text) return '';
  try {
    const key = await getActiveCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(text)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('PII Encryption error:', err);
    return text;
  }
}

export async function decryptPII(cipherText: string): Promise<string> {
  if (!cipherText) return '';
  try {
    const combined = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    try {
      const key = await getActiveCryptoKey();
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch {
      // Fallback to legacy key if device was upgraded or viewing legacy record
      const legacyKey = await getLegacyCryptoKey();
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, legacyKey, data);
      return new TextDecoder().decode(decrypted);
    }
  } catch {
    return cipherText;
  }
}
