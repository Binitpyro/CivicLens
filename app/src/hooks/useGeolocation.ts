import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

export type LocationSource = 'gps' | 'manual_pin' | null;
export type GeolocationPermissionState = 'prompt' | 'granted' | 'denied' | 'gps_disabled' | 'unsupported';
export type GpsQualityTier = 'excellent' | 'fair' | 'poor' | 'none';

export const LAST_DETECTED_LOCATION_KEY = 'civiclens_last_detected_location';

export interface SavedDetectedLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: number;
}

export function getLastDetectedLocation(): SavedDetectedLocation | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_DETECTED_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedDetectedLocation>;
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      Number.isFinite(parsed.latitude) &&
      Number.isFinite(parsed.longitude) &&
      Math.abs(parsed.latitude) <= 90 &&
      Math.abs(parsed.longitude) <= 180
    ) {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: typeof parsed.accuracy === 'number' && Number.isFinite(parsed.accuracy) ? parsed.accuracy : null,
        updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
      };
    }
  } catch {
    // Ignore storage read errors in restricted environments
  }
  return null;
}

function saveLastDetectedLocation(latitude: number, longitude: number, accuracy: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const payload: SavedDetectedLocation = {
      latitude,
      longitude,
      accuracy,
      updatedAt: Date.now(),
    };
    localStorage.setItem(LAST_DETECTED_LOCATION_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null; // meters, rounded
  speed: number | null;
  altitude: number | null;
  heading: number | null;
  locationSource: LocationSource;
  permissionState: GeolocationPermissionState;
  qualityTier: GpsQualityTier;
  isRefining: boolean;
  loading: boolean;
  lastUpdatedAt: number | null;
  error: string | null;
}

export interface GeolocationContextValue extends LocationState {
  requestPermissionAndStart: () => Promise<void>;
  refreshFix: () => Promise<void>;
  getSingleFix: () => Promise<void>;
  setManualLocation: (lat: number, lng: number) => void;
  clearManualLocation: () => void;
}

const INITIAL_STATE: LocationState = {
  latitude: null,
  longitude: null,
  accuracy: null,
  speed: null,
  altitude: null,
  heading: null,
  locationSource: null,
  permissionState: 'prompt',
  qualityTier: 'none',
  isRefining: false,
  loading: false,
  lastUpdatedAt: null,
  error: null,
};

export function getQualityTier(accuracy: number | null): GpsQualityTier {
  if (accuracy === null || !Number.isFinite(accuracy)) return 'none';
  if (accuracy <= 15) return 'excellent';
  if (accuracy <= 50) return 'fair';
  return 'poor';
}

function isLocationServicesDisabledError(err: unknown): boolean {
  if (!err) return false;
  const msg = typeof err === 'string'
    ? err
    : (err as { message?: string }).message ?? String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('disabled') ||
    lower.includes('location services') ||
    lower.includes('not enabled') ||
    lower.includes('provider_disabled') ||
    lower.includes('turn on location')
  );
}

function isPermissionDeniedError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: number | string }).code;
  if (code === 1 || code === 'PERMISSION_DENIED') return true;
  const msg = typeof err === 'string'
    ? err
    : (err as { message?: string }).message ?? String(err);
  const lower = msg.toLowerCase();
  return lower.includes('denied') || lower.includes('permission');
}

export const GeolocationContext = createContext<GeolocationContextValue | null>(null);

interface StoredGpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
  lastUpdatedAt: number;
}

