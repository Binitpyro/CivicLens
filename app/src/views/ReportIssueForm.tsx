import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../hooks/useGeolocation';
import { compressPhotoOffThread } from '../services/photoWorker';
import { db, encryptPII } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { 
  getCategoryIcon, 
  IconCamera, 
  IconCrosshair, 
  IconCheck, 
  IconLock 
} from '../components/CivicIcons';

interface ReportIssueFormProps {
  onSuccess?: () => void;
  initialCoords?: { lat: number; lng: number } | null;
}

const CATEGORIES = [
  { id: 'Water Supply', labelKey: 'categories.water' },
  { id: 'Street Lighting', labelKey: 'categories.lighting' },
  { id: 'Public Sanitation', labelKey: 'categories.sanitation' },
  { id: 'Roads & Drains', labelKey: 'categories.roads' },
  { id: 'Health (PHC)', labelKey: 'categories.health' },
  { id: 'School / Anganwadi', labelKey: 'categories.education' },
];

export const ReportIssueForm: React.FC<ReportIssueFormProps> = ({ onSuccess, initialCoords }) => {
  const { t } = useTranslation();
  const { latitude: geoLat, longitude: geoLng, accuracy, loading: geoLoading, getSingleFix } = useGeolocation();
  const { triggerSync } = useOfflineSync();

  const latitude = initialCoords?.lat ?? geoLat;
  const longitude = initialCoords?.lng ?? geoLng;

  const [category, setCategory] = useState<string>('Water Supply');
  const [severity, setSeverity] = useState<string>('medium');
  const [description, setDescription] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handle Photo Select and Off-Thread Compression
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressing(true);
      const compressedUrl = await compressPhotoOffThread(file);
      setPhotoDataUrl(compressedUrl);
    } catch (err) {
      console.error('Error compressing photo:', err);
      alert('Photo optimization failed. Please try another image.');
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

      // Write to Dexie Local Store & Outbox Queue atomically
      await db.transaction('rw', [db.issues, db.outbox], async () => {
        await db.issues.add(newIssuePayload);
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
            encrypted_phone: encryptedPhone || null,
            latitude: latitude || 28.6139,
            longitude: longitude || 77.2090,
            status: 'open',
          },
          client_seq_num: clientSeqNum,
          created_at: new Date().toISOString(),
        });
      });

      setSuccessMsg('Issue recorded on device. Will sync to Gram Panchayat server.');
      setSubmitting(false);

      setDescription('');
      setPhotoDataUrl(null);
      setPhone('');

      triggerSync();

      if (onSuccess) {
        setTimeout(onSuccess, 1000);
      }
    } catch (err) {
      console.error('Error submitting issue report:', err);
      alert('Failed to save issue report locally.');
      setSubmitting(false);
    }
  };

  return (
    <div className="report-form-container">
      <div className="form-header-card">
        <h2 className="view-heading">{t('actions.reportIssue')}</h2>
        <p className="view-subheading">Log public infrastructure issues for Gram Panchayat Ward 3.</p>
      </div>

      {successMsg && (
        <div className="status-badge submitted" style={{ padding: '8px 12px', marginBottom: 16, width: '100%', borderRadius: 'var(--radius-sm)' }} role="alert">
          <IconCheck size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 1. Category Selection */}
        <h3 className="form-section-title">1. Category</h3>
        <div className="category-selection-grid" role="radiogroup" aria-label="Incident category">
          {CATEGORIES.map((cat) => {
            const isSelected = category === cat.id;
            return (
              <button
                type="button"
                key={cat.id}
                role="radio"
                aria-checked={isSelected}
                className={`category-card-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setCategory(cat.id)}
              >
                <div className="category-icon-box" aria-hidden="true">
                  {getCategoryIcon(cat.id, 18)}
                </div>
                <span className="category-card-label">{t(cat.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* 2. Severity Segmented Control */}
        <h3 className="form-section-title">2. Urgency Level</h3>
        <div className="severity-segmented-bar" role="radiogroup" aria-label="Urgency level">
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'low'}
            className={`severity-pill-btn ${severity === 'low' ? 'active-low' : ''}`}
            onClick={() => setSeverity('low')}
          >
            Normal
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'medium'}
            className={`severity-pill-btn ${severity === 'medium' ? 'active-medium' : ''}`}
            onClick={() => setSeverity('medium')}
          >
            Moderate
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'high'}
            className={`severity-pill-btn ${severity === 'high' ? 'active-high' : ''}`}
            onClick={() => setSeverity('high')}
          >
            Urgent
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'critical'}
            className={`severity-pill-btn ${severity === 'critical' ? 'active-critical' : ''}`}
            onClick={() => setSeverity('critical')}
          >
            Immediate
          </button>
        </div>

        {/* 3. Location Coordinates */}
        <h3 className="form-section-title">3. Location Coordinates</h3>
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-rule)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-md)'
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
              {geoLoading ? (
                <span>Acquiring GPS fix…</span>
              ) : latitude ? (
                <span className="tabular-nums">{latitude.toFixed(5)}°N, {longitude?.toFixed(5)}°E</span>
              ) : (
                <span>Coordinates unavailable</span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', marginTop: 2 }}>
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

        {/* 4. Photo Evidence */}
        <h3 className="form-section-title">4. Photo Evidence</h3>
        {photoDataUrl ? (
          <div className="photo-preview-container">
            <img src={photoDataUrl} alt="Issue preview" className="photo-preview-image" />
            <button
              type="button"
              className="btn-remove-photo"
              onClick={() => setPhotoDataUrl(null)}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="photo-upload-zone">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              id="camera-input"
              style={{ display: 'none' }}
              onChange={handlePhotoSelect}
            />
            <label htmlFor="camera-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
              <div className="category-icon-box" style={{ width: 44, height: 44 }}>
                <IconCamera size={22} />
              </div>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-ink)' }}>
                {compressing ? t('actions.compressing') : t('actions.takePhoto')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)' }}>
                Camera or gallery photo (auto-compressed on phone)
              </span>
            </label>
          </div>
        )}

        {/* 5. Description */}
        <div className="form-input-group">
          <label htmlFor="issue-description" className="form-label">
            Notes & Landmark Description
          </label>
          <textarea
            id="issue-description"
            className="form-textarea"
            placeholder="Describe the issue, nearby house, or landmark..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* 6. Citizen Contact for Status Alert */}
        <div className="form-input-group">
          <label htmlFor="reporter-phone" className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconLock size={13} color="var(--color-ink-muted)" />
            <span>Phone Number (Optional, for SMS status updates)</span>
          </label>
          <input
            id="reporter-phone"
            type="tel"
            inputMode="tel"
            className="form-input"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          className="btn-primary-action" 
          disabled={submitting || compressing}
        >
          <IconCheck size={18} />
          <span>{submitting ? 'Saving to Device…' : t('actions.reportIssue')}</span>
        </button>
      </form>
    </div>
  );
};
