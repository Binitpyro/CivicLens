import React, { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { db } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getAssetTypeIcon } from '../utils/iconHelpers';
import { useWard } from '../context/WardContext';
import {
  IconCrosshair,
  IconCheck
} from '../components/CivicIcons';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

const ASSET_TYPES = [
  { id: 'handpump',      name: 'Handpump' },
  { id: 'streetlight',   name: 'Streetlight' },
  { id: 'public_toilet', name: 'Public Toilet' },
  { id: 'drainage',      name: 'Drainage Culvert' },
  { id: 'anganwadi',     name: 'Anganwadi' },
  { id: 'school',        name: 'School Facility' },
];

export const VolunteerQuickAdd: React.FC = () => {
  const { latitude, longitude, accuracy, getSingleFix, loading: geoLoading } = useGeolocation();
  const { triggerSync, isOnline } = useOfflineSync();
  const { wardId, wardLabel } = useWard();

  const [assetType, setAssetType] = useState<string>('handpump');
  const [assetName, setAssetName]  = useState<string>('');
  const [lbdCode,   setLbdCode]    = useState<string>('');
  const [status,    setStatus]     = useState<string>('active');
  const [counter,   setCounter]    = useState<number>(0);
  const [savedNotice,  setSavedNotice]  = useState<boolean>(false);
  const [isBulkSyncing, setIsBulkSyncing] = useState<boolean>(false);
  const [bulkResult,    setBulkResult]    = useState<{ inserted: number; updated: number; failed: number } | null>(null);

  // ── Record a single asset to local IndexedDB ──────────────────────────────
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const assetId  = 'ast_' + crypto.randomUUID();
      const newAsset = {
        id:          assetId,
        ward_id:     wardId,
        asset_type:  assetType,
        name:        assetName || `${assetType.replace('_', ' ').toUpperCase()} #${counter + 1}`,
        lbd_asset_id: lbdCode || undefined,
        status,
        latitude:    latitude  || 28.6139,
        longitude:   longitude || 77.2090,
        attributes:  { surveyed_by: 'Field Volunteer' },
        version_id:  1,
        sync_state:  'saved' as const,
      };

      await db.transaction('rw', [db.assets, db.outbox], async () => {
        await db.assets.add(newAsset);
        await db.outbox.add({
          record_id:      assetId,
          table_name:     'assets',
          action:         'create',
          payload: {
            id:           assetId,
            ward_id:      wardId,
            asset_type:   assetType,
            name:         newAsset.name,
            lbd_asset_id: lbdCode || null,
            status,
            latitude:     latitude  || 28.6139,
            longitude:    longitude || 77.2090,
            attributes:   newAsset.attributes,
          },
          client_seq_num: Date.now(),
          created_at:     new Date().toISOString(),
        });
      });

      setCounter(prev => prev + 1);
      setAssetName('');
      setLbdCode('');
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);

      getSingleFix();
      triggerSync();
    } catch (err) {
      console.error('Error in Quick Add asset:', err);
    }
  };

  // ── Bulk-sync all locally saved assets to server in one transaction ───────
  const handleBulkSync = async () => {
    if (isBulkSyncing || !isOnline) return;
    setIsBulkSyncing(true);
    setBulkResult(null);

    try {
      // Collect every locally-saved (not yet submitted) asset
      const pendingAssets = await db.assets
        .where('sync_state')
        .equals('saved')
        .toArray();

      if (pendingAssets.length === 0) {
        setBulkResult({ inserted: 0, updated: 0, failed: 0 });
        return;
      }

      const token = localStorage.getItem('civiclens_token');
      const res = await fetch(`${API_BASE}/assets/bulk`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ assets: pendingAssets }),
      });

      if (!res.ok) {
        throw new Error(`Server responded ${res.status}`);
      }

      const data = await res.json();

      // Mark successfully synced assets as 'submitted' in local DB
      if ((data.inserted + data.updated) > 0) {
        await db.assets
          .where('sync_state').equals('saved')
          .modify({ sync_state: 'submitted' });
        // Clear matching outbox entries
        await db.outbox
          .where('table_name').equals('assets')
          .delete();
      }

      setBulkResult({
        inserted: data.inserted || 0,
        updated:  data.updated  || 0,
        failed:   data.failed   || 0,
      });
    } catch (err) {
      console.error('Bulk sync failed:', err);
      setBulkResult({ inserted: 0, updated: 0, failed: -1 });
    } finally {
      setIsBulkSyncing(false);
    }
  };

  return (
    <div className="report-form-container" role="region" aria-label="Field Asset Rapid Survey">
      <div className="form-header-card">
        <div className="admin-header">
          <h2 className="view-heading">Rapid Field Survey</h2>
          <span className="status-badge submitted tabular-nums">
            {counter} Logged
          </span>
        </div>
        <p className="view-subheading">Fast-track geotagging for ward infrastructure field surveys.</p>
      </div>

      {savedNotice && (
        <div className="notice-banner">
          <IconCheck size={16} />
          <span>Asset #{counter} saved to local survey log!</span>
        </div>
      )}

      {/* Bulk Sync Banner */}
      {bulkResult && (
        <div
          className="notice-banner"
          style={{ background: bulkResult.failed === -1 ? 'var(--color-status-urgent)' : undefined }}
        >
          <IconCheck size={16} />
          {bulkResult.failed === -1
            ? <span>Bulk sync failed — assets remain queued locally.</span>
            : bulkResult.inserted + bulkResult.updated === 0
              ? <span>No pending assets to sync — all already submitted.</span>
              : <span>
                  Synced to server: {bulkResult.inserted} new, {bulkResult.updated} updated
                  {bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ''}.
                </span>
          }
        </div>
      )}

      <form onSubmit={handleQuickAdd}>
        <h3 className="form-section-title">1. Select Asset Type</h3>
        <div className="category-selection-grid" role="radiogroup" aria-label="Asset Type">
          {ASSET_TYPES.map((type) => {
            const isSelected = assetType === type.id;
            return (
              <button
                type="button"
                key={type.id}
                role="radio"
                aria-checked={isSelected}
                className={`category-card-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setAssetType(type.id)}
              >
                <div className="category-icon-box" aria-hidden="true">
                  {getAssetTypeIcon(type.id, 18)}
                </div>
                <span className="category-card-label">{type.name}</span>
              </button>
            );
          })}
        </div>

        <h3 className="form-section-title">2. Location Coordinates</h3>
        <div className="gps-fix-card">
          <div>
            <div className="gps-fix-coords">
              {geoLoading ? (
                <span>Acquiring GPS fix…</span>
              ) : latitude ? (
                <span className="tabular-nums">{latitude.toFixed(5)}°N, {longitude?.toFixed(5)}°E</span>
              ) : (
                <span>Coordinates unavailable</span>
              )}
            </div>
            <div className="gps-fix-meta">
              {accuracy !== null ? `Accuracy ±${accuracy}m` : wardLabel}
            </div>
          </div>
          <button
            type="button"
            className="filter-chip"
            onClick={getSingleFix}
            disabled={geoLoading}
            aria-label="Refresh GPS coordinates"
          >
            <IconCrosshair size={14} />
            <span>{geoLoading ? 'Fixing…' : 'Refresh'}</span>
          </button>
        </div>

        <h3 className="form-section-title">3. Operational Status</h3>
        <div className="severity-segmented-bar" role="radiogroup" aria-label="Operational status">
          <button
            type="button"
            role="radio"
            aria-checked={status === 'active'}
            className={`severity-pill-btn ${status === 'active' ? 'active-low' : ''}`}
            onClick={() => setStatus('active')}
          >
            Working Condition
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={status === 'non_functional'}
            className={`severity-pill-btn ${status === 'non_functional' ? 'active-critical' : ''}`}
            onClick={() => setStatus('non_functional')}
          >
            Non-Functional / Broken
          </button>
        </div>

        <div className="form-input-group">
          <label htmlFor="asset-name" className="form-label">
            Asset Name or Landmark (Optional)
          </label>
          <input
            id="asset-name"
            name="assetName"
            type="text"
            className="form-input"
            placeholder="e.g. Handpump near Panchayat Ghar…"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
          />
        </div>

        <div className="form-input-group">
          <label htmlFor="asset-lbd" className="form-label">
            Panchayat / LBD Asset ID (Optional)
          </label>
          <input
            id="asset-lbd"
            name="lbdCode"
            type="text"
            className="form-input"
            placeholder="e.g. LBD-HP-092…"
            value={lbdCode}
            onChange={(e) => setLbdCode(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn-primary-action"
          aria-label="Record asset to local database and advance to next"
        >
          <IconCheck size={18} />
          <span>Record Asset &amp; Advance</span>
        </button>
      </form>

      {/* End-of-survey bulk flush to server */}
      <div style={{ marginTop: '16px' }}>
        <button
          type="button"
          className={`btn-primary-action ${!isOnline ? 'disabled' : ''}`}
          style={{ background: 'var(--color-ink-muted)', opacity: isOnline ? 1 : 0.5 }}
          onClick={handleBulkSync}
          disabled={isBulkSyncing || !isOnline}
          aria-label="Upload all locally saved survey assets to server in one batch"
          title={!isOnline ? 'Go online to bulk sync' : `Upload all ${counter} locally saved assets to server`}
        >
          <IconCheck size={18} />
          <span>
            {isBulkSyncing
              ? 'Syncing to server…'
              : isOnline
                ? `📤 Sync All ${counter > 0 ? `(${counter})` : ''} to Server`
                : '📤 Sync All (offline)'}
          </span>
        </button>
        <p className="view-subheading" style={{ marginTop: 6, fontSize: '11px' }}>
          Sends all locally saved assets to the Gram Panchayat server in one batch. Use at end of survey trip.
        </p>
      </div>
    </div>
  );
};
