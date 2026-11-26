import { useContext, useEffect, useMemo, useState } from 'react';
import { GeolocationContext } from './useGeolocation';

export interface CompassHeadingState {
  headingDegrees: number | null;
  cardinal: string | null;
}

export interface UseCompassHeadingOptions {
  gpsHeading?: number | null;
  speed?: number | null;
}

const CARDINAL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function normalizeHeading(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.round(normalized) % 360;
}

export function degreesToCardinal(degrees: number | null): string | null {
  if (degrees === null || !Number.isFinite(degrees)) return null;
  const normalized = normalizeHeading(degrees);
  const index = Math.round(normalized / 45) % 8;
  return CARDINAL_DIRECTIONS[index];
}

interface WebKitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return window.screen.orientation.angle;
  }
  const legacyOrientation = (window as Window & { orientation?: number }).orientation;
  return typeof legacyOrientation === 'number' ? legacyOrientation : 0;
}

export function extractCompassHeading(event: DeviceOrientationEvent): number | null {
  const webkitEvent = event as WebKitDeviceOrientationEvent;
  if (typeof webkitEvent.webkitCompassHeading === 'number' && Number.isFinite(webkitEvent.webkitCompassHeading)) {
    return normalizeHeading(webkitEvent.webkitCompassHeading);
  }

  if (typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    const screenAngle = getScreenOrientationAngle();
    // Android / W3C alpha runs counter-clockwise; convert to clockwise North-referenced bearing
    return normalizeHeading(360 - event.alpha + screenAngle);
  }

  return null;
}

export function useCompassHeading(options?: UseCompassHeadingOptions): CompassHeadingState {
  const geoCtx = useContext(GeolocationContext);
  const [sensorHeading, setSensorHeading] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    let hasAbsoluteEvent = false;

    const handleAbsolute = (event: Event) => {
      const heading = extractCompassHeading(event as DeviceOrientationEvent);
      if (heading !== null) {
        hasAbsoluteEvent = true;
        setSensorHeading((prev) => {
          if (prev !== null) {
            const diff = Math.abs(((heading - prev + 540) % 360) - 180);
            if (diff < 2) return prev;
          }
          return heading;
        });
      }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // Prefer deviceorientationabsolute when available, unless iOS webkitCompassHeading or event.absolute is present
      const webkitEvent = event as WebKitDeviceOrientationEvent;
      if (hasAbsoluteEvent && typeof webkitEvent.webkitCompassHeading !== 'number' && !event.absolute) {
        return;
      }
      if (!event.absolute && typeof webkitEvent.webkitCompassHeading !== 'number') {
        return;
      }
      const heading = extractCompassHeading(event);
      if (heading !== null) {
        setSensorHeading((prev) => {
          if (prev !== null) {
            const diff = Math.abs(((heading - prev + 540) % 360) - 180);
            if (diff < 2) return prev;
          }
          return heading;
        });
      }
    };

    window.addEventListener('deviceorientationabsolute', handleAbsolute);
    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleAbsolute);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const gpsHeading = options?.gpsHeading !== undefined ? options.gpsHeading : (geoCtx?.heading ?? null);
  const speed = options?.speed !== undefined ? options.speed : (geoCtx?.speed ?? null);

  return useMemo(() => {
    let resolvedHeading: number | null = sensorHeading;

    if (typeof gpsHeading === 'number' && Number.isFinite(gpsHeading)) {
      const isMoving = speed === null || speed > 0.5;
      if (isMoving || resolvedHeading === null) {
        resolvedHeading = normalizeHeading(gpsHeading);
      }
    }

    return {
      headingDegrees: resolvedHeading,
      cardinal: degreesToCardinal(resolvedHeading),
    };
  }, [gpsHeading, speed, sensorHeading]);
}
