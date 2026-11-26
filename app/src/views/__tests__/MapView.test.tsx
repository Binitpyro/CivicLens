// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAST_DETECTED_LOCATION_KEY,
  type GeolocationPermissionState,
  type GpsQualityTier,
} from '../../hooks/useGeolocation';

const {
  mockMapInit,
  mockSetView,
  mockPanTo,
  mockFitBounds,
  mockDistance,
  mockGetCenter,
  mockSetLatLng,
  mockSetIcon,
  mockMarkerAddTo,
  mockMarkerRemove,
  mockCircleSetLatLng,
  mockCircleSetRadius,
  mockCircleSetStyle,
  mockContainerPointToLatLng,
  mapEventHandlers,
  leafletState,
} = vi.hoisted(() => ({
  mockMapInit: vi.fn(),
  mockSetView: vi.fn(),
  mockPanTo: vi.fn(),
  mockFitBounds: vi.fn(),
  mockDistance: vi.fn(() => 0),
  mockGetCenter: vi.fn(() => ({ lat: 19.076, lng: 72.8777 })),
  mockSetLatLng: vi.fn(),
  mockSetIcon: vi.fn(),
  mockMarkerAddTo: vi.fn(),
  mockMarkerRemove: vi.fn(),
  mockCircleSetLatLng: vi.fn(),
  mockCircleSetRadius: vi.fn(),
  mockCircleSetStyle: vi.fn(),
  mockContainerPointToLatLng: vi.fn(() => ({ lat: 19.0765, lng: 72.8781 })),
  mapEventHandlers: new Map<string, ((e?: unknown) => void)[]>(),
  leafletState: {
    mapContainerEl: null as HTMLDivElement | null,
    createdMarkerEls: [] as HTMLElement[],
  },
}));

let mockGeoState = {
  latitude: null as number | null,
  longitude: null as number | null,
  accuracy: null as number | null,
  speed: null as number | null,
  heading: null as number | null,
  locationSource: null as 'gps' | 'manual_pin' | null,
  permissionState: 'prompt' as GeolocationPermissionState,
  qualityTier: 'none' as GpsQualityTier,
  isRefining: false,
  loading: false,
  lastUpdatedAt: null as number | null,
  error: null as string | null,
  requestPermissionAndStart: vi.fn(),
  refreshFix: vi.fn(),
  getSingleFix: vi.fn(),
  setManualLocation: vi.fn(),
  clearManualLocation: vi.fn(),
};

let mockHeadingState = {
  headingDegrees: null as number | null,
  cardinal: null as string | null,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../hooks/useGeolocation', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useGeolocation')>(
    '../../hooks/useGeolocation'
  );
  return {
    ...actual,
    useGeolocation: () => mockGeoState,
  };
});

vi.mock('../../hooks/useCompassHeading', () => ({
  useCompassHeading: () => mockHeadingState,
}));

vi.mock('../../hooks/useOfflineSync', () => ({
  useOfflineSync: () => ({ triggerSync: vi.fn() }),
}));

