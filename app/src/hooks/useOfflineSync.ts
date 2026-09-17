import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../db';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [coldStartNotice, setColdStartNotice] = useState<boolean>(false);
  const lastSyncAttemptRef = useRef<number>(0);

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

  // Sync outbox queue to server
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    if (Date.now() - lastSyncAttemptRef.current < 15000) return;
    lastSyncAttemptRef.current = Date.now();

    try {
      const outboxItems = await db.outbox.toArray();
      if (outboxItems.length === 0) return;

      setIsSyncing(true);

      // Cold-start timer notice
      const coldStartTimer = setTimeout(() => {
        setColdStartNotice(true);
      }, 3000);

      // Prepare batch payload
      const batch = outboxItems.map(item => ({
        record_id: item.record_id,
        table_name: item.table_name,
        action: item.action,
        payload: item.payload,
        client_seq_num: item.client_seq_num,
      }));

      // 45s HTTP client timeout for Render cold start
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const token = localStorage.getItem('civiclens_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batch }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearTimeout(coldStartTimer);
      setColdStartNotice(false);

      if (!response.ok) {
        throw new Error(`Sync HTTP error ${response.status}`);
      }

      const data = await response.json();
      const acks: Array<{ record_id: string; status: string }> = data.acks || [];

      // Purge synced items from outbox and update local sync_state to 'submitted' in an atomic transaction
      const validRecordIds = acks
        .filter(ack => ack.status === 'synced' || ack.status === 'conflict_logged')
        .map(ack => ack.record_id);

      if (validRecordIds.length > 0) {
        await db.transaction('rw', [db.outbox, db.issues, db.assets], async () => {
          for (const recordId of validRecordIds) {
            await db.outbox.where('record_id').equals(recordId).delete();
            await db.issues.where('id').equals(recordId).modify({ sync_state: 'submitted' });
            await db.assets.where('id').equals(recordId).modify({ sync_state: 'submitted' });
          }
        });
      }

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
