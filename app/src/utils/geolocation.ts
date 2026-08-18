import { Geolocation, type Position } from '@capacitor/geolocation';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Single-shot GPS coordinate capture for Module D surveys.
 * Uses Capacitor Native Geolocation when on device, fallback to browser navigator.geolocation.
 */
export async function getCurrentCoordinates(): Promise<LocationCoordinates> {
  try {
    // Check & request permissions on native platforms
    const permStatus = await Geolocation.checkPermissions();
    if (permStatus.location !== 'granted') {
      const requestRes = await Geolocation.requestPermissions();
      if (requestRes.location !== 'granted') {
        throw new Error('Location permission denied by user.');
      }
    }

    const position: Position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
  } catch (error) {
    console.warn('[Geolocation] Native geolocation failed or running in browser, falling back to Web API:', error);

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser/device.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
      );
    });
  }
}
