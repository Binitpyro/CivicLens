/**
 * CivicLens CivicMesh P2P Sync Engine (v1)
 * Pillar 4: Field-to-Field P2P Mesh Synchronization for Network Dead Zones
 *
 * Implements:
 * 1. Cryptographic tamper-evident hashing (Web Crypto SHA-256)
 * 2. Multi-hop "Data Mule" store-and-forward relay mechanics
 * 3. Anti-entropy set reconciliation (Bloom filter / Set diff)
 * 4. Monotonic Status Lattice CRDT Conflict Resolution
 * 5. QR-code chunking & frame reassembly for zero-internet signaling
 */

export interface MeshSyncItem {
  record_id: string;
  table_name: 'issues' | 'assets';
  action: 'create' | 'update' | 'delete';
  origin_device_id: string;
  relayed_by: string[];
  client_seq_num: number;
  payload: Record<string, any>;
  tamper_hash: string;
  created_at: string;
}

export interface MeshHelloMessage {
  protocol_version: 'civicmesh_v1';
  device_id: string;
  user_name: string;
  ward_id: number;
  known_record_ids: string[];
  last_seq_num: number;
  timestamp: string;
}

export interface MeshDeltaQuery {
  requesting_device_id: string;
  missing_record_ids: string[];
}

export interface MeshBatchPayload {
  batch_id: string;
  sender_device_id: string;
  items: MeshSyncItem[];
}

export interface MeshCommitAck {
  batch_id: string;
  accepted_ids: string[];
  rejected_ids: Record<string, string>;
  responder_seq: number;
}

/**
 * Status precedence lattice: 'resolved' > 'in_progress' > 'open'
 */
const STATUS_RANK: Record<string, number> = {
  open: 1,
  in_progress: 2,
  resolved: 3,
};

/**
 * Compute SHA-256 hex digest for tamper verification
 */
