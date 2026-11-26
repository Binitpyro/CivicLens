// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsNativePlatform = vi.fn<() => boolean>(() => false);
const mockCapCheckPermissions = vi.fn();
const mockCapRequestPermissions = vi.fn();
const mockCapWatchPosition = vi.fn();
const mockCapClearWatch = vi.fn();
const mockCapGetCurrentPosition = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNativePlatform(),
  },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: (...args: unknown[]) => mockCapCheckPermissions(...args),
    requestPermissions: (...args: unknown[]) => mockCapRequestPermissions(...args),
    watchPosition: (...args: unknown[]) => mockCapWatchPosition(...args),
    clearWatch: (...args: unknown[]) => mockCapClearWatch(...args),
    getCurrentPosition: (...args: unknown[]) => mockCapGetCurrentPosition(...args),
  },
}));

import {
  GeolocationProvider,
  LAST_DETECTED_LOCATION_KEY,
  getLastDetectedLocation,
  getQualityTier,
  useGeolocation,
  type GeolocationContextValue,
} from '../useGeolocation';
import { degreesToCardinal, useCompassHeading, type CompassHeadingState } from '../useCompassHeading';
import { PermissionPromptCard } from '../../components/PermissionPromptCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedHarness<T> {
  getValue: () => T;
  unmount: () => void;
}