vi.mock('../../utils/seedLoader', () => ({
  initializeLocalSeedData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../db', () => ({
  db: {
    assets: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn().mockResolvedValue(undefined) },
    issues: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock('leaflet', () => {
  const makeMarker = () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<div class="live-gps-marker"><div class="live-gps-heading-cone" style="display: none;"></div><div class="live-gps-pulse"></div><div class="live-gps-dot"></div></div>';
    leafletState.createdMarkerEls.push(el);
    const marker = {
      addTo: mockMarkerAddTo.mockImplementation(() => marker),
      setLatLng: mockSetLatLng,
      setIcon: mockSetIcon,
      getElement: () => el,
      on: vi.fn(),
    };
    return marker;
  };

  const makeCircle = () => {
    const circle = {
      addTo: vi.fn().mockImplementation(() => circle),
      setLatLng: mockCircleSetLatLng,
      setRadius: mockCircleSetRadius,
      setStyle: mockCircleSetStyle,
    };
    return circle;
  };

  const mapObj = {
    addLayer: vi.fn(),
    removeLayer: mockMarkerRemove,
    on: vi.fn((evt: string, fn: (e?: unknown) => void) => {
      const list = mapEventHandlers.get(evt) || [];
      list.push(fn);
      mapEventHandlers.set(evt, list);
    }),
    getCenter: mockGetCenter,
    getZoom: () => 16,
    setView: mockSetView,
    panTo: mockPanTo,
    distance: mockDistance,
    fitBounds: mockFitBounds,
    invalidateSize: vi.fn(),
    getContainer: () => leafletState.mapContainerEl,
    containerPointToLatLng: mockContainerPointToLatLng,
    remove: vi.fn(),
  };

  const LMock = {
    map: vi.fn((el: HTMLElement, opts: unknown) => {
      leafletState.mapContainerEl = el as HTMLDivElement;
      mockMapInit(opts);
      return mapObj;
    }),
    control: { zoom: vi.fn(() => ({ addTo: vi.fn() })) },
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    markerClusterGroup: vi.fn(() => ({ clearLayers: vi.fn(), addLayer: vi.fn() })),
    featureGroup: vi.fn(() => ({ getBounds: () => ({ pad: () => ({}) }) })),
    divIcon: vi.fn((opts: unknown) => opts),
    marker: vi.fn(() => makeMarker()),
    circle: vi.fn(() => makeCircle()),
    point: vi.fn((x: number, y: number) => ({ x, y })),
    polyline: vi.fn(() => ({ addTo: vi.fn(), getBounds: () => ({ pad: () => ({}) }) })),
  };

  return { default: LMock };
});

vi.mock('leaflet.markercluster', () => ({}));

import { MapView } from '../MapView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MapView interactions & GPS rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mapEventHandlers.clear();
    leafletState.createdMarkerEls = [];
    leafletState.mapContainerEl = null;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mockGeoState = {
      ...mockGeoState,
      latitude: null,
      longitude: null,
      accuracy: null,
      qualityTier: 'none',
    };
    mockHeadingState = { headingDegrees: null, cardinal: null };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('uses previously detected location as default center instead of Delhi', async () => {
    localStorage.setItem(
      LAST_DETECTED_LOCATION_KEY,
      JSON.stringify({ latitude: 19.076, longitude: 72.8777, accuracy: 12, updatedAt: Date.now() })
    );

    await act(async () => {
      root.render(React.createElement(MapView, { onReportIssueAtLocation: vi.fn() }));
      await Promise.resolve();
    });

    expect(mockMapInit).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [19.076, 72.8777],
      })
    );
    expect(container.textContent).toContain('19.07600°N, 72.87770°E');
  });

  it('opens Quick Add menu on hold tap and cancels if pointer drags past threshold', async () => {
    vi.useFakeTimers();
    try {
      const onQuickAddAtLocation = vi.fn();
      const onReportIssueAtLocation = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(MapView, {
            onQuickAddAtLocation,
            onReportIssueAtLocation,
          })
        );
        await Promise.resolve();
      });

      const mapDiv = container.querySelector('.leaflet-map-div') as HTMLDivElement;
      expect(mapDiv).not.toBeNull();

      // 1. Dragging (> 10px) cancels hold tap
      act(() => {
        mapDiv.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true, clientX: 100, clientY: 100, pointerId: 1 })
        );
        mapDiv.dispatchEvent(
          new PointerEvent('pointermove', { bubbles: true, clientX: 125, clientY: 100, pointerId: 1 })
        );
      });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(container.textContent).not.toContain('Quick Add at Pin');

      // 2. Stationary hold tap (>= 480ms) opens Quick Add menu
      act(() => {
        mapDiv.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, isPrimary: true, clientX: 140, clientY: 180, pointerId: 2 })
        );
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(container.textContent).toContain('Quick Add at Pin');
      expect(container.textContent).toContain('19.07650°N, 72.87810°E');

      const handpumpBtn = Array.from(container.querySelectorAll('.quick-add-menu-item')).find((btn) =>
        btn.textContent?.includes('Handpump')
      ) as HTMLButtonElement;
      expect(handpumpBtn).toBeDefined();

      act(() => {
        handpumpBtn.click();
      });

      expect(onQuickAddAtLocation).toHaveBeenCalledWith(19.0765, 72.8781, 'handpump');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps user pulse marker DOM steady across heading/GPS updates and rotates cone in place', async () => {
    mockGeoState = {
      ...mockGeoState,
      latitude: 19.076,
      longitude: 72.8777,
      accuracy: 10,
      locationSource: 'gps',
      qualityTier: 'excellent',
    };
    mockHeadingState = { headingDegrees: 45, cardinal: 'NE' };

    await act(async () => {
      root.render(React.createElement(MapView, {}));
      await Promise.resolve();
    });

    const markerEl = leafletState.createdMarkerEls[0];
    const coneEl = markerEl?.querySelector('.live-gps-heading-cone') as HTMLElement;
    expect(coneEl.style.display).toBe('block');
    expect(coneEl.style.transform).toContain('rotate(45deg)');
    expect(mockSetIcon).not.toHaveBeenCalled();

    // Update heading and minor GPS jitter (< 3m): should NOT call setIcon or panTo
    mockHeadingState = { headingDegrees: 120, cardinal: 'SE' };
    mockGeoState = { ...mockGeoState, latitude: 19.076005, longitude: 72.877705 };
    mockDistance.mockReturnValue(0.8);

    await act(async () => {
      root.render(React.createElement(MapView, {}));
      await Promise.resolve();
    });

    expect(mockSetIcon).not.toHaveBeenCalled();
    expect(mockPanTo).not.toHaveBeenCalled();
    expect(coneEl.style.transform).toContain('rotate(120deg)');
  });
});
