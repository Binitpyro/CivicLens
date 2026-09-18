import { useState, useCallback, useEffect, useRef } from 'react';

export interface LocationState {
  latitude: number;
  longitude: number;
  accuracy: number | null; // in meters
  heading: number | null; // in degrees (0-360)
  speed: number | null; // in m/s
  altitude: number | null;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  timestamp: number | null;
}

export interface UseGeolocationOptions {
  autoWatch?: boolean;
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { autoWatch = false } = options;

  const [location, setLocation] = useState<LocationState>({
    latitude: 28.6139,
    longitude: 77.2090,
    accuracy: null,
    heading: null,
    speed: null,
    altitude: null,
    loading: false,
    error: null,
    isLive: false,
    timestamp: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const lastHeadingTimeRef = useRef<number>(0);

  // Single on-demand GPS fix (zero battery drain when idle)
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation((prev) => ({ ...prev, error: 'Geolocation is not supported by your browser' }));
      return;
    }

    setLocation((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading, speed, altitude } = position.coords;
        setLocation({
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          heading: heading ?? lastHeadingRef.current,
          speed: speed ?? null,
          altitude: altitude ?? null,
          loading: false,
          error: null,
          isLive: true,
          timestamp: position.timestamp || Date.now(),
        });
      },
      (error) => {
        console.warn('GPS position fix warning:', error.message);
        setLocation((prev) => ({
          ...prev,
          loading: false,
          error: 'Unable to fetch GPS position fix.',
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }, []);

  // Continuous position watcher (opt-in)
  const startLiveWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading, speed, altitude } = position.coords;
        setLocation((prev) => ({
          ...prev,
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          heading: heading ?? prev.heading ?? lastHeadingRef.current,
          speed: speed ?? null,
          altitude: altitude ?? null,
          loading: false,
          error: null,
          isLive: true,
          timestamp: position.timestamp || Date.now(),
        }));
      },
      (error) => {
        console.warn('Live location watch warning:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      }
    );
  }, []);

  const stopLiveWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Throttled Device Orientation listener (max 300ms, >5 deg delta) to prevent 60Hz re-render storm
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.alpha === undefined) return;

      const now = Date.now();
      if (now - lastHeadingTimeRef.current < 300) return; // Throttle to max 3 updates/sec

      const rawHeading = (event as any).webkitCompassHeading ?? (360 - event.alpha);
      if (isNaN(rawHeading)) return;

      const rounded = Math.round(rawHeading);
      const prev = lastHeadingRef.current;

      // Only update state if heading shifted by at least 5 degrees
      if (prev === null || Math.abs(rounded - prev) >= 5) {
        lastHeadingRef.current = rounded;
        lastHeadingTimeRef.current = now;
        setLocation((p) => (p.heading === rounded ? p : { ...p, heading: rounded }));
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleOrientation, true);
      }
    };
  }, []);

  // Start live position watch ONLY if autoWatch is explicitly requested
  useEffect(() => {
    if (autoWatch) {
      startLiveWatch();
    }
    return () => {
      stopLiveWatch();
    };
  }, [autoWatch, startLiveWatch, stopLiveWatch]);

  return {
    ...location,
    locateMe,
    getSingleFix: locateMe,
    startLiveWatch,
    stopLiveWatch,
  };
}