function mountHook<T>(hookFn: () => T, withProvider = true): MountedHarness<T> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let latestValue!: T;

  const Probe: React.FC = () => {
    latestValue = hookFn();
    return null;
  };

  act(() => {
    root.render(
      withProvider
        ? React.createElement(GeolocationProvider, null, React.createElement(Probe))
        : React.createElement(Probe)
    );
  });

  return {
    getValue: () => latestValue,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('getQualityTier', () => {
  it('maps accuracy thresholds accurately', () => {
    expect(getQualityTier(null)).toBe('none');
    expect(getQualityTier(8)).toBe('excellent');
    expect(getQualityTier(15)).toBe('excellent');
    expect(getQualityTier(16)).toBe('fair');
    expect(getQualityTier(50)).toBe('fair');
    expect(getQualityTier(51)).toBe('poor');
  });
});

describe('useGeolocation', () => {
  let webWatchSuccess: PositionCallback | null = null;
  let webWatchError: PositionErrorCallback | null = null;
  const mockWebWatchPosition = vi.fn();
  const mockWebClearWatch = vi.fn();
  const mockWebGetCurrentPosition = vi.fn();
  const mockPermQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsNativePlatform.mockReturnValue(false);
    webWatchSuccess = null;
    webWatchError = null;

    mockWebWatchPosition.mockImplementation((success: PositionCallback, error?: PositionErrorCallback) => {
      webWatchSuccess = success;
      webWatchError = error ?? null;
      return 101;
    });
    mockWebClearWatch.mockImplementation(() => {});
    mockPermQuery.mockResolvedValue({ state: 'prompt' });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: mockWebWatchPosition,
        clearWatch: mockWebClearWatch,
        getCurrentPosition: mockWebGetCurrentPosition,
      },
    });

    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: mockPermQuery,
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts with null coordinates (no silent Delhi fallback) and refines accuracy across watch updates', async () => {
    const harness = mountHook<GeolocationContextValue>(() => useGeolocation());
    await act(async () => {
      await Promise.resolve();
    });

    const initial = harness.getValue();
    expect(initial.latitude).toBeNull();
    expect(initial.longitude).toBeNull();
    expect(initial.locationSource).toBeNull();
    expect(initial.qualityTier).toBe('none');
    expect(initial.isRefining).toBe(true);
    expect(mockWebWatchPosition).toHaveBeenCalledTimes(1);

    // 1. Poor initial fix (85m)
    act(() => {
      webWatchSuccess?.({
        timestamp: Date.now(),
        coords: {
          latitude: 26.8467,
          longitude: 80.9462,
          accuracy: 85,
          altitude: 120,
          altitudeAccuracy: 10,
          heading: 90,
          speed: 1.2,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });

    expect(harness.getValue().latitude).toBe(26.8467);
    expect(harness.getValue().longitude).toBe(80.9462);
    expect(harness.getValue().accuracy).toBe(85);
    expect(harness.getValue().qualityTier).toBe('poor');
    expect(harness.getValue().isRefining).toBe(true);
    expect(harness.getValue().locationSource).toBe('gps');
    expect(harness.getValue().permissionState).toBe('granted');

    // 2. Worse noisy fix (120m) right after should NOT regress accuracy
    act(() => {
      webWatchSuccess?.({
        timestamp: Date.now(),
        coords: {
          latitude: 26.849,
          longitude: 80.949,
          accuracy: 120,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });
    expect(harness.getValue().accuracy).toBe(85);
    expect(harness.getValue().latitude).toBe(26.8467);

    // 3. Fair fix (32m)
    act(() => {
      webWatchSuccess?.({
        timestamp: Date.now(),
        coords: {
          latitude: 26.8468,
          longitude: 80.9463,
          accuracy: 32,
          altitude: 121,
          altitudeAccuracy: 5,
          heading: 95,
          speed: 1.4,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });
    expect(harness.getValue().qualityTier).toBe('fair');
    expect(harness.getValue().isRefining).toBe(true);

    // 4. Excellent fix (11m) completes refinement
    act(() => {
      webWatchSuccess?.({
        timestamp: Date.now(),
        coords: {
          latitude: 26.8469,
          longitude: 80.9464,
          accuracy: 11.4,
          altitude: 122,
          altitudeAccuracy: 3,
          heading: 100,
          speed: 1.5,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });
    expect(harness.getValue().accuracy).toBe(11);
    expect(harness.getValue().qualityTier).toBe('excellent');
    expect(harness.getValue().isRefining).toBe(false);
    expect(harness.getValue().lastUpdatedAt).not.toBeNull();

    harness.unmount();
    expect(mockWebClearWatch).toHaveBeenCalledWith(101);
  });

  it('preserves manual pin against live GPS overwrites until clearManualLocation or refreshFix', async () => {
    mockWebGetCurrentPosition.mockImplementation((success: PositionCallback) => {
      success({
        timestamp: Date.now(),
        coords: {
          latitude: 26.9,
          longitude: 80.99,
          accuracy: 9,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });

    const harness = mountHook<GeolocationContextValue>(() => useGeolocation());
    await act(async () => {
      await Promise.resolve();
    });

    // Receive initial GPS fix
    act(() => {
      webWatchSuccess?.({
        timestamp: Date.now(),
        coords: {
          latitude: 26.85,
          longitude: 80.95,
          accuracy: 14,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });

    // Place manual pin
    act(() => {
      harness.getValue().setManualLocation(25.1234, 81.5678);
    });

    expect(harness.getValue().latitude).toBe(25.1234);
    expect(harness.getValue().longitude).toBe(81.5678);
    expect(harness.getValue().locationSource).toBe('manual_pin');
    expect(harness.getValue().isRefining).toBe(false);

    // Incoming GPS watch event must NOT overwrite manual pin
    act(() => {
      webWatchSuccess?.({
        timestamp: Date.now(),
        coords: {
          latitude: 26.86,
          longitude: 80.96,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
      } as GeolocationPosition);
    });

    expect(harness.getValue().latitude).toBe(25.1234);
    expect(harness.getValue().locationSource).toBe('manual_pin');

    // Clearing manual pin restores latest live GPS fix
    act(() => {
      harness.getValue().clearManualLocation();
    });

    expect(harness.getValue().latitude).toBe(26.86);
    expect(harness.getValue().longitude).toBe(80.96);
    expect(harness.getValue().locationSource).toBe('gps');

    // Re-pin and call refreshFix() -> clears manual pin and fetches fresh fix
    act(() => {
      harness.getValue().setManualLocation(25.0, 81.0);
    });
    await act(async () => {
      await harness.getValue().refreshFix();
    });

    expect(harness.getValue().latitude).toBe(26.9);
    expect(harness.getValue().longitude).toBe(80.99);
    expect(harness.getValue().locationSource).toBe('gps');
    expect(harness.getValue().qualityTier).toBe('excellent');

    harness.unmount();
  });

  it('handles permission denial and GPS disabled states on Web', async () => {
    const harness = mountHook<GeolocationContextValue>(() => useGeolocation());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      webWatchError?.({
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });

    expect(harness.getValue().permissionState).toBe('denied');
    expect(harness.getValue().isRefining).toBe(false);
    expect(harness.getValue().latitude).toBeNull();

    act(() => {
      webWatchError?.({
        code: 2,
        message: 'Location services unavailable',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
    });

    expect(harness.getValue().permissionState).toBe('gps_disabled');
    expect(harness.getValue().isRefining).toBe(false);

    harness.unmount();
  });

  it('uses @capacitor/geolocation on native platform and handles permission requests & cleanup', async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockCapCheckPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    mockCapRequestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });

    let nativeCallback: ((pos: unknown, err?: unknown) => void) | null = null;
    mockCapWatchPosition.mockImplementation((_opts: unknown, cb: (pos: unknown, err?: unknown) => void) => {
      nativeCallback = cb;
      return Promise.resolve('native-watch-1');
    });
    mockCapClearWatch.mockResolvedValue(undefined);

    const harness = mountHook<GeolocationContextValue>(() => useGeolocation());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCapCheckPermissions).toHaveBeenCalledTimes(1);
    expect(mockCapRequestPermissions).toHaveBeenCalledWith({ permissions: ['location'] });
    expect(mockCapWatchPosition).toHaveBeenCalledWith(
      expect.objectContaining({ enableHighAccuracy: true, maximumAge: 0 }),
      expect.any(Function)
    );

    act(() => {
      nativeCallback?.({
        timestamp: Date.now(),
        coords: {
          latitude: 27.1767,
          longitude: 78.0081,
          accuracy: 8,
          altitude: 170,
          altitudeAccuracy: 4,
          heading: 45,
          speed: 0.9,
        },
      });
    });

    expect(harness.getValue().latitude).toBe(27.1767);
    expect(harness.getValue().qualityTier).toBe('excellent');
    expect(harness.getValue().permissionState).toBe('granted');

    harness.unmount();
    expect(mockCapClearWatch).toHaveBeenCalledWith({ id: 'native-watch-1' });
  });

  it('shares a single watchPosition across multiple consumers inside GeolocationProvider', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let valA!: GeolocationContextValue;
    let valB!: GeolocationContextValue;

    const ConsumerA: React.FC = () => {
      valA = useGeolocation();
      return null;
    };
    const ConsumerB: React.FC = () => {
      valB = useGeolocation();
      return null;
    };

    act(() => {
      root.render(
        React.createElement(
          GeolocationProvider,
          null,
          React.createElement(ConsumerA),
          React.createElement(ConsumerB)
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockWebWatchPosition).toHaveBeenCalledTimes(1);
    expect(valA).toBe(valB);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('filters stationary micro-jitter, rejects accuracy spikes, allows walking updates, and persists detected location', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-25T10:00:00.000Z'));
      const harness = mountHook<GeolocationContextValue>(() => useGeolocation());
      await act(async () => {
        await Promise.resolve();
      });

      // 1. Good initial fix
      act(() => {
        webWatchSuccess?.({
          timestamp: Date.now(),
          coords: {
            latitude: 12.9716,
            longitude: 77.5946,
            accuracy: 18,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: 0,
            toJSON: () => ({}),
          },
        } as GeolocationPosition);
      });

      expect(harness.getValue().latitude).toBe(12.9716);
      expect(getLastDetectedLocation()).toEqual(
        expect.objectContaining({ latitude: 12.9716, longitude: 77.5946, accuracy: 18 })
      );

      // 2. Stationary micro-jitter (< 2.5m within 2s, no accuracy gain) should be ignored
      vi.advanceTimersByTime(2000);
      act(() => {
        webWatchSuccess?.({
          timestamp: Date.now(),
          coords: {
            latitude: 12.971605,
            longitude: 77.594605,
            accuracy: 20,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: 0.1,
            toJSON: () => ({}),
          },
        } as GeolocationPosition);
      });
      expect(harness.getValue().latitude).toBe(12.9716);

      // 3. Severe accuracy spike (140m) right after should be rejected
      vi.advanceTimersByTime(1000);
      act(() => {
        webWatchSuccess?.({
          timestamp: Date.now(),
          coords: {
            latitude: 12.978,
            longitude: 77.602,
            accuracy: 140,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: 0.2,
            toJSON: () => ({}),
          },
        } as GeolocationPosition);
      });
      expect(harness.getValue().latitude).toBe(12.9716);
      expect(harness.getValue().accuracy).toBe(18);

      // 4. Walking update (>= 3m, <= 50m accuracy, >= 2.5s elapsed) updates smoothly even if accuracy is 22m
      vi.advanceTimersByTime(2600);
      act(() => {
        webWatchSuccess?.({
          timestamp: Date.now(),
          coords: {
            latitude: 12.97172,
            longitude: 77.59472,
            accuracy: 22,
            altitude: null,
            altitudeAccuracy: null,
            heading: 45,
            speed: 1.3,
            toJSON: () => ({}),
          },
        } as GeolocationPosition);
      });
      expect(harness.getValue().latitude).toBe(12.97172);
      expect(harness.getValue().accuracy).toBe(22);

      const savedRaw = localStorage.getItem(LAST_DETECTED_LOCATION_KEY);
      expect(savedRaw).not.toBeNull();
      expect(JSON.parse(savedRaw!).latitude).toBe(12.97172);

      harness.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useCompassHeading', () => {
  it('converts degrees to cardinal directions and listens to deviceorientationabsolute', () => {
    expect(degreesToCardinal(0)).toBe('N');
    expect(degreesToCardinal(90)).toBe('E');
    expect(degreesToCardinal(180)).toBe('S');
    expect(degreesToCardinal(225)).toBe('SW');
    expect(degreesToCardinal(null)).toBeNull();

    const harness = mountHook<CompassHeadingState>(() => useCompassHeading(), false);
    expect(harness.getValue()).toEqual({ headingDegrees: null, cardinal: null });

    act(() => {
      const event = new Event('deviceorientationabsolute') as DeviceOrientationEvent;
      Object.defineProperty(event, 'alpha', { value: 270 });
      Object.defineProperty(event, 'absolute', { value: true });
      window.dispatchEvent(event);
    });

    expect(harness.getValue()).toEqual({ headingDegrees: 90, cardinal: 'E' });
    harness.unmount();
  });
});

describe('PermissionPromptCard', () => {
  it('renders accessible recovery UI with Retry Permission and Open App Settings actions', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onRetry = vi.fn();

    act(() => {
      root.render(
        React.createElement(PermissionPromptCard, {
          kind: 'camera',
          permissionState: 'denied',
          onRetry,
        })
      );
    });

    const card = container.querySelector('.permission-prompt-card');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('role')).toBe('alert');

    const retryBtn = container.querySelector('.permission-prompt-card__retry') as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();
    act(() => {
      retryBtn.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    const settingsBtn = container.querySelector('.permission-prompt-card__settings') as HTMLButtonElement;
    expect(container.querySelector('.permission-prompt-card__steps')).toBeNull();
    act(() => {
      settingsBtn.click();
    });
    expect(container.querySelector('.permission-prompt-card__steps')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
