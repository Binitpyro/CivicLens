import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../hooks/useGeolocation';
import { useCompassHeading } from '../hooks/useCompassHeading';
import { db, encryptPII, type PhotoCaptureMeta } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { checkOfflineDuplicates, queueOfflineCorroboration, type OfflineDuplicateMatch } from '../services/offlineDedup';
import {
  captureCameraOnlyPhoto,
  CameraCancelledError,
  CameraPermissionError,
  CameraUnavailableError,
} from '../services/cameraService';
import { CameraReviewModal } from '../components/CameraReviewModal';
import { PermissionPromptCard } from '../components/PermissionPromptCard';
import {
  getCategoryIcon,
  IconCamera,
  IconCrosshair,
  IconCheck,
  IconLock,
  IconAlertTriangle,
  IconThumbsUp,
  IconShield,
  IconTrash,
  IconMapPin,
} from '../components/CivicIcons';

interface ReportIssueFormProps {
  onSuccess?: () => void;
  initialCoords?: { lat: number; lng: number } | null;
  onClearSelectedCoords?: () => void;
  onPickOnMap?: () => void;
  wardId?: number;
}

const MAX_PHOTOS = 3;

const CATEGORIES = [
  { id: 'Water Supply', labelKey: 'categories.water' },
  { id: 'Street Lighting', labelKey: 'categories.lighting' },
  { id: 'Public Sanitation', labelKey: 'categories.sanitation' },
  { id: 'Roads & Drains', labelKey: 'categories.roads' },
  { id: 'Health (PHC)', labelKey: 'categories.health' },
  { id: 'School / Anganwadi', labelKey: 'categories.education' },
];

