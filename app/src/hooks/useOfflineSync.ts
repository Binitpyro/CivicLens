import { useState, useEffect, useCallback } from 'react';
import { db } from '../db';
import { API_BASE } from '../services/apiService';

const CHUNK_SIZE = 5;

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [coldStartNotice, setColdStartNotice] = useState<boolean>(false);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor Dexie outbox item count
  const refreshOutboxCount = useCallback(async () => {
    try {
      const count = await db.outbox.count();
      setOutboxCount(count);
    } catch (err) {
      console.error('Error counting outbox items:', err);
    }
  }, []);

  useEffect(() => {
    refreshOutboxCount();
    const interval = setInterval(refreshOutboxCount, 3000);
    return () => clearInterval(interval);
  }, [refreshOutboxCount]);

  // Sync outbox queue to server in resilient chunks
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    try {
      const outboxItems = await db.outbox.toArray();
      if (outboxItems.length === 0) return;

      setIsSyncing(true);

      const coldStartTimer = setTimeout(() => {
        setColdStartNotice(true);
      }, 3000);

      const token = localStorage.getItem('civiclens_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Process in chunks to prevent oversized HTTP payloads and timeouts
      for (let i = 0; i < outboxItems.length; i += CHUNK_SIZE) {
        const chunk = outboxItems.slice(i, i + CHUNK_SIZE);
        const batch = chunk.map((item) => ({
          record_id: item.record_id,
          table_name: item.table_name,
          action: item.action,
          payload: item.payload,
          client_seq_num: item.client_seq_num,
        }));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        try {
          const response = await fetch(`${API_BASE}/sync`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ batch }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`Sync HTTP error ${response.status}`);
          }

          const data = await response.json();
          const acks: Array<{ record_id: string; status: string }> = data.acks || [];

          const validRecordIds = acks
            .filter((ack) => ack.status === 'synced' || ack.status === 'conflict_logged')
            .map((ack) => ack.record_id);

          if (validRecordIds.length > 0) {
            await db.transaction('rw', [db.outbox, db.issues, db.assets], async () => {
              for (const recordId of validRecordIds) {
                await db.outbox.where('record_id').equals(recordId).delete();
                await db.issues.where('id').equals(recordId).modify({ sync_state: 'submitted' });
                await db.assets.where('id').equals(recordId).modify({ sync_state: 'submitted' });
              }
            });
          }
        } catch (chunkErr) {
          console.warn('Chunk sync failed, remaining items stay queued in IndexedDB:', chunkErr);
          break; // Stop further chunks if connection drops mid-sync
        }
      }

      clearTimeout(coldStartTimer);
      setColdStartNotice(false);
      await refreshOutboxCount();
    } catch (err) {
      console.warn('Sync failed, items remain queued in IndexedDB:', err);
    } finally {
      setIsSyncing(false);
      setColdStartNotice(false);
    }
  }, [isSyncing, refreshOutboxCount]);

  // Auto sync when coming online or when new items are added
  useEffect(() => {
    if (isOnline && outboxCount > 0 && !isSyncing) {
      triggerSync();
    }
  }, [isOnline, outboxCount, isSyncing, triggerSync]);

  return {
    isOnline,
    outboxCount,
    isSyncing,
    coldStartNotice,
    triggerSync,
  };
}
