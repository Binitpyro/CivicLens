import { useState, useCallback } from 'react';

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null; // meters
  loading: boolean;
  error: string | null;
}

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    latitude: 28.6139,  // Default fallback (Delhi/Shivpur pilot area)
    longitude: 77.2090,
    accuracy: null,
    loading: false,
    error: null,
  });

  const getSingleFix = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation(prev => ({ ...prev, error: 'Geolocation is not supported by your browser' }));
      return;
    }

    setLocation(prev => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          loading: false,
          error: null,
        });
      },
      (error) => {
        console.warn('Geolocation acquisition warning:', error.message);
        setLocation(prev => ({
          ...prev,
          loading: false,
          error: 'GPS signal weak. Using pin location on map.',
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  const setManualLocation = useCallback((lat: number, lng: number) => {
    setLocation({
      latitude: lat,
      longitude: lng,
      accuracy: 0,
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...location,
    getSingleFix,
    setManualLocation,
  };
}