export const ReportIssueForm: React.FC<ReportIssueFormProps> = ({
  onSuccess,
  initialCoords,
  onClearSelectedCoords,
  onPickOnMap,
  wardId = 1,
}) => {
  const { t } = useTranslation();
  const {
    latitude: geoLat,
    longitude: geoLng,
    accuracy,
    speed,
    heading,
    locationSource,
    permissionState,
    qualityTier,
    loading: geoLoading,
    requestPermissionAndStart,
    refreshFix,
  } = useGeolocation();
  const { headingDegrees, cardinal } = useCompassHeading({ gpsHeading: heading, speed });
  const { triggerSync } = useOfflineSync();

  const [overriddenCoords, setOverriddenCoords] = useState<{ lat: number; lng: number } | null>(null);

  const isUsingManualPin =
    Boolean(initialCoords) &&
    !(overriddenCoords && initialCoords && overriddenCoords.lat === initialCoords.lat && overriddenCoords.lng === initialCoords.lng);
  const latitude = isUsingManualPin ? initialCoords!.lat : geoLat;
  const longitude = isUsingManualPin ? initialCoords!.lng : geoLng;
  const effectiveLocationSource: 'gps' | 'manual_pin' | null = isUsingManualPin
    ? 'manual_pin'
    : (locationSource ?? (geoLat !== null ? 'gps' : null));
  const effectiveAccuracy = isUsingManualPin ? null : accuracy;
  const effectiveQualityTier = isUsingManualPin ? 'none' : qualityTier;
  const hasValidLocation =
    latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);

  const [category, setCategory] = useState<string>('Water Supply');
  const [severity, setSeverity] = useState<string>('medium');
  const [description, setDescription] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [photos, setPhotos] = useState<PhotoCaptureMeta[]>([]);
  const [cameraModal, setCameraModal] = useState<{
    isOpen: boolean;
    mode: 'native' | 'webrtc';
    initialDataUrl: string | null;
  }>({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [nearbyDuplicates, setNearbyDuplicates] = useState<OfflineDuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState<boolean>(false);

  useEffect(() => {
    let isCurrent = true;
    const lat = latitude;
    const lng = longitude;

    if (lat === null || lng === null) {
      Promise.resolve().then(() => {
        if (isCurrent) {
          setNearbyDuplicates([]);
          setCheckingDuplicates(false);
        }
      });
      return () => {
        isCurrent = false;
      };
    }

    Promise.resolve()
      .then(() => {
        if (isCurrent) setCheckingDuplicates(true);
        return checkOfflineDuplicates(lat, lng, category);
      })
      .then((matches) => {
        if (isCurrent) {
          setNearbyDuplicates(matches);
          setCheckingDuplicates(false);
        }
      })
      .catch(() => {
        if (isCurrent) setCheckingDuplicates(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [latitude, longitude, category]);

  const handleCorroborate = async (targetIssue: OfflineDuplicateMatch) => {
    if (latitude === null || longitude === null) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await queueOfflineCorroboration({
        issueId: targetIssue.issue.id,
        actionType: 'upvote',
        latitude,
        longitude,
        deviceFingerprint: localStorage.getItem('civiclens_device_key_seed') || 'pwa-client',
      });
      setSuccessMsg(
        t('form.issueConfirmed', {
          category: targetIssue.issue.category,
          distance: targetIssue.distanceMeters,
        })
      );
      triggerSync();
      if (onSuccess) {
        setTimeout(onSuccess, 1200);
      }
    } catch (err) {
      console.error('Error corroborating issue:', err);
      setSubmitError('Failed to record upvote. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTakePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    setCameraError(null);
    setCameraPermissionDenied(false);

    try {
      const result = await captureCameraOnlyPhoto();
      if (result.mode === 'native') {
        setCameraModal({ isOpen: true, mode: 'native', initialDataUrl: result.dataUrl });
      } else {
        setCameraModal({ isOpen: true, mode: 'webrtc', initialDataUrl: null });
      }
    } catch (err) {
      if (err instanceof CameraCancelledError) {
        return;
      }
      if (err instanceof CameraPermissionError) {
        setCameraPermissionDenied(true);
        return;
      }
      if (err instanceof CameraUnavailableError) {
        setCameraError(err.message);
        return;
      }
      setCameraError(err instanceof Error ? err.message : 'Unable to open camera.');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidLocation || latitude === null || longitude === null || submitting) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const issueId = 'iss_' + crypto.randomUUID();
      const encryptedPhone = phone ? await encryptPII(phone) : '';
      const clientSeqNum = Date.now();
      const finalLocationSource: 'gps' | 'manual_pin' =
        effectiveLocationSource === 'manual_pin' ? 'manual_pin' : 'gps';
      const primaryPhotoUrl = photos[0]?.data_url;

      const newIssuePayload = {
        id: issueId,
        ward_id: wardId,
        category,
        severity,
        description,
        photo_url: primaryPhotoUrl || undefined,
        photos,
        gps_accuracy_m: effectiveAccuracy,
        heading_deg: headingDegrees,
        location_source: finalLocationSource,
        encrypted_phone: encryptedPhone,
        latitude,
        longitude,
        status: 'open',
        version_id: 1,
        client_seq_num: clientSeqNum,
        date_reported: new Date().toISOString(),
        sync_state: 'saved' as const,
      };

      await db.transaction('rw', [db.issues, db.outbox], async () => {
        await db.issues.add(newIssuePayload);
        await db.outbox.add({
          record_id: issueId,
          table_name: 'issues',
          action: 'create',
          payload: {
            id: issueId,
            ward_id: wardId,
            category,
            severity,
            description,
            photo_url: primaryPhotoUrl || null,
            photos,
            gps_accuracy_m: effectiveAccuracy,
            heading_deg: headingDegrees,
            location_source: finalLocationSource,
            encrypted_phone: encryptedPhone || null,
            latitude,
            longitude,
            status: 'open',
          },
          client_seq_num: clientSeqNum,
          created_at: new Date().toISOString(),
        });
      });

      setSuccessMsg(t('form.savedLocallyBanner'));
      setSubmitting(false);

      setDescription('');
      setPhotos([]);
      setPhone('');

      triggerSync();

      if (onSuccess) {
        setTimeout(onSuccess, 1000);
      }
    } catch (err) {
      console.error('Error submitting issue report:', err);
      setSubmitError('Failed to save issue report locally. Please try again.');
      setSubmitting(false);
    }
  };

  const needsLocationPermissionPrompt =
    !isUsingManualPin && (permissionState === 'denied' || permissionState === 'gps_disabled');

  const gpsQualityLabel = isUsingManualPin
    ? t('gps.manualPinLabel')
    : qualityTier === 'excellent'
      ? `${t('gps.excellent')} (±${accuracy}m)`
      : qualityTier === 'fair'
        ? `${t('gps.fair')} (±${accuracy}m)`
        : qualityTier === 'poor'
          ? `${t('gps.poor')} (±${accuracy}m)`
          : t('gps.acquiring');

  return (
    <div className="report-form-container">
      <div className="form-header-card">
        <h2 className="view-heading">{t('actions.reportIssue')}</h2>
        <p className="view-subheading">{t('form.reportSubtitle')}</p>
      </div>

      {successMsg && (
        <div className="notice-banner" role="alert">
          <IconCheck size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {submitError && (
        <div className="gps-gate-warning" role="alert">
          <IconAlertTriangle size={15} />
          <span>{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <h3 className="form-section-title">{t('form.stepCategory')}</h3>
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

        <h3 className="form-section-title">{t('form.stepUrgency')}</h3>
        <div className="severity-segmented-bar" role="radiogroup" aria-label="Urgency level">
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'low'}
            className={`severity-pill-btn ${severity === 'low' ? 'active-low' : ''}`}
            onClick={() => setSeverity('low')}
          >
            {t('urgency.low')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'medium'}
            className={`severity-pill-btn ${severity === 'medium' ? 'active-medium' : ''}`}
            onClick={() => setSeverity('medium')}
          >
            {t('urgency.medium')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'high'}
            className={`severity-pill-btn ${severity === 'high' ? 'active-high' : ''}`}
            onClick={() => setSeverity('high')}
          >
            {t('urgency.high')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={severity === 'critical'}
            className={`severity-pill-btn ${severity === 'critical' ? 'active-critical' : ''}`}
            onClick={() => setSeverity('critical')}
          >
            {t('urgency.critical')}
          </button>
        </div>

        <h3 className="form-section-title">{t('form.stepLocation')}</h3>
        {needsLocationPermissionPrompt && (
          <PermissionPromptCard
            kind="location"
            permissionState={permissionState}
            onRetry={requestPermissionAndStart}
          />
        )}

        <div className={`gps-fix-card gps-tier-${effectiveQualityTier}`}>
          <div className="gps-fix-details">
            <div className="gps-fix-coords">
              {hasValidLocation && latitude !== null && longitude !== null ? (
                <span className="tabular-nums">
                  {latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E
                </span>
              ) : (
                <span>{t('gps.acquiring')}</span>
              )}
            </div>
            {(hasValidLocation || isUsingManualPin) && (
              <div className="gps-fix-meta-pills">
                <span className={`gps-tier-pill gps-tier-${effectiveQualityTier}`}>
                  {isUsingManualPin ? <IconMapPin size={11} /> : <span className="gps-tier-dot" />}
                  <span>{gpsQualityLabel}</span>
                </span>
                {headingDegrees !== null && !isUsingManualPin && (
                  <span className="gps-tier-pill gps-tier-none tabular-nums">
                    {headingDegrees}°{cardinal ? ` ${cardinal}` : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="gps-fix-actions">
            {onPickOnMap && (
              <button
                type="button"
                className="filter-chip"
                onClick={onPickOnMap}
              >
                <IconMapPin size={14} />
                <span>{t('form.pickOnMap')}</span>
              </button>
            )}
            {isUsingManualPin ? (
              <button
                type="button"
                className="filter-chip"
                onClick={() => {
                  if (initialCoords) {
                    setOverriddenCoords(initialCoords);
                  }
                  onClearSelectedCoords?.();
                  refreshFix();
                }}
              >
                <IconCrosshair size={14} />
                <span>{t('actions.useLiveGps')}</span>
              </button>
            ) : (
              <button
                type="button"
                className="filter-chip"
                onClick={refreshFix}
                disabled={geoLoading}
                aria-label="Refresh GPS coordinates"
              >
                <IconCrosshair size={14} />
                <span>{geoLoading ? t('form.fixing') : t('form.refresh')}</span>
              </button>
            )}
          </div>
        </div>

        {!hasValidLocation && (
          <div className="gps-gate-warning" role="status">
            <IconAlertTriangle size={15} />
            <span>{t('gps.gateBlocked')}</span>
          </div>
        )}

        {checkingDuplicates && (
          <div className="duplicate-scan-banner">
            <span className="spinner spinner-sm" />
            <span>{t('form.checkingDuplicates')}</span>
          </div>
        )}

        {nearbyDuplicates.length > 0 && (
          <div className="duplicate-alert-card" role="status">
            <div className="duplicate-alert-head">
              <IconAlertTriangle size={16} />
              <span className="tabular-nums">
                {t('form.similarIssueNearby', {
                  distance: nearbyDuplicates[0].distanceMeters,
                  bearing:
                    nearbyDuplicates[0].bearingDegrees !== null
                      ? `, ${nearbyDuplicates[0].bearingDegrees}°`
                      : t('form.exactSpot'),
                })}
              </span>
            </div>
            <p className="duplicate-alert-desc">
              <strong>{nearbyDuplicates[0].issue.category}</strong>:{' '}
              {nearbyDuplicates[0].issue.description || 'Open civic grievance logged recently'}
            </p>
            <div className="duplicate-alert-actions">
              <button
                type="button"
                className="btn-corroborate"
                onClick={() => handleCorroborate(nearbyDuplicates[0])}
                disabled={submitting}
              >
                <IconThumbsUp size={15} />
                <span>{t('form.confirmUpvote')}</span>
              </button>
            </div>
          </div>
        )}

        <div className="camera-only-header">
          <h3 className="form-section-title">
            {t('form.stepPhotos', { count: photos.length, max: MAX_PHOTOS })}
          </h3>
          <span className="camera-only-badge">
            <IconShield size={12} />
            <span>{t('camera.cameraOnlyBadge')}</span>
          </span>
        </div>

        {cameraPermissionDenied && (
          <PermissionPromptCard
            kind="camera"
            permissionState="denied"
            onRetry={handleTakePhoto}
          />
        )}

        {cameraError && (
          <div className="gps-gate-warning" role="alert">
            <IconAlertTriangle size={15} />
            <span>{cameraError}</span>
          </div>
        )}

        <div className="multi-photo-grid">
          {photos.map((photo, idx) => (
            <div key={`${photo.captured_at}-${idx}`} className="photo-thumb-card">
              <img
                src={photo.data_url}
                alt={`Captured evidence ${idx + 1}`}
                className="photo-thumb-img"
              />
              <button
                type="button"
                className="photo-thumb-remove"
                onClick={() => handleRemovePhoto(idx)}
                aria-label={`Remove photo ${idx + 1}`}
              >
                <IconTrash size={14} />
              </button>
              <div className="photo-thumb-meta">
                <div className="photo-thumb-badges">
                  <span className="status-badge info tabular-nums">
                    dHash: {photo.dhash.slice(0, 8)}
                  </span>
                  {photo.quality_warnings.length > 0 ? (
                    <span className="status-badge saved">
                      {photo.quality_warnings.length} warn
                    </span>
                  ) : (
                    <span className="status-badge submitted">Verified</span>
                  )}
                </div>
                <span className="tabular-nums">
                  {photo.location_source === 'manual_pin'
                    ? t('gps.manualPinLabel')
                    : photo.accuracy_m !== null
                      ? `±${Math.round(photo.accuracy_m)}m GPS`
                      : t('gps.liveLabel')}
                  {photo.heading_deg !== null ? ` · ${Math.round(photo.heading_deg)}°` : ''}
                </span>
              </div>
            </div>
          ))}

          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              className="photo-add-slot-btn"
              onClick={handleTakePhoto}
              aria-label={photos.length === 0 ? t('actions.takePhoto') : t('actions.addAnotherPhoto')}
            >
              <div className="category-icon-box photo-upload-icon">
                <IconCamera size={20} />
              </div>
              <span>
                {photos.length === 0
                  ? t('actions.takePhoto')
                  : `${t('actions.addAnotherPhoto')} (${photos.length}/${MAX_PHOTOS})`}
              </span>
              <span className="photo-upload-hint">{t('camera.telemetryStamped')}</span>
            </button>
          )}
        </div>

        <div className="form-input-group">
          <label htmlFor="issue-description" className="form-label">
            {t('form.notesLabel')}
          </label>
          <textarea
            id="issue-description"
            className="form-textarea"
            placeholder={t('form.notesPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="form-input-group">
          <label htmlFor="reporter-phone" className="form-label form-label-with-icon">
            <IconLock size={13} color="var(--color-ink-muted)" />
            <span>{t('form.phoneLabel')}</span>
          </label>
          <input
            id="reporter-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="form-input"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {!hasValidLocation && (
          <p className="submit-helper-hint">{t('form.gpsRequiredHint')}</p>
        )}

        <button
          type="submit"
          className="btn-primary-action"
          disabled={submitting || !hasValidLocation}
        >
          <IconCheck size={18} />
          <span>{submitting ? t('form.savingToDevice') : t('actions.reportIssue')}</span>
        </button>
      </form>

      <CameraReviewModal
        isOpen={cameraModal.isOpen}
        mode={cameraModal.mode}
        initialDataUrl={cameraModal.initialDataUrl}
        telemetry={{
          latitude,
          longitude,
          accuracy: effectiveAccuracy,
          headingDegrees,
          locationSource: effectiveLocationSource,
        }}
        title={t('actions.takePhoto')}
        onConfirm={(capturedMeta) => {
          setPhotos((prev) => [...prev.slice(0, MAX_PHOTOS - 1), capturedMeta]);
          setCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
        }}
        onCancel={() => {
          setCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
        }}
      />
    </div>
  );
};
