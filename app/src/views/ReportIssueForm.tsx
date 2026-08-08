import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../hooks/useGeolocation';
import { compressPhotoOffThread } from '../services/photoWorker';
import { db, encryptPII } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';

interface ReportIssueFormProps {
  onSuccess?: () => void;
}

const CATEGORIES = [
  { id: 'Water Supply', icon: '🚰', labelKey: 'categories.water', color: '#0284c7' },
  { id: 'Street Lighting', icon: '💡', labelKey: 'categories.lighting', color: '#eab308' },
  { id: 'Public Sanitation', icon: '🚽', labelKey: 'categories.sanitation', color: '#16a34a' },
  { id: 'Roads & Drains', icon: '🛣️', labelKey: 'categories.roads', color: '#ea580c' },
  { id: 'Health (PHC)', icon: '🏥', labelKey: 'categories.health', color: '#dc2626' },
  { id: 'School / Anganwadi', icon: '🏫', labelKey: 'categories.education', color: '#9333ea' },
];

export const ReportIssueForm: React.FC<ReportIssueFormProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const { latitude, longitude, accuracy, loading: geoLoading, getSingleFix } = useGeolocation();
  const { triggerSync } = useOfflineSync();

  const [category, setCategory] = useState<string>('Water Supply');
  const [severity, setSeverity] = useState<string>('medium');
  const [description, setDescription] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handle Photo Select and Off-Thread Web Worker Compression
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressing(true);
      const compressedUrl = await compressPhotoOffThread(file);
      setPhotoDataUrl(compressedUrl);
    } catch (err) {
      console.error('Error compressing photo:', err);
      alert('Photo optimization failed. Please try another photo.');
    } finally {
      setCompressing(false);
    }
  };

  // Submit Issue Report
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const issueId = 'iss_' + crypto.randomUUID();
      const encryptedPhone = phone ? await encryptPII(phone) : '';
      const clientSeqNum = Date.now();

      const newIssuePayload = {
        id: issueId,
        ward_id: 1,
        category,
        severity,
        description,
        photo_url: photoDataUrl || undefined,
        encrypted_phone: encryptedPhone,
        latitude: latitude || 28.6139,
        longitude: longitude || 77.2090,
        status: 'open',
        version_id: 1,
        client_seq_num: clientSeqNum,
        date_reported: new Date().toISOString(),
        sync_state: 'saved' as const,
      };

      // Write to Dexie Local Store
      await db.issues.add(newIssuePayload);

      // Write to Dexie Outbox Queue
      await db.outbox.add({
        record_id: issueId,
        table_name: 'issues',
        action: 'create',
        payload: {
          id: issueId,
          ward_id: 1,
          category,
          severity,
          description,
          photo_url: photoDataUrl || null,
          latitude: latitude || 28.6139,
          longitude: longitude || 77.2090,
          status: 'open',
        },
        client_seq_num: clientSeqNum,
        created_at: new Date().toISOString(),
      });

      setSuccessMsg('✅ Issue saved safely on your phone! Syncing to Panchayat server...');
      setSubmitting(false);

      // Reset Form
      setDescription('');
      setPhotoDataUrl(null);
      setPhone('');

      // Trigger background sync if online
      triggerSync();

      if (onSuccess) {
        setTimeout(onSuccess, 1500);
      }
    } catch (err) {
      console.error('Error submitting issue report:', err);
      alert('Failed to save issue report locally.');
      setSubmitting(false);
    }
  };

  return (
    <div className="report-form-container">
      <h2 className="form-heading">📢 {t('actions.reportIssue')}</h2>

      {successMsg && (
        <div className="form-success-banner">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 1. Touch-First 48px Icon Category Selector */}
        <label className="field-label">Select Issue Category</label>
        <div className="category-grid">
          {CATEGORIES.map((cat) => (
            <button
              type="button"
              key={cat.id}
              className={`category-card ${category === cat.id ? 'selected' : ''}`}
              style={{ borderColor: category === cat.id ? cat.color : '#e2e8f0' }}
              onClick={() => setCategory(cat.id)}
            >
              <span className="cat-icon">{cat.icon}</span>
              <span className="cat-label">{t(cat.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* 2. Severity Selector */}
        <label className="field-label">Severity Level</label>
        <div className="severity-selector">
          {['low', 'medium', 'high', 'critical'].map((sev) => (
            <button
              type="button"
              key={sev}
              className={`sev-btn sev-${sev} ${severity === sev ? 'selected' : ''}`}
              onClick={() => setSeverity(sev)}
            >
              {sev.toUpperCase()}
            </button>
          ))}
        </div>

        {/* 3. Single-Shot GPS Location Capture */}
        <div className="location-box">
          <div className="location-info">
            <span>📍 Pin Location:</span>
            <strong>
              {latitude?.toFixed(4)}, {longitude?.toFixed(4)}
            </strong>
            {accuracy !== null && <span className="accuracy-tag">(±{accuracy}m)</span>}
          </div>
          <button type="button" className="btn-get-gps" onClick={getSingleFix} disabled={geoLoading}>
            {geoLoading ? 'Acquiring GPS...' : '🎯 Update Location'}
          </button>
        </div>

        {/* 4. Asynchronous Photo Upload with Worker Compression */}
        <label className="field-label">Attach Photo (Optional)</label>
        <div className="photo-upload-box">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            id="camera-input"
            style={{ display: 'none' }}
            onChange={handlePhotoSelect}
          />
          <label htmlFor="camera-input" className="btn-photo-trigger">
            📷 {photoDataUrl ? 'Change Photo' : t('actions.takePhoto')}
          </label>

          {compressing && <div className="compressing-indicator">⏳ {t('actions.compressing')}</div>}

          {photoDataUrl && (
            <div className="photo-preview-container">
              <img src={photoDataUrl} alt="Issue preview" className="photo-preview-img" />
              <span className="photo-size-badge">Optimized (≤150KB, EXIF Cleaned)</span>
            </div>
          )}
        </div>

        {/* 5. Optional Description & Encrypted Contact */}
        <label className="field-label">Issue Details</label>
        <textarea
          className="input-textarea"
          rows={3}
          placeholder="Describe the broken handpump, road damage, or lighting issue..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="field-label">Phone Number (Optional - Encrypted)</label>
        <input
          type="tel"
          className="input-text"
          placeholder="Enter 10-digit mobile number for status SMS"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {/* Submit CTA in Natural Thumb Zone */}
        <button type="submit" className="btn-submit-issue" disabled={submitting || compressing}>
          {submitting ? 'Saving to Phone...' : '🚀 Submit Report'}
        </button>
      </form>
    </div>
  );
};
