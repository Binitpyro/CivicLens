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

export function useGeolocation() {
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

  // High precision single fix with maximumAge: 0 (zero cached position delay)
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
          heading: heading ?? null,
          speed: speed ?? null,
          altitude: altitude ?? null,
          loading: false,
          error: null,
          isLive: true,
          timestamp: position.timestamp || Date.now(),
        });
      },
      (error) => {
        console.warn('High precision GPS warning:', error.message);
        setLocation((prev) => ({
          ...prev,
          loading: false,
          error: 'Unable to fetch high precision GPS position.',
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Force fresh hardware fix
      }
    );
  }, []);

  // Continuous high precision position watcher
  const startLiveWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading, speed, altitude } = position.coords;
        setLocation({
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          heading: heading ?? null,
          speed: speed ?? null,
          altitude: altitude ?? null,
          loading: false,
          error: null,
          isLive: true,
          timestamp: position.timestamp || Date.now(),
        });
      },
      (error) => {
        console.warn('Live high-precision location watch warning:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0, // Fresh hardware GPS fixes
      }
    );
  }, []);

  const stopLiveWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Device Orientation listener for compass heading beam
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null && event.alpha !== undefined) {
        // webkitCompassHeading for iOS, alpha for Android
        const compassHeading = (event as any).webkitCompassHeading ?? (360 - event.alpha);
        if (!isNaN(compassHeading)) {
          setLocation((prev) => ({ ...prev, heading: Math.round(compassHeading) }));
        }
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

  useEffect(() => {
    startLiveWatch();
    return () => {
      stopLiveWatch();
    };
  }, [startLiveWatch, stopLiveWatch]);

  return {
    ...location,
    locateMe,
    getSingleFix: locateMe,
  };
}
