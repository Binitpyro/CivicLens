import { useState, useEffect, useRef, useCallback } from 'react';
import { db, type LocationLog } from '../db';

export interface LocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null; // in m/s
  altitude: number | null;
  heading: number | null;
  timestamp: number;
}

// Calculate Haversine distance between two coordinates in kilometers
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useLocationTracker() {
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [followUser, setFollowUser] = useState<boolean>(true);
  const [currentPosition, setCurrentPosition] = useState<LocationPosition | null>(null);
  const [trackHistory, setTrackHistory] = useState<LocationLog[]>([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastCoordRef = useRef<{ lat: number; lng: number } | null>(null);

  // Load existing location history from IndexedDB on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const logs = await db.locationLogs.orderBy('timestamp').toArray();
        setTrackHistory(logs);

        // Compute total distance from existing logs
        let dist = 0;
        for (let i = 1; i < logs.length; i++) {
          dist += calculateHaversineDistance(
            logs[i - 1].latitude,
            logs[i - 1].longitude,
            logs[i].latitude,
            logs[i].longitude
          );
        }
        setTotalDistanceKm(dist);

        if (logs.length > 0) {
          const last = logs[logs.length - 1];
          setCurrentPosition({
            latitude: last.latitude,
            longitude: last.longitude,
            accuracy: last.accuracy,
            speed: last.speed ?? null,
            altitude: last.altitude ?? null,
            heading: last.heading ?? null,
            timestamp: last.timestamp,
          });
          lastCoordRef.current = { lat: last.latitude, lng: last.longitude };
        }
      } catch (err) {
        console.error('Failed to load location logs from IndexedDB:', err);
      }
    }
    loadHistory();
  }, []);

  // Handle position updates from navigator.geolocation
  const handlePositionSuccess = useCallback(async (pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy, speed, altitude, heading } = pos.coords;
    const timestamp = pos.timestamp || Date.now();

    const newPos: LocationPosition = {
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      speed,
      altitude,
      heading,
      timestamp,
    };

    setCurrentPosition(newPos);
    setError(null);

    // Calculate distance delta if moved > 3 meters
    if (lastCoordRef.current) {
      const deltaKm = calculateHaversineDistance(
        lastCoordRef.current.lat,
        lastCoordRef.current.lng,
        latitude,
        longitude
      );
      if (deltaKm > 0.003) {
        setTotalDistanceKm((prev) => prev + deltaKm);
        lastCoordRef.current = { lat: latitude, lng: longitude };
      }
    } else {
      lastCoordRef.current = { lat: latitude, lng: longitude };
    }

    const logEntry: LocationLog = {
      timestamp,
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      speed: speed ? Math.round(speed * 3.6 * 10) / 10 : null, // Convert m/s to km/h
      altitude: altitude ? Math.round(altitude) : null,
      heading: heading ? Math.round(heading) : null,
    };

    try {
      const id = await db.locationLogs.add(logEntry);
      logEntry.id = id;
      setTrackHistory((prev) => [...prev, logEntry]);
    } catch (err) {
      console.error('Failed to save position log:', err);
    }
  }, []);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    console.warn('Location Tracker error:', err.message);
    setError('GPS Signal weak or permission denied.');
  }, []);

  // Start continuous GPS tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    if (watchIdRef.current !== null) return;

    setIsTracking(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 2000,
      }
    );
  }, [handlePositionSuccess, handlePositionError]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Toggle Tracking ON/OFF
  const toggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  // Clear tracking history
  const clearHistory = useCallback(async () => {
    try {
      await db.locationLogs.clear();
      setTrackHistory([]);
      setTotalDistanceKm(0);
      lastCoordRef.current = null;
    } catch (err) {
      console.error('Failed to clear location history:', err);
    }
  }, []);

  // Export path history as GeoJSON file download
  const exportGeoJSON = useCallback(() => {
    if (trackHistory.length === 0) return;

    const coordinates = trackHistory.map((pt) => [pt.longitude, pt.latitude]);
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
          properties: {
            name: 'CivicLens Real-Time GPS Track',
            total_distance_km: Math.round(totalDistanceKm * 100) / 100,
            point_count: trackHistory.length,
            start_time: new Date(trackHistory[0].timestamp).toISOString(),
            end_time: new Date(trackHistory[trackHistory.length - 1].timestamp).toISOString(),
          },
        },
      ],
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geojson, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `CivicLens_Track_${Date.now()}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }, [trackHistory, totalDistanceKm]);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    isTracking,
    followUser,
    setFollowUser,
    currentPosition,
    trackHistory,
    totalDistanceKm,
    error,
    startTracking,
    stopTracking,
    toggleTracking,
    clearHistory,
    exportGeoJSON,
  };
}
