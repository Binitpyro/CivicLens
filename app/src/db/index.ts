import Dexie, { type Table } from 'dexie';

export interface LocalAsset {
  id: string;
  ward_id: number;
  asset_type: string;
  name: string;
  lbd_asset_id?: string;
  status: string;
  latitude: number;
  longitude: number;
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

export interface LocationLog {
  id?: number;
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  altitude?: number | null;
  heading?: number | null;
}

class CivicLensDexie extends Dexie {
  assets!: Table<LocalAsset, string>;
  issues!: Table<LocalIssue, string>;
  outbox!: Table<OutboxItem, number>;
  locationLogs!: Table<LocationLog, number>;

  constructor() {
    super('CivicLensDB');
    this.version(1).stores({
      assets: 'id, ward_id, asset_type, status, sync_state',
      issues: 'id, ward_id, category, severity, status, sync_state, client_seq_num',
      outbox: '++id, record_id, table_name, action, payload, client_seq_num, created_at',
    });
    this.version(2).stores({
      assets: 'id, ward_id, asset_type, status, sync_state',
      issues: 'id, ward_id, category, severity, status, sync_state, client_seq_num',
      outbox: '++id, record_id, table_name, action, payload, client_seq_num, created_at',
      locationLogs: '++id, timestamp, latitude, longitude',
    });
  }
}

export const db = new CivicLensDexie();

// Transparent AES-GCM-256 Web Crypto PII Encryption Helper
const ENCRYPTION_KEY_STRING = 'civiclens-local-pii-secret-2026';
let cachedCryptoKeyPromise: Promise<CryptoKey> | null = null;

function getCryptoKey(): Promise<CryptoKey> {
  if (!cachedCryptoKeyPromise) {
    cachedCryptoKeyPromise = (async () => {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(ENCRYPTION_KEY_STRING));
      return crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    })();
  }
  return cachedCryptoKeyPromise;
}

export async function encryptPII(text: string): Promise<string> {
  if (!text) return '';
  try {
    const key = await getCryptoKey();
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
    const key = await getCryptoKey();
    const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    return cipherText;
  }
}
