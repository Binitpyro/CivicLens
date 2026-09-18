import React, { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { db } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getAssetTypeIcon } from '../utils/iconHelpers';
import {
  IconCrosshair,
  IconCheck
} from '../components/CivicIcons';

const ASSET_TYPES = [
  { id: 'handpump', name: 'Handpump' },
  { id: 'streetlight', name: 'Streetlight' },
  { id: 'public_toilet', name: 'Public Toilet' },
  { id: 'drainage', name: 'Drainage Culvert' },
  { id: 'anganwadi', name: 'Anganwadi' },
  { id: 'school', name: 'School Facility' },
];

export const VolunteerQuickAdd: React.FC = () => {
  const { latitude, longitude, accuracy, getSingleFix, loading: geoLoading } = useGeolocation();
  const { triggerSync } = useOfflineSync();

  const [assetType, setAssetType] = useState<string>('handpump');
  const [assetName, setAssetName] = useState<string>('');
  const [lbdCode, setLbdCode] = useState<string>('');
  const [status, setStatus] = useState<string>('active');
  const [counter, setCounter] = useState<number>(0);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const assetId = 'ast_' + crypto.randomUUID();
      const newAsset = {
        id: assetId,
        ward_id: 1,
        asset_type: assetType,
        name: assetName || `${assetType.replace('_', ' ').toUpperCase()} #${counter + 1}`,
        lbd_asset_id: lbdCode || undefined,
        status,
        latitude: latitude || 28.6139,
        longitude: longitude || 77.2090,
        attributes: { surveyed_by: 'Field Volunteer' },
        version_id: 1,
        sync_state: 'saved' as const,
      };

      await db.transaction('rw', [db.assets, db.outbox], async () => {
        await db.assets.add(newAsset);
        await db.outbox.add({
          record_id: assetId,
          table_name: 'assets',
          action: 'create',
          payload: {
            id: assetId,
            ward_id: 1,
            asset_type: assetType,
            name: newAsset.name,
            lbd_asset_id: lbdCode || null,
            status,
            latitude: latitude || 28.6139,
            longitude: longitude || 77.2090,
            attributes: newAsset.attributes,
          },
          client_seq_num: Date.now(),
          created_at: new Date().toISOString(),
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
              {accuracy !== null ? `Accuracy ±${accuracy}m` : 'Ward 3 · Kalyanpur'}
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
          <span>Record Asset & Advance</span>
        </button>
      </form>
    </div>
  );
};
