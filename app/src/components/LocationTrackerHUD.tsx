import React from 'react';

interface LocationTrackerHUDProps {
  isTracking: boolean;
  followUser: boolean;
  currentSpeed: number | null;
  totalDistanceKm: number;
  accuracy: number | null;
  pointCount: number;
  error: string | null;
  onToggleTracking: () => void;
  onToggleFollowUser: () => void;
  onClearHistory: () => void;
  onExportGeoJSON: () => void;
}

export const LocationTrackerHUD: React.FC<LocationTrackerHUDProps> = ({
  isTracking,
  followUser,
  currentSpeed,
  totalDistanceKm,
  accuracy,
  pointCount,
  error,
  onToggleTracking,
  onToggleFollowUser,
  onClearHistory,
  onExportGeoJSON,
}) => {
  const displaySpeed = currentSpeed !== null ? (currentSpeed * 3.6).toFixed(1) : '0.0';

  return (
    <div className="location-tracker-hud-card" role="region" aria-label="Real-time Location Tracker">
      <div className="tracker-hud-header">
        <div className="tracker-status-indicator">
          <span className={`tracker-pulse-dot ${isTracking ? 'active' : 'paused'}`} />
          <span className="tracker-status-title">
            {isTracking ? 'GPS TRACKING LIVE' : 'TRACKER STANDBY'}
          </span>
        </div>
        <button
          type="button"
          className={`btn-tracker-toggle ${isTracking ? 'active' : ''}`}
          onClick={onToggleTracking}
          aria-label={isTracking ? 'Pause Location Tracker' : 'Start Location Tracker'}
        >
          {isTracking ? 'PAUSE' : 'START TRACK'}
        </button>
      </div>

      {error && <div className="tracker-error-alert">{error}</div>}

      <div className="tracker-telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">DISTANCE</span>
          <span className="telemetry-value tabular-nums">{totalDistanceKm.toFixed(2)} <small>km</small></span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">SPEED</span>
          <span className="telemetry-value tabular-nums">{displaySpeed} <small>km/h</small></span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">ACCURACY</span>
          <span className="telemetry-value tabular-nums">{accuracy !== null ? `±${accuracy}m` : '--'}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">POINTS</span>
          <span className="telemetry-value tabular-nums">{pointCount}</span>
        </div>
      </div>

      <div className="tracker-actions-row">
        <button
          type="button"
          className={`btn-tracker-action ${followUser ? 'active' : ''}`}
          onClick={onToggleFollowUser}
          title="Auto-center camera on position"
        >
          <span>🎯 Follow Me</span>
        </button>
        <button
          type="button"
          className="btn-tracker-action"
          onClick={onExportGeoJSON}
          disabled={pointCount === 0}
          title="Export GeoJSON Track"
        >
          <span>📥 Export Track</span>
        </button>
        <button
          type="button"
          className="btn-tracker-action danger"
          onClick={onClearHistory}
          disabled={pointCount === 0}
          title="Clear location history"
        >
          <span>🗑️ Clear</span>
        </button>
      </div>
    </div>
  );
};
