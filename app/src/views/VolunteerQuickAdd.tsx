import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../hooks/useGeolocation';
import { useCompassHeading } from '../hooks/useCompassHeading';
import { db, type PhotoCaptureMeta } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';
import {
  captureCameraOnlyPhoto,
  CameraCancelledError,
  CameraPermissionError,
  CameraUnavailableError,
} from '../services/cameraService';
import { CameraReviewModal } from '../components/CameraReviewModal';
import { PermissionPromptCard } from '../components/PermissionPromptCard';
import {
  getAssetTypeIcon,
  IconCrosshair,
  IconCheck,
  IconCamera,
  IconAlertTriangle,
  IconShield,
  IconTrash,
  IconMapPin,
} from '../components/CivicIcons';

const ASSET_TYPES = [
  { id: 'handpump', name: 'Handpump' },
  { id: 'streetlight', name: 'Streetlight' },
  { id: 'public_toilet', name: 'Public Toilet' },
  { id: 'drainage', name: 'Drainage Culvert' },
  { id: 'anganwadi', name: 'Anganwadi' },
  { id: 'school', name: 'School Facility' },
];

interface VolunteerQuickAddProps {
  wardId?: number;
  initialCoords?: { lat: number; lng: number } | null;
  initialAssetType?: string | null;
  onClearSelectedCoords?: () => void;
  onPickOnMap?: () => void;
}

