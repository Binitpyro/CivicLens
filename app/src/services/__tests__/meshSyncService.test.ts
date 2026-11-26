import { describe, it, expect } from 'vitest';
import {
  CivicMeshEngine,
  computeTamperHash,
  chunkPayloadForQR,
  reassembleQRChunks,
  MeshRendezvousSession,
  encryptPIIForDataMule,
  type MeshHelloMessage,
} from '../meshSyncService';

describe('meshSyncService', () => {
  describe('computeTamperHash', () => {
    it('generates consistent SHA-256 hash for identical payloads', async () => {
      const payload = { category: 'water', severity: 'critical', desc: 'Handpump leak' };
      const hash1 = await computeTamperHash('dev-A', 'rec-1', 101, payload);
      const hash2 = await computeTamperHash('dev-A', 'rec-1', 101, payload);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex string
    });

    it('generates different hash if payload is altered', async () => {
      const hashOriginal = await computeTamperHash('dev-A', 'rec-1', 101, { status: 'open' });
      const hashTampered = await computeTamperHash('dev-A', 'rec-1', 101, { status: 'resolved' });

      expect(hashOriginal).not.toBe(hashTampered);
    });
  });

  describe('CivicMeshEngine Protocol Flow', () => {
    it('creates valid HELLO message with local known IDs', () => {
      const engineA = new CivicMeshEngine('dev-A', 'ASHA Asha Devi', 4, 10);
      const hello = engineA.createHelloMessage(['rec-1', 'rec-2', 'rec-3']);

      expect(hello.protocol_version).toBe('civicmesh_v1');
      expect(hello.device_id).toBe('dev-A');
      expect(hello.ward_id).toBe(4);
      expect(hello.known_record_ids).toEqual(['rec-1', 'rec-2', 'rec-3']);
      expect(hello.last_seq_num).toBe(10);
    });

    it('computes missing records delta accurately', () => {
      const engineB = new CivicMeshEngine('dev-B', 'Surveyor Ramesh', 4, 5);
      const peerHello: MeshHelloMessage = {
        protocol_version: 'civicmesh_v1',
        device_id: 'dev-A',
        user_name: 'ASHA Asha Devi',
        ward_id: 4,
        known_record_ids: ['rec-1', 'rec-2', 'rec-3', 'rec-4'],
        last_seq_num: 12,
        timestamp: new Date().toISOString(),
      };

      const localKnownIds = ['rec-1', 'rec-2'];
      const delta = engineB.computeDeltaQuery(peerHello, localKnownIds);

      expect(delta.requesting_device_id).toBe('dev-B');
      expect(delta.missing_record_ids).toEqual(['rec-3', 'rec-4']);
    });

    it('ingests mesh batch, validates hashes, and chains Data Mule relay', async () => {
      const engineB = new CivicMeshEngine('dev-B', 'Surveyor Ramesh', 4, 20);

      const payload1 = { category: 'water', status: 'open' };
      const hash1 = await computeTamperHash('dev-A', 'rec-100', 1, payload1);

      const sampleBatch = {
        batch_id: 'batch_test_1',
        sender_device_id: 'dev-A',
        items: [
          {
            record_id: 'rec-100',
            table_name: 'issues' as const,
            action: 'create' as const,
            origin_device_id: 'dev-A',
            relayed_by: ['dev-A'],
            client_seq_num: 1,
            payload: payload1,
            tamper_hash: hash1,
            created_at: new Date().toISOString(),
          },
          {
            record_id: 'rec-101',
            table_name: 'issues' as const,
            action: 'create' as const,
            origin_device_id: 'dev-A',
            relayed_by: ['dev-A'],
            client_seq_num: 2,
            payload: { category: 'road' },
            tamper_hash: 'invalid_corrupted_hash',
            created_at: new Date().toISOString(),
          },
        ],
      };

      const currentDb = new Map<string, { status: string; client_seq_num: number }>();
      const result = await engineB.ingestMeshBatch(sampleBatch, currentDb);

      expect(result.ack.accepted_ids).toEqual(['rec-100']);
      expect(result.ack.rejected_ids['rec-101']).toMatch(/Tamper hash mismatch/);

      // Verify Data Mule chain now includes dev-B
      expect(result.itemsToSave.length).toBe(1);
      expect(result.itemsToSave[0].relayed_by).toEqual(['dev-A', 'dev-B']);
    });

    it('enforces monotonic status lattice (resolved supersedes open)', async () => {
      const engine = new CivicMeshEngine('dev-B', 'Surveyor Ramesh', 4, 30);

      const payload = { status: 'open' };
      const hash = await computeTamperHash('dev-A', 'rec-200', 1, payload);
      const batch = {
        batch_id: 'batch_test_2',
        sender_device_id: 'dev-A',
        items: [
          {
            record_id: 'rec-200',
            table_name: 'issues' as const,
            action: 'update' as const,
            origin_device_id: 'dev-A',
            relayed_by: ['dev-A'],
            client_seq_num: 1,
            payload,
            tamper_hash: hash,
            created_at: new Date().toISOString(),
          },
        ],
      };

      // Local DB already has this issue resolved
      const currentDb = new Map([['rec-200', { status: 'resolved', client_seq_num: 5 }]]);
      const result = await engine.ingestMeshBatch(batch, currentDb);

      expect(result.ack.accepted_ids.length).toBe(0);
      expect(result.ack.rejected_ids['rec-200']).toMatch(/supersedes incoming/);
    });
  });

  describe('QR Chunking & Reassembly', () => {
    it('splits large payload and successfully reassembles it', () => {
      const original = 'A'.repeat(1250);
      const chunks = chunkPayloadForQR(original, 400);

      expect(chunks.length).toBe(4);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[3].chunkIndex).toBe(3);

      const reassembled = reassembleQRChunks(chunks);
      expect(reassembled).toBe(original);
    });

    it('returns null if chunks are incomplete', () => {
      const original = 'B'.repeat(1000);
      const chunks = chunkPayloadForQR(original, 300);
      const incomplete = [chunks[0], chunks[2]]; // Missing chunk 1 and 3

      expect(reassembleQRChunks(incomplete)).toBeNull();
    });
  });

  describe('MeshRendezvousSession (Battery Conservation)', () => {
    it('manages rendezvous active state and cleans up timers', () => {
      const session = new MeshRendezvousSession(90000);
      expect(session.isRendezvousActive()).toBe(false);

      session.start();
      expect(session.isRendezvousActive()).toBe(true);

      session.stop();
      expect(session.isRendezvousActive()).toBe(false);
    });
  });

  describe('encryptPIIForDataMule (Asymmetric Server-Public-Key Encryption)', () => {
    it('encrypts phone number using RSA-OAEP envelope scheme', async () => {
      // Generate ephemeral RSA keypair representing the Panchayat Server
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );

      const phone = '+919876543210';
      const envelope = await encryptPIIForDataMule(phone, keyPair.publicKey);

      expect(envelope.encryptedData).toBeDefined();
      expect(envelope.encryptedKey).toBeDefined();
      expect(envelope.iv).toBeDefined();

      // Ensure intermediate relay cannot read plaintext phone number from payload
      expect(envelope.encryptedData).not.toContain(phone);

      // Verify server can decrypt
      const wrappedKeyBuffer = Uint8Array.from(atob(envelope.encryptedKey), (c) => c.charCodeAt(0));
      const unwrappedRawKey = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        keyPair.privateKey,
        wrappedKeyBuffer
      );

      const aesKey = await crypto.subtle.importKey(
        'raw',
        unwrappedRawKey,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const iv = Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0));
      const cipherBytes = Uint8Array.from(atob(envelope.encryptedData), (c) => c.charCodeAt(0));

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        cipherBytes
      );

      const recoveredPhone = new TextDecoder().decode(decrypted);
      expect(recoveredPhone).toBe(phone);
    });
  });
});
