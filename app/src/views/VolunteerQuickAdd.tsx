import React, { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { db } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';

const ASSET_TYPES = [
  { id: 'handpump', icon: '🚰', name: 'Handpump' },
  { id: 'streetlight', icon: '💡', name: 'Streetlight' },
  { id: 'public_toilet', icon: '🚽', name: 'Public Toilet' },
  { id: 'drainage', icon: '🛣️', name: 'Drainage' },
  { id: 'anganwadi', icon: '🏠', name: 'Anganwadi' },
  { id: 'school', icon: '🏫', name: 'School' },
];

export const VolunteerQuickAdd: React.FC = () => {
  const { latitude, longitude, getSingleFix } = useGeolocation();
  const { triggerSync } = useOfflineSync();

  const [assetType, setAssetType] = useState<string>('handpump');
  const [assetName, setAssetName] = useState<string>('');
  const [lbdCode, setLbdCode] = useState<string>('');
  const [status, setStatus] = useState<string>('active');
  const [counter, setCounter] = useState<number>(0);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const assetId = 'ast_' + crypto.randomUUID();
      const newAsset = {
        id: assetId,
        ward_id: 1,
        asset_type: assetType,
        name: assetName || `${assetType.toUpperCase()} #${counter + 1}`,
        lbd_asset_id: lbdCode || undefined,
        status,
        latitude: latitude || 28.6139,
        longitude: longitude || 77.2090,
        attributes: { surveyed_by: 'ASHA Field Worker' },
        version_id: 1,
        sync_state: 'saved' as const,
      };

      // Write asset to Dexie
      await db.assets.add(newAsset);

      // Add to Outbox Queue
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

      setCounter(prev => prev + 1);
      setAssetName('');
      setLbdCode('');

      // Refresh location for next point
      getSingleFix();
      triggerSync();
    } catch (err) {
      console.error('Error in Quick Add asset:', err);
    }
  };

  return (
    <div className="quick-add-container">
      <div className="quick-add-header">
        <h2>⚡ Volunteer Rapid Survey Mode</h2>
        <span className="survey-count-badge">Total Surveyed: {counter} Assets</span>
      </div>

      <form onSubmit={handleQuickAdd} className="quick-add-form">
        <label className="field-label">1-Tap Select Asset Type</label>
        <div className="asset-type-grid">
          {ASSET_TYPES.map((type) => (
            <button
              type="button"
              key={type.id}
              className={`asset-type-card ${assetType === type.id ? 'selected' : ''}`}
              onClick={() => setAssetType(type.id)}
            >
              <span className="type-icon">{type.icon}</span>
              <span className="type-name">{type.name}</span>
            </button>
          ))}
        </div>

        <div className="quick-location-box">
          <span>📍 Geotag: {latitude?.toFixed(4)}, {longitude?.toFixed(4)}</span>
          <button type="button" className="btn-gps-refresh" onClick={getSingleFix}>
            🎯 Refix GPS
          </button>
        </div>

        <label className="field-label">Asset Name / Tag (Optional)</label>
        <input
          type="text"
          className="input-text"
          placeholder="e.g. Handpump near Panchayat Ghar"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
        />

        <label className="field-label">Govt LBD Code (Optional)</label>
        <input
          type="text"
          className="input-text"
          placeholder="e.g. LBD-HP-901"
          value={lbdCode}
          onChange={(e) => setLbdCode(e.target.value)}
        />

        <label className="field-label">Working Condition</label>
        <div className="status-button-group">
          <button
            type="button"
            className={`btn-status ${status === 'active' ? 'active-green' : ''}`}
            onClick={() => setStatus('active')}
          >
            🟢 Working (Active)
          </button>
          <button
            type="button"
            className={`btn-status ${status === 'non_functional' ? 'active-red' : ''}`}
            onClick={() => setStatus('non_functional')}
          >
            🔴 Non-Functional
          </button>
        </div>

        <button type="submit" className="btn-quick-submit">
          ⚡ 1-Tap Save Asset & Move to Next
        </button>
      </form>
    </div>
  );
};