export const VolunteerQuickAdd: React.FC<VolunteerQuickAddProps> = ({
  wardId = 1,
  initialCoords,
  initialAssetType,
  onClearSelectedCoords,
  onPickOnMap,
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
  const effectiveLocationSource: 'gps' | 'manual_pin' = isUsingManualPin
    ? 'manual_pin'
    : (locationSource ?? 'gps');
  const effectiveAccuracy = isUsingManualPin ? null : accuracy;
  const effectiveQualityTier = isUsingManualPin ? 'none' : qualityTier;

  const [assetType, setAssetType] = useState<string>(() =>
    initialAssetType && ASSET_TYPES.some((item) => item.id === initialAssetType)
      ? initialAssetType
      : 'handpump'
  );
  const [assetName, setAssetName] = useState<string>('');
  const [lbdCode, setLbdCode] = useState<string>('');
  const [status, setStatus] = useState<string>('active');
  const [counter, setCounter] = useState<number>(0);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [photo, setPhoto] = useState<PhotoCaptureMeta | null>(null);
  const [cameraModal, setCameraModal] = useState<{
    isOpen: boolean;
    mode: 'native' | 'webrtc';
    initialDataUrl: string | null;
  }>({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const hasValidLocation =
    latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
  const needsLocationPermissionPrompt =
    !isUsingManualPin && (permissionState === 'denied' || permissionState === 'gps_disabled');

  const handleTakePhoto = async () => {
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
      setCameraError(err instanceof Error ? err.message : 'Failed to open camera.');
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidLocation || latitude === null || longitude === null || submitting) return;

    setSaveError(null);
    setSubmitting(true);
    try {
      const assetId = 'ast_' + crypto.randomUUID();
      const attributes: Record<string, unknown> = {
        surveyed_by: 'Field Volunteer',
        gps_accuracy_m: effectiveAccuracy,
        heading_deg: isUsingManualPin ? null : headingDegrees,
        location_source: effectiveLocationSource,
        ...(photo ? { photo_meta: photo } : {}),
      };

      const newAsset = {
        id: assetId,
        ward_id: wardId,
        asset_type: assetType,
        name: assetName || `${assetType.replace('_', ' ').toUpperCase()} #${counter + 1}`,
        lbd_asset_id: lbdCode || undefined,
        status,
        latitude,
        longitude,
        photo_url: photo?.data_url || undefined,
        attributes,
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
            ward_id: wardId,
            asset_type: assetType,
            name: newAsset.name,
            lbd_asset_id: lbdCode || null,
            status,
            latitude,
            longitude,
            photo_url: photo?.data_url || null,
            attributes,
          },
          client_seq_num: Date.now(),
          created_at: new Date().toISOString(),
        });
      });

      setCounter((prev) => prev + 1);
      setAssetName('');
      setLbdCode('');
      setPhoto(null);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2400);

      refreshFix();
      triggerSync();
    } catch (err) {
      console.error('Error in Quick Add asset:', err);
      setSaveError('Failed to save asset locally. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const gpsQualityLabel = isUsingManualPin
    ? t('gps.manualPinLabel')
    : effectiveQualityTier === 'excellent'
      ? `${t('gps.excellent')} (±${effectiveAccuracy}m)`
      : effectiveQualityTier === 'fair'
        ? `${t('gps.fair')} (±${effectiveAccuracy}m)`
        : effectiveQualityTier === 'poor'
          ? `${t('gps.poor')} (±${effectiveAccuracy}m)`
          : t('gps.acquiring');

  return (
    <div className="report-form-container" role="region" aria-label="Field Asset Rapid Survey">
      <div className="form-header-card">
        <div className="admin-header">
          <h2 className="view-heading">{t('form.rapidSurveyTitle')}</h2>
          <span className="status-badge submitted tabular-nums">
            {t('form.loggedCount', { count: counter })}
          </span>
        </div>
        <p className="view-subheading">{t('form.rapidSurveySubtitle')}</p>
      </div>

      {savedNotice && (
        <div className="notice-banner" role="status">
          <IconCheck size={16} />
          <span>{t('form.savedAssetBanner', { count: counter })}</span>
        </div>
      )}

      {saveError && (
        <div className="gps-gate-warning" role="alert">
          <IconAlertTriangle size={15} />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleQuickAdd}>
        <h3 className="form-section-title">{t('form.stepAssetType')}</h3>
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

        <h3 className="form-section-title">{t('form.stepLocationQuick')}</h3>
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

        <h3 className="form-section-title">{t('form.stepStatus')}</h3>
        <div className="severity-segmented-bar" role="radiogroup" aria-label="Operational status">
          <button
            type="button"
            role="radio"
            aria-checked={status === 'active'}
            className={`severity-pill-btn ${status === 'active' ? 'active-low' : ''}`}
            onClick={() => setStatus('active')}
          >
            {t('form.workingCondition')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={status === 'non_functional'}
            className={`severity-pill-btn ${status === 'non_functional' ? 'active-critical' : ''}`}
            onClick={() => setStatus('non_functional')}
          >
            {t('form.brokenCondition')}
          </button>
        </div>

        <div className="camera-only-header">
          <h3 className="form-section-title">{t('form.stepPhotoOptional')}</h3>
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

        {photo ? (
          <div className="photo-thumb-card photo-thumb-card-single">
            <img src={photo.data_url} alt="Asset capture preview" className="photo-thumb-img photo-thumb-img-single" />
            <button
              type="button"
              className="photo-thumb-remove"
              onClick={() => setPhoto(null)}
              aria-label="Remove asset photo"
            >
              <IconTrash size={14} />
            </button>
            <div className="photo-thumb-meta">
              <div className="photo-thumb-badges">
                <span className="status-badge info tabular-nums">dHash: {photo.dhash.slice(0, 8)}</span>
                <span className="status-badge submitted">
                  {photo.accuracy_m !== null ? `±${Math.round(photo.accuracy_m)}m GPS` : 'Telemetry Stamped'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="photo-add-slot-btn photo-add-slot-full"
            onClick={handleTakePhoto}
          >
            <IconCamera size={22} />
            <span>{t('actions.takePhoto')}</span>
            <span className="photo-upload-hint">{t('camera.optionalPhotoHint')}</span>
          </button>
        )}

        <div className="form-input-group">
          <label htmlFor="asset-name" className="form-label">
            {t('form.assetNameLabel')}
          </label>
          <input
            id="asset-name"
            name="assetName"
            type="text"
            className="form-input"
            placeholder={t('form.assetNamePlaceholder')}
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
          />
        </div>

        <div className="form-input-group">
          <label htmlFor="asset-lbd" className="form-label">
            {t('form.lbdLabel')}
          </label>
          <input
            id="asset-lbd"
            name="lbdCode"
            type="text"
            className="form-input"
            placeholder={t('form.lbdPlaceholder')}
            value={lbdCode}
            onChange={(e) => setLbdCode(e.target.value)}
          />
        </div>

        {!hasValidLocation && (
          <p className="submit-helper-hint">{t('form.gpsRequiredHint')}</p>
        )}

        <button
          type="submit"
          className="btn-primary-action"
          disabled={!hasValidLocation || submitting}
          aria-label="Record asset to local database and advance to next"
        >
          <IconCheck size={18} />
          <span>{submitting ? t('form.saving') : t('form.recordAssetAdvance')}</span>
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
          locationSource: locationSource || 'gps',
        }}
        title={t('actions.takePhoto')}
        onConfirm={(capturedMeta) => {
          setPhoto(capturedMeta);
          setCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
        }}
        onCancel={() => {
          setCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
        }}
      />
    </div>
  );
};