function useGeolocationController(autoStart: boolean): GeolocationContextValue {
  const [state, setState] = useState<LocationState>(() => ({
    ...INITIAL_STATE,
    isRefining: autoStart,
    loading: autoStart,
  }));

  const manualPinRef = useRef<boolean>(false);
  const lastGpsFixRef = useRef<StoredGpsFix | null>(null);
  const nativeWatchIdRef = useRef<string | null>(null);
  const webWatchIdRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);
  const startingRef = useRef<boolean>(false);
  const fallbackTriedRef = useRef<boolean>(false);

  const clearActiveWatch = useCallback(async () => {
    if (nativeWatchIdRef.current !== null) {
      const id = nativeWatchIdRef.current;
      nativeWatchIdRef.current = null;
      try {
        await Geolocation.clearWatch({ id });
      } catch {
        // Ignore cleanup errors when native watch is already cleared
      }
    }
    if (webWatchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(webWatchIdRef.current);
      webWatchIdRef.current = null;
    }
  }, []);

  const applyPosition = useCallback((position: Position | GeolocationPosition, forceAccept = false) => {
    if (!mountedRef.current) return;

    const coords = position.coords;
    if (
      typeof coords.latitude !== 'number' ||
      typeof coords.longitude !== 'number' ||
      !Number.isFinite(coords.latitude) ||
      !Number.isFinite(coords.longitude) ||
      Math.abs(coords.latitude) > 90 ||
      Math.abs(coords.longitude) > 180
    ) {
      return;
    }

    const rawAccuracy = typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy) && coords.accuracy >= 0
      ? coords.accuracy
      : 999;
    const roundedAccuracy = Math.round(rawAccuracy);
    const now = Date.now();
    const prevFix = lastGpsFixRef.current;

    if (!forceAccept && prevFix !== null) {
      const ageMs = now - prevFix.lastUpdatedAt;
      const distanceM = haversineMeters(
        prevFix.latitude,
        prevFix.longitude,
        coords.latitude,
        coords.longitude
      );

      // Reject sudden severe accuracy regressions while an accurate/fair fix is still fresh.
      if (
        prevFix.accuracy <= 50 &&
        roundedAccuracy > Math.max(prevFix.accuracy * 2.5, 80) &&
        ageMs < 15000
      ) {
        return;
      }

      // Reject multipath / cell-tower teleport spikes on real-world intervals.
      if (
        ageMs >= 500 &&
        roundedAccuracy > 25 &&
        roundedAccuracy > prevFix.accuracy &&
        distanceM / (ageMs / 1000) > 45
      ) {
        return;
      }

      // Suppress tiny stationary micro-jitter so the blue dot and map camera stay calm.
      const isStationary = coords.speed === null || coords.speed === undefined || coords.speed < 0.5;
      if (
        ageMs < 4000 &&
        distanceM < 2.5 &&
        roundedAccuracy >= prevFix.accuracy &&
        isStationary
      ) {
        return;
      }

      // Accept high-accuracy fixes, accuracy improvements, walking updates (>2.5s), or stale refreshes (>8s).
      const isWalkingUpdate =
        roundedAccuracy <= 50 &&
        ageMs >= 2500 &&
        (distanceM >= 3 || (typeof coords.speed === 'number' && coords.speed >= 0.5));

      const shouldAccept =
        roundedAccuracy <= 15 ||
        roundedAccuracy <= prevFix.accuracy ||
        isWalkingUpdate ||
        ageMs >= 8000;

      if (!shouldAccept) {
        return;
      }
    }

    const nextFix: StoredGpsFix = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: roundedAccuracy,
      speed: coords.speed ?? null,
      altitude: coords.altitude ?? null,
      heading: coords.heading ?? null,
      lastUpdatedAt: now,
    };

    lastGpsFixRef.current = nextFix;
    fallbackTriedRef.current = false;
    saveLastDetectedLocation(nextFix.latitude, nextFix.longitude, nextFix.accuracy);

    // Never overwrite an active manual map pin until clearManualLocation() or refreshFix() is called.
    if (manualPinRef.current) {
      return;
    }

    setState({
      latitude: nextFix.latitude,
      longitude: nextFix.longitude,
      accuracy: nextFix.accuracy,
      speed: nextFix.speed,
      altitude: nextFix.altitude,
      heading: nextFix.heading,
      locationSource: 'gps',
      permissionState: 'granted',
      qualityTier: getQualityTier(nextFix.accuracy),
      isRefining: nextFix.accuracy > 15,
      loading: false,
      lastUpdatedAt: nextFix.lastUpdatedAt,
      error: null,
    });
  }, []);

  const handleWatchError = useCallback((err: unknown) => {
    if (!mountedRef.current) return;

    if (isLocationServicesDisabledError(err)) {
      setState((prev) => ({
        ...prev,
        permissionState: 'gps_disabled',
        isRefining: false,
        loading: false,
        error: 'Device GPS / Location Services appear to be turned off.',
      }));
      return;
    }

    if (isPermissionDeniedError(err)) {
      setState((prev) => ({
        ...prev,
        permissionState: 'denied',
        isRefining: false,
        loading: false,
        error: 'Location permission was denied. Enable location access to track live GPS.',
      }));
      return;
    }

    const code = (err as { code?: number }).code;
    const message = (err as { message?: string })?.message || 'Unable to acquire GPS fix.';

    if (code === 2) {
      setState((prev) => ({
        ...prev,
        permissionState: 'gps_disabled',
        isRefining: false,
        loading: false,
        error: message,
      }));
      return;
    }

    // Timeout (code === 3) or transient acquisition warning: warm-up with a fast network/coarse fix
    // once if we still have no fix, while high-accuracy watchPosition keeps refining.
    if (
      lastGpsFixRef.current === null &&
      !fallbackTriedRef.current &&
      !Capacitor.isNativePlatform() &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation &&
      typeof navigator.geolocation.getCurrentPosition === 'function'
    ) {
      fallbackTriedRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => applyPosition(pos),
        () => {
          // Ignore fallback timeout; watchPosition remains active
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    }

    setState((prev) => ({
      ...prev,
      isRefining: prev.locationSource !== 'manual_pin' && (prev.accuracy === null || prev.accuracy > 15),
      loading: false,
      error: message,
    }));
  }, [applyPosition]);

  const startWatching = useCallback(async () => {
    if (!mountedRef.current || startingRef.current) return;
    startingRef.current = true;
    fallbackTriedRef.current = false;

    try {
      await clearActiveWatch();

      if (Capacitor.isNativePlatform()) {
        try {
          let perm = await Geolocation.checkPermissions();
          if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
            perm = await Geolocation.requestPermissions({ permissions: ['location'] });
          }

          if (!mountedRef.current) return;

          if (perm.location !== 'granted') {
            setState((prev) => ({
              ...prev,
              permissionState: 'denied',
              isRefining: false,
              loading: false,
              error: 'Location permission denied. Please grant Precise Location access.',
            }));
            return;
          }

          setState((prev) => ({
            ...prev,
            permissionState: 'granted',
            isRefining: prev.locationSource !== 'manual_pin' && (prev.accuracy === null || prev.accuracy > 15),
            loading: prev.latitude === null,
            error: null,
          }));

          const watchId = await Geolocation.watchPosition(
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
              minimumUpdateInterval: 2000,
            },
            (position, err) => {
              if (err) {
                handleWatchError(err);
                return;
              }
              if (position) {
                applyPosition(position);
              }
            }
          );

          if (!mountedRef.current) {
            void Geolocation.clearWatch({ id: watchId }).catch(() => {});
            return;
          }
          nativeWatchIdRef.current = watchId;
        } catch (err) {
          handleWatchError(err);
        }
        return;
      }

      // Web / PWA fallback
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          permissionState: 'unsupported',
          isRefining: false,
          loading: false,
          error: 'Geolocation is not supported by your browser.',
        }));
        return;
      }

      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        try {
          const permStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (!mountedRef.current) return;
          if (permStatus.state === 'denied') {
            setState((prev) => ({
              ...prev,
              permissionState: 'denied',
              isRefining: false,
              loading: false,
              error: 'Location permission is blocked in browser settings.',
            }));
            return;
          }
          if (permStatus.state === 'granted') {
            setState((prev) => ({
              ...prev,
              permissionState: 'granted',
            }));
          }
        } catch {
          // Some browsers/environments reject permissions.query for geolocation; proceed to watchPosition
        }
      }

      setState((prev) => ({
        ...prev,
        isRefining: prev.locationSource !== 'manual_pin' && (prev.accuracy === null || prev.accuracy > 15),
        loading: prev.latitude === null,
        error: null,
      }));

      const watchId = navigator.geolocation.watchPosition(
        (position) => applyPosition(position),
        (err) => handleWatchError(err),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );

      if (!mountedRef.current) {
        navigator.geolocation.clearWatch(watchId);
        return;
      }
      webWatchIdRef.current = watchId;
    } finally {
      startingRef.current = false;
    }
  }, [applyPosition, clearActiveWatch, handleWatchError]);

  const requestPermissionAndStart = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      loading: prev.latitude === null,
      isRefining: prev.locationSource !== 'manual_pin',
      error: null,
    }));
    await startWatching();
  }, [startWatching]);

  const refreshFix = useCallback(async () => {
    manualPinRef.current = false;
    lastGpsFixRef.current = null;
    fallbackTriedRef.current = false;

    setState((prev) => ({
      ...prev,
      locationSource: prev.locationSource === 'manual_pin' ? null : prev.locationSource,
      latitude: prev.locationSource === 'manual_pin' ? null : prev.latitude,
      longitude: prev.locationSource === 'manual_pin' ? null : prev.longitude,
      accuracy: prev.locationSource === 'manual_pin' ? null : prev.accuracy,
      qualityTier: prev.locationSource === 'manual_pin' ? 'none' : prev.qualityTier,
      loading: true,
      isRefining: true,
      error: null,
    }));

    if (Capacitor.isNativePlatform()) {
      try {
        if (nativeWatchIdRef.current === null) {
          await startWatching();
        }
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
        applyPosition(position, true);
      } catch (err) {
        handleWatchError(err);
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        permissionState: 'unsupported',
        isRefining: false,
        loading: false,
        error: 'Geolocation is not supported by your browser.',
      }));
      return;
    }

    if (webWatchIdRef.current === null) {
      await startWatching();
    }

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyPosition(position, true);
          resolve();
        },
        (err) => {
          handleWatchError(err);
          resolve();
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }, [applyPosition, handleWatchError, startWatching]);

  const setManualLocation = useCallback((lat: number, lng: number) => {
    manualPinRef.current = true;
    setState((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      accuracy: null,
      speed: null,
      altitude: null,
      heading: null,
      locationSource: 'manual_pin',
      qualityTier: 'none',
      isRefining: false,
      loading: false,
      lastUpdatedAt: Date.now(),
      error: null,
    }));
  }, []);

  const clearManualLocation = useCallback(() => {
    manualPinRef.current = false;
    const cached = lastGpsFixRef.current;

    if (cached) {
      setState((prev) => ({
        ...prev,
        latitude: cached.latitude,
        longitude: cached.longitude,
        accuracy: cached.accuracy,
        speed: cached.speed,
        altitude: cached.altitude,
        heading: cached.heading,
        locationSource: 'gps',
        permissionState: 'granted',
        qualityTier: getQualityTier(cached.accuracy),
        isRefining: cached.accuracy > 15,
        loading: false,
        lastUpdatedAt: cached.lastUpdatedAt,
        error: null,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        latitude: null,
        longitude: null,
        accuracy: null,
        speed: null,
        altitude: null,
        heading: null,
        locationSource: null,
        qualityTier: 'none',
        isRefining: prev.permissionState !== 'denied' && prev.permissionState !== 'gps_disabled' && prev.permissionState !== 'unsupported',
        loading: prev.permissionState !== 'denied' && prev.permissionState !== 'gps_disabled' && prev.permissionState !== 'unsupported',
        error: null,
      }));
    }

    if (nativeWatchIdRef.current === null && webWatchIdRef.current === null) {
      void startWatching();
    }
  }, [startWatching]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoStart) {
      void startWatching();
    }

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (!mountedRef.current || manualPinRef.current) return;
      const lastFix = lastGpsFixRef.current;
      const isStale = !lastFix || Date.now() - lastFix.lastUpdatedAt > 20000;
      const noActiveWatch = nativeWatchIdRef.current === null && webWatchIdRef.current === null;
      if (noActiveWatch || isStale) {
        void startWatching();
      }
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      mountedRef.current = false;
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      void clearActiveWatch();
    };
  }, [autoStart, clearActiveWatch, startWatching]);

  return useMemo(
    () => ({
      ...state,
      requestPermissionAndStart,
      refreshFix,
      getSingleFix: refreshFix,
      setManualLocation,
      clearManualLocation,
    }),
    [state, requestPermissionAndStart, refreshFix, setManualLocation, clearManualLocation]
  );
}

export const GeolocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useGeolocationController(true);
  return React.createElement(GeolocationContext.Provider, { value }, children);
};

export function useGeolocation(): GeolocationContextValue {
  const shared = useContext(GeolocationContext);
  const standalone = useGeolocationController(shared === null);
  return shared ?? standalone;
}