export async function computeTamperHash(
  originDeviceId: string,
  recordId: string,
  clientSeqNum: number,
  payload: Record<string, any>
): Promise<string> {
  const normalized = JSON.stringify({
    origin: originDeviceId,
    id: recordId,
    seq: clientSeqNum,
    body: payload,
  });

  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * CivicMesh Sync Engine
 */
export class CivicMeshEngine {
  private localDeviceId: string;
  private localUserName: string;
  private localWardId: number;
  private localSeqNum: number;

  constructor(deviceId: string, userName: string, wardId: number, initialSeq = 1) {
    this.localDeviceId = deviceId;
    this.localUserName = userName;
    this.localWardId = wardId;
    this.localSeqNum = initialSeq;
  }

  getDeviceId(): string {
    return this.localDeviceId;
  }

  /**
   * Step 1: Generate HELLO message announcing local identity and known record IDs
   */
  createHelloMessage(knownRecordIds: string[]): MeshHelloMessage {
    return {
      protocol_version: 'civicmesh_v1',
      device_id: this.localDeviceId,
      user_name: this.localUserName,
      ward_id: this.localWardId,
      known_record_ids: knownRecordIds,
      last_seq_num: this.localSeqNum,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Step 2: Reconcile peer HELLO and determine records this device needs
   */
  computeDeltaQuery(peerHello: MeshHelloMessage, localKnownIds: string[]): MeshDeltaQuery {
    const localSet = new Set(localKnownIds);
    // Peer has these, but local device lacks them
    const missingRecordIds = peerHello.known_record_ids.filter((id) => !localSet.has(id));

    return {
      requesting_device_id: this.localDeviceId,
      missing_record_ids: missingRecordIds,
    };
  }

  /**
   * Step 3: Package requested records for peer transmission
   */
  createBatchPayload(requestedIds: string[], availableItems: MeshSyncItem[]): MeshBatchPayload {
    const requestedSet = new Set(requestedIds);
    const filteredItems = availableItems.filter((item) => requestedSet.has(item.record_id));

    return {
      batch_id: `mesh_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sender_device_id: this.localDeviceId,
      items: filteredItems,
    };
  }

  /**
   * Step 4: Validate, resolve conflicts, and absorb peer batch (Data Mule logic)
   */
  async ingestMeshBatch(
    batch: MeshBatchPayload,
    currentDatabaseRecords: Map<string, { status: string; client_seq_num: number; updated_at?: string }>
  ): Promise<{
    ack: MeshCommitAck;
    itemsToSave: MeshSyncItem[];
  }> {
    const accepted: string[] = [];
    const rejected: Record<string, string> = {};
    const itemsToSave: MeshSyncItem[] = [];

    for (const item of batch.items) {
      // 1. Verify Tamper Hash
      const expectedHash = await computeTamperHash(
        item.origin_device_id,
        item.record_id,
        item.client_seq_num,
        item.payload
      );

      if (expectedHash !== item.tamper_hash) {
        rejected[item.record_id] = 'Tamper hash mismatch; payload was modified or corrupted';
        continue;
      }

      // 2. Conflict Resolution against local DB record
      const existing = currentDatabaseRecords.get(item.record_id);
      if (existing) {
        const incomingStatus = item.payload.status || 'open';
        const existingStatus = existing.status || 'open';

        const incomingRank = STATUS_RANK[incomingStatus] || 1;
        const existingRank = STATUS_RANK[existingStatus] || 1;

        // Monotonic lattice rule: A resolved record cannot be downgraded to open
        if (existingRank > incomingRank) {
          rejected[item.record_id] = `Rejected: Local status '${existingStatus}' supersedes incoming '${incomingStatus}'`;
          continue;
        }

        // LWW (Last-Write-Wins) check if statuses are equal rank
        if (existingRank === incomingRank && existing.client_seq_num >= item.client_seq_num) {
          rejected[item.record_id] = `Rejected: Local sequence ${existing.client_seq_num} >= incoming ${item.client_seq_num}`;
          continue;
        }
      }

      // 3. Append to relay chain (Data Mule tracking)
      const updatedRelayChain = [...new Set([...item.relayed_by, this.localDeviceId])];
      const relayItem: MeshSyncItem = {
        ...item,
        relayed_by: updatedRelayChain,
      };

      accepted.push(item.record_id);
      itemsToSave.push(relayItem);
    }

    this.localSeqNum += 1;

    const ack: MeshCommitAck = {
      batch_id: batch.batch_id,
      accepted_ids: accepted,
      rejected_ids: rejected,
      responder_seq: this.localSeqNum,
    };

    return { ack, itemsToSave };
  }
}

/**
 * QR Code Chunking for Air-Gapped WebRTC SDP or Compact Batch Exchange
 */
export interface QRChunk {
  chunkIndex: number;
  totalChunks: number;
  sessionId: string;
  data: string;
}

export function chunkPayloadForQR(payload: string, maxChunkSize = 400): QRChunk[] {
  const sessionId = Math.random().toString(36).slice(2, 8);
  const totalChunks = Math.ceil(payload.length / maxChunkSize);
  const chunks: QRChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    chunks.push({
      chunkIndex: i,
      totalChunks,
      sessionId,
      data: payload.slice(i * maxChunkSize, (i + 1) * maxChunkSize),
    });
  }

  return chunks;
}

export function reassembleQRChunks(chunks: QRChunk[]): string | null {
  if (chunks.length === 0) return null;
  const { sessionId, totalChunks } = chunks[0];

  const matching = chunks.filter((c) => c.sessionId === sessionId);
  if (matching.length < totalChunks) return null;

  // Sort by index
  matching.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return matching.map((c) => c.data).join('');
}

/**
 * Battery Conservation: On-demand 90-second rendezvous burst manager.
 * Prevents continuous background radio drain on 2GB Android devices.
 */
export class MeshRendezvousSession {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isActive = false;
  private burstDurationMs: number;
  private onStopCallback?: () => void;

  constructor(burstDurationMs = 90000) {
    this.burstDurationMs = burstDurationMs;
  }

  start(onStop?: () => void): void {
    this.stop();
    this.isActive = true;
    this.onStopCallback = onStop;

    this.timer = setTimeout(() => {
      this.stop();
    }, this.burstDurationMs);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.isActive) {
      this.isActive = false;
      this.onStopCallback?.();
    }
  }

  isRendezvousActive(): boolean {
    return this.isActive;
  }
}

/**
 * Asymmetric Server-Public-Key PII Encryption (Envelope Hybrid Scheme)
 * Allows Data Mules to relay signed outbox records without being able to view citizen phone numbers.
 * The central Panchayat server private key decrypts the PII upon ingestion.
 */
export async function encryptPIIForDataMule(
  phone: string,
  serverPublicKey: CryptoKey
): Promise<{ encryptedData: string; encryptedKey: string; iv: string }> {
  // 1. Generate ephemeral AES-GCM-256 symmetric key
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );

  // 2. Encrypt phone number with ephemeral AES key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(phone)
  );

  // 3. Export ephemeral AES key and wrap it with Server RSA-OAEP Public Key
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const wrappedKeyBuffer = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    serverPublicKey,
    rawAesKey
  );

  return {
    encryptedData: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
    encryptedKey: btoa(String.fromCharCode(...new Uint8Array(wrappedKeyBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}
