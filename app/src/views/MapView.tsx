import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';

// Ensure global L is assigned before markercluster loads
if (typeof window !== 'undefined') {
  (window as unknown as { L: unknown }).L = L;
}
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { db, type LocalAsset, type LocalIssue, type PhotoCaptureMeta } from '../db';
import { initializeLocalSeedData } from '../utils/seedLoader';
import { BottomSheet } from '../components/BottomSheet';
import { PermissionPromptCard } from '../components/PermissionPromptCard';
import { CameraReviewModal } from '../components/CameraReviewModal';
import { getLastDetectedLocation, useGeolocation } from '../hooks/useGeolocation';
import { useCompassHeading } from '../hooks/useCompassHeading';
import { useOfflineSync } from '../hooks/useOfflineSync';
import {
  captureCameraOnlyPhoto,
  CameraCancelledError,
  CameraPermissionError,
  CameraUnavailableError,
} from '../services/cameraService';
import {
  getAssetTypeIcon,
  IconPlus,
  IconRapid,
  IconCompass,
  IconClose,
  IconLocate,
  IconMapPin,
  IconCamera,
  IconPhotoCheck,
  IconAlertTriangle,
  IconInfo,
} from '../components/CivicIcons';
import { API_BASE } from '../services/apiService';
import {
  optimizeMaintenanceRoute,
  type RouteOptimizationResult,
  type MaintenanceTicket,
  type ScheduledStop,
} from '../services/routeOptimizationService';

// Crisp inline SVGs for Leaflet DivIcons
const SVG_ICONS: Record<string, string> = {
  water: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h10a4 4 0 0 0 4-4V5"/><path d="M15 5h6"/><path d="M18 2v6"/><path d="M7 12v7"/><path d="M5 19h4"/><path d="M18 13a2.5 2.5 0 0 1-2.5 2.5c-1.5 0-2.5-1.5-2.5-2.5a2.5 2.5 0 0 1 5 0z"/></svg>`,
  lighting: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21h4"/><path d="M9 21V5a2 2 0 0 1 2-2h4a3 3 0 0 1 3 3v2"/><path d="M15 8h6l-1 5h-4l-1-5z"/></svg>`,
  sanitation: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5H7z"/><path d="M9 9v3a4 4 0 0 0 6 0V9"/><path d="M12 16v5"/><path d="M9 21h6"/></svg>`,
  education: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10l10-6 10 6-10 6L2 10z"/><path d="M6 12.5V17c0 2 3 3.5 6 3.5s6-1.5 6-3.5v-4.5"/><path d="M22 10v6"/></svg>`,
  building: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/></svg>`,
  issue: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  resolved: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// Singleton icon cache for zero-allocation marker rendering
const iconCache = new Map<string, L.DivIcon>();
function getCachedIcon(svgKey: string, pinClass: string): L.DivIcon {
  const key = `${svgKey}:${pinClass}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const svgHtml = SVG_ICONS[svgKey] || SVG_ICONS.building;
    icon = L.divIcon({
      className: 'civic-map-pin-wrap',
      html: `<div class="civic-map-pin ${pinClass}">${svgHtml}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function getAccuracyColor(qualityTier: 'excellent' | 'fair' | 'poor' | 'none') {
  if (qualityTier === 'excellent') {
    return { stroke: '#15803D', fill: '#22C55E' };
  }
  if (qualityTier === 'fair') {
    return { stroke: '#D97706', fill: '#F59E0B' };
  }
  return { stroke: '#B91C1C', fill: '#EF4444' };
}

interface RemoteFeatureProperties {
  id: string;
  ward_id: number;
  asset_type?: string;
  name?: string;
  lbd_asset_id?: string;
  category?: string;
  severity?: string;
  description?: string;
  photo_url?: string;
  photos?: PhotoCaptureMeta[];
  gps_accuracy_m?: number | null;
  heading_deg?: number | null;
  location_source?: 'gps' | 'manual_pin';
  resolution_photo_url?: string;
  resolution_photo_meta?: PhotoCaptureMeta;
  status: string;
  attributes?: Record<string, unknown>;
  version_id?: number;
  client_seq_num?: number;
  date_reported?: string;
}

interface RemoteGeoFeature {
  geometry: { coordinates: [number, number] };
  properties: RemoteFeatureProperties;
}

type LeafletWithCluster = typeof L & {
  markerClusterGroup: (options: Record<string, unknown>) => L.LayerGroup;
};

interface SelectedMapItem {
  kind: 'asset' | 'issue';
  id: string;
  title: string;
  type: string;
  details: string;
  status: string;
  latitude: number;
  longitude: number;
  issue?: LocalIssue;
  asset?: LocalAsset;
}

const DELHI_DEFAULT_COORDS = { lat: 28.6139, lng: 77.2090 };
const HOLD_TAP_DURATION_MS = 480;
const HOLD_TAP_MOVE_THRESHOLD_PX = 10;

const QUICK_ADD_ASSET_TYPES = [
  { id: 'handpump', name: 'Handpump' },
  { id: 'streetlight', name: 'Streetlight' },
  { id: 'public_toilet', name: 'Public Toilet' },
  { id: 'drainage', name: 'Drainage Culvert' },
  { id: 'anganwadi', name: 'Anganwadi' },
  { id: 'school', name: 'School Facility' },
] as const;

interface MapViewProps {
  onReportIssueAtLocation?: (lat: number, lng: number) => void;
  onQuickAddAtLocation?: (lat: number, lng: number, assetType?: string) => void;
  pinPickTarget?: 'report' | 'quickAdd' | null;
  onCancelPinPick?: () => void;
  onPinPicked?: (lat: number, lng: number) => void;
  userRole?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  onReportIssueAtLocation,
  onQuickAddAtLocation,
  pinPickTarget = null,
  onCancelPinPick,
  onPinPicked,
  userRole,
}) => {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const {
    latitude: gpsLat,
    longitude: gpsLng,
    accuracy: gpsAccuracy,
    speed: gpsSpeed,
    heading: gpsHeading,
    permissionState,
    qualityTier,
    requestPermissionAndStart,
    refreshFix,
  } = useGeolocation();
  const { headingDegrees, cardinal } = useCompassHeading({ gpsHeading, speed: gpsSpeed });
  const { triggerSync } = useOfflineSync();

  const [initialCenterState] = useState<{ lat: number; lng: number; isDetected: boolean }>(() => {
    if (gpsLat !== null && gpsLng !== null && Number.isFinite(gpsLat) && Number.isFinite(gpsLng)) {
      return { lat: gpsLat, lng: gpsLng, isDetected: true };
    }
    const saved = getLastDetectedLocation();
    if (saved) {
      return { lat: saved.latitude, lng: saved.longitude, isDetected: true };
    }
    return { ...DELHI_DEFAULT_COORDS, isDetected: false };
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsCircleRef = useRef<L.Circle | null>(null);
  const quickAddPinMarkerRef = useRef<L.Marker | null>(null);
  const initialCenterRef = useRef(initialCenterState);
  const hasDetectedDefaultRef = useRef<boolean>(initialCenterState.isDetected);
  const hasFittedBoundsRef = useRef<boolean>(false);
  const hasCenteredOnGpsRef = useRef<boolean>(false);
  const followModeRef = useRef<boolean>(true);
  const pinPickTargetRef = useRef<'report' | 'quickAdd' | null>(pinPickTarget);
  const onPinPickedRef = useRef(onPinPicked);

  useEffect(() => {
    pinPickTargetRef.current = pinPickTarget;
  }, [pinPickTarget]);

  useEffect(() => {
    onPinPickedRef.current = onPinPicked;
  }, [onPinPicked]);

  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [issues, setIssues] = useState<LocalIssue[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem | null>(null);
  const [quickAddPin, setQuickAddPin] = useState<{ lat: number; lng: number } | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>(() => ({
    lat: initialCenterState.lat,
    lng: initialCenterState.lng,
  }));
  const [isFollowing, setIsFollowing] = useState<boolean>(true);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [routeResult, setRouteResult] = useState<RouteOptimizationResult | null>(null);
  const [showHudLegend, setShowHudLegend] = useState(false);
  const [mapToast, setMapToast] = useState<string | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  const [resolveTargetIssue, setResolveTargetIssue] = useState<LocalIssue | null>(null);
  const [resolveCameraModal, setResolveCameraModal] = useState<{
    isOpen: boolean;
    mode: 'native' | 'webrtc';
    initialDataUrl: string | null;
  }>({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
  const [resolveCameraDenied, setResolveCameraDenied] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const isOfflineDemo =
    typeof window !== 'undefined' &&
    localStorage.getItem('civiclens_token') === 'offline-demo-token';
  const canResolveIssues =
    userRole === 'admin' || userRole === 'panchayat_officer' || isOfflineDemo;

  useEffect(() => {
    followModeRef.current = isFollowing;
  }, [isFollowing]);

  useEffect(() => {
    if (!mapToast) return;
    const timer = setTimeout(() => setMapToast(null), 3200);
    return () => clearTimeout(timer);
  }, [mapToast]);

  const handleOptimizeRoute = () => {
    if (routeResult) {
      if (routePolylineRef.current && leafletMap.current) {
        leafletMap.current.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      setRouteResult(null);
      return;
    }

    const openTickets: MaintenanceTicket[] = issues
      .filter((i) => i.status === 'open' || i.status === 'in_progress')
      .map((i) => ({
        id: i.id,
        category: i.category,
        severity: (i.severity as MaintenanceTicket['severity']) || 'medium',
        latitude: i.latitude,
        longitude: i.longitude,
        daysPending: Math.max(
          1,
          Math.round((Date.now() - new Date(i.date_reported || Date.now()).getTime()) / (1000 * 3600 * 24))
        ),
        description: i.description,
      }));

    if (openTickets.length === 0) {
      setMapToast(label('map.noOpenIssuesRoute', 'No open issues found to plan a route.'));
      return;
    }

    const depot = {
      id: 'gp_bhawan',
      name: 'Gram Panchayat Bhawan',
      latitude: gpsLat ?? currentCoords.lat,
      longitude: gpsLng ?? currentCoords.lng,
    };

    const result = optimizeMaintenanceRoute(depot, openTickets);
    setRouteResult(result);

    if (leafletMap.current && result.stops.length > 0) {
      if (routePolylineRef.current) {
        leafletMap.current.removeLayer(routePolylineRef.current);
      }
      const latlngs: [number, number][] = [
        [result.depot.latitude, result.depot.longitude],
        ...result.stops.map((s: ScheduledStop) => [s.latitude, s.longitude] as [number, number]),
        [result.depot.latitude, result.depot.longitude],
      ];
      routePolylineRef.current = L.polyline(latlngs, {
        color: '#D97706',
        weight: 4,
        dashArray: '6, 8',
        opacity: 0.9,
      }).addTo(leafletMap.current);

      try {
        leafletMap.current.fitBounds(routePolylineRef.current.getBounds().pad(0.15));
      } catch {
        // Safe fallback
      }
    }
  };

  const handleFocusRouteStop = (stop: ScheduledStop) => {
    if (!leafletMap.current) return;
    followModeRef.current = false;
    setIsFollowing(false);
    leafletMap.current.setView([stop.latitude, stop.longitude], Math.max(leafletMap.current.getZoom(), 17), {
      animate: true,
    });
    setCurrentCoords({ lat: stop.latitude, lng: stop.longitude });
  };

  // 1. Prioritize fast local seed data & IndexedDB loading first
  useEffect(() => {
    let isMounted = true;

    async function initData() {
      try {
        await initializeLocalSeedData();

        const localAssets = await db.assets.toArray();
        const localIssues = await db.issues.toArray();

        if (isMounted) {
          setAssets(localAssets);
          setIssues(localIssues);
          setIsDataLoading(false);
        }

        const runningOfflineDemo =
          typeof window !== 'undefined' &&
          localStorage.getItem('civiclens_token') === 'offline-demo-token';

        if (navigator.onLine && !runningOfflineDemo) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          try {
            const [assetRes, issueRes] = await Promise.all([
              fetch(`${API_BASE}/assets`, { signal: controller.signal }),
              fetch(`${API_BASE}/issues`, { signal: controller.signal }),
            ]);

            clearTimeout(timeoutId);

            if (assetRes.ok) {
              const assetData = await assetRes.json();
              if (assetData.features) {
                const remoteAssets: LocalAsset[] = (assetData.features as RemoteGeoFeature[]).map((f) => ({
                  id: f.properties.id,
                  ward_id: f.properties.ward_id,
                  asset_type: f.properties.asset_type || 'building',
                  name: f.properties.name || '',
                  lbd_asset_id: f.properties.lbd_asset_id,
                  status: f.properties.status,
                  latitude: f.geometry.coordinates[1],
                  longitude: f.geometry.coordinates[0],
                  photo_url: f.properties.photo_url,
                  attributes: f.properties.attributes || {},
                  version_id: f.properties.version_id || 1,
                  sync_state: 'submitted' as const,
                }));
                if (isMounted) {
                  setAssets(remoteAssets);
                  db.assets.bulkPut(remoteAssets).catch(() => {});
                }
              }
            }

            if (issueRes.ok) {
              const issueData = await issueRes.json();
              if (issueData.features) {
                const remoteIssues: LocalIssue[] = (issueData.features as RemoteGeoFeature[]).map((f) => ({
                  id: f.properties.id,
                  ward_id: f.properties.ward_id,
                  category: f.properties.category || 'Water Supply',
                  severity: f.properties.severity || 'medium',
                  description: f.properties.description || '',
                  photo_url: f.properties.photo_url,
                  photos: f.properties.photos,
                  gps_accuracy_m: f.properties.gps_accuracy_m,
                  heading_deg: f.properties.heading_deg,
                  location_source: f.properties.location_source,
                  resolution_photo_url: f.properties.resolution_photo_url,
                  resolution_photo_meta: f.properties.resolution_photo_meta,
                  status: f.properties.status,
                  latitude: f.geometry.coordinates[1],
                  longitude: f.geometry.coordinates[0],
                  version_id: f.properties.version_id || 1,
                  client_seq_num: f.properties.client_seq_num || Date.now(),
                  date_reported: f.properties.date_reported || new Date().toISOString(),
                  sync_state: 'submitted' as const,
                }));
                if (isMounted) {
                  setIssues(remoteIssues);
                  db.issues.bulkPut(remoteIssues).catch(() => {});
                }
              }
            }
          } catch {
            // Safe offline fallback
          }
        }
      } catch (err) {
        console.error('Failed to initialize local data in MapView:', err);
        if (isMounted) setIsDataLoading(false);
      }
    }

    initData();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const { lat: defaultLat, lng: defaultLng, isDetected } = initialCenterRef.current;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: isDetected ? 16 : 15,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const clusterGroup = (L as unknown as LeafletWithCluster).markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 36,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
    });
    map.addLayer(clusterGroup);
    markersLayerRef.current = clusterGroup;
    leafletMap.current = map;

    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let holdOrigin: { x: number; y: number; pointerId: number } | null = null;
    let lastHoldOpenedAt = 0;

    const cancelHoldTap = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      holdOrigin = null;
    };

    const openQuickAddAtLatLng = (latlng: L.LatLng) => {
      lastHoldOpenedAt = Date.now();
      followModeRef.current = false;
      setIsFollowing(false);
      setSelectedItem(null);
      setResolveCameraDenied(false);
      setResolveError(null);
      setQuickAddPin({ lat: latlng.lat, lng: latlng.lng });
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(18);
        } catch {
          // Ignore vibration errors on unsupported devices
        }
      }
    };

    const mapContainer = map.getContainer();

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          '.leaflet-control, .civic-map-pin, .marker-cluster, .map-hud-overlay, .map-locate-fab, .map-cta-bar, .route-summary-card'
        )
      ) {
        return;
      }

      cancelHoldTap();
      holdOrigin = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };

      holdTimer = setTimeout(() => {
        if (!holdOrigin || !leafletMap.current) return;
        const rect = mapContainer.getBoundingClientRect();
        const pt = L.point(holdOrigin.x - rect.left, holdOrigin.y - rect.top);
        const latlng = leafletMap.current.containerPointToLatLng(pt);
        cancelHoldTap();
        openQuickAddAtLatLng(latlng);
      }, HOLD_TAP_DURATION_MS);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!holdOrigin || e.pointerId !== holdOrigin.pointerId) return;
      const dx = e.clientX - holdOrigin.x;
      const dy = e.clientY - holdOrigin.y;
      if (Math.hypot(dx, dy) > HOLD_TAP_MOVE_THRESHOLD_PX) {
        cancelHoldTap();
      }
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (holdOrigin && e.pointerId === holdOrigin.pointerId) {
        cancelHoldTap();
      }
    };

    mapContainer.addEventListener('pointerdown', handlePointerDown);
    mapContainer.addEventListener('pointermove', handlePointerMove);
    mapContainer.addEventListener('pointerup', handlePointerEnd);
    mapContainer.addEventListener('pointercancel', handlePointerEnd);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (pinPickTargetRef.current && onPinPickedRef.current) {
        cancelHoldTap();
        onPinPickedRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      e.originalEvent?.preventDefault();
      if (Date.now() - lastHoldOpenedAt < 650) return;
      cancelHoldTap();
      openQuickAddAtLatLng(e.latlng);
    });

    map.on('dragstart', () => {
      cancelHoldTap();
      followModeRef.current = false;
      setIsFollowing(false);
    });

    map.on('zoomstart', cancelHoldTap);

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('move', () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const center = map.getCenter();
        setCurrentCoords({ lat: center.lat, lng: center.lng });
      }, 80);
    });

    const timer1 = setTimeout(() => {
      if (leafletMap.current) {
        leafletMap.current.invalidateSize();
      }
    }, 150);

    const timer2 = setTimeout(() => {
      if (leafletMap.current) {
        leafletMap.current.invalidateSize();
      }
    }, 450);

    const handleResize = () => {
      if (leafletMap.current) {
        leafletMap.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelHoldTap();
      mapContainer.removeEventListener('pointerdown', handlePointerDown);
      mapContainer.removeEventListener('pointermove', handlePointerMove);
      mapContainer.removeEventListener('pointerup', handlePointerEnd);
      mapContainer.removeEventListener('pointercancel', handlePointerEnd);
      if (moveTimer) clearTimeout(moveTimer);
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
      gpsMarkerRef.current = null;
      gpsCircleRef.current = null;
      quickAddPinMarkerRef.current = null;
      map.remove();
      leafletMap.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // 3. Render Live GPS Blue Dot & Color-Coded Accuracy Circle (steady DOM so pulse never resets)
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (gpsLat === null || gpsLng === null) {
      if (gpsMarkerRef.current) {
        map.removeLayer(gpsMarkerRef.current);
        gpsMarkerRef.current = null;
      }
      if (gpsCircleRef.current) {
        map.removeLayer(gpsCircleRef.current);
        gpsCircleRef.current = null;
      }
      return;
    }

    const latLng: [number, number] = [gpsLat, gpsLng];
    const radius = Math.max(gpsAccuracy ?? 15, 5);
    const { stroke, fill } = getAccuracyColor(qualityTier);

    if (!gpsCircleRef.current) {
      gpsCircleRef.current = L.circle(latLng, {
        radius,
        color: stroke,
        fillColor: fill,
        fillOpacity: 0.14,
        weight: 1.5,
        interactive: false,
      }).addTo(map);
    } else {
      gpsCircleRef.current.setLatLng(latLng);
      gpsCircleRef.current.setRadius(radius);
      gpsCircleRef.current.setStyle({ color: stroke, fillColor: fill });
    }

    if (!gpsMarkerRef.current) {
      const dotIcon = L.divIcon({
        className: 'live-gps-dot-wrap',
        html: '<div class="live-gps-marker"><div class="live-gps-heading-cone" style="display: none;"></div><div class="live-gps-pulse"></div><div class="live-gps-dot"></div></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      gpsMarkerRef.current = L.marker(latLng, {
        icon: dotIcon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map);
    } else {
      gpsMarkerRef.current.setLatLng(latLng);
    }

    if (!hasCenteredOnGpsRef.current && followModeRef.current) {
      hasCenteredOnGpsRef.current = true;
      hasDetectedDefaultRef.current = true;
      map.setView(latLng, Math.max(map.getZoom(), 17), { animate: true });
    } else if (followModeRef.current && map.distance(map.getCenter(), latLng) >= 3) {
      map.panTo(latLng, { animate: true, duration: 0.35 });
    }
  }, [gpsLat, gpsLng, gpsAccuracy, qualityTier]);

  // 3b. Rotate Heading Cone in-place without recreating marker icon or resetting pulse animation
  useEffect(() => {
    const markerEl = gpsMarkerRef.current?.getElement();
    if (!markerEl) return;
    const coneEl = markerEl.querySelector<HTMLElement>('.live-gps-heading-cone');
    if (!coneEl) return;

    if (headingDegrees === null || gpsLat === null || gpsLng === null) {
      coneEl.style.display = 'none';
    } else {
      coneEl.style.display = 'block';
      coneEl.style.transform = `translateX(-50%) rotate(${headingDegrees}deg)`;
    }
  }, [headingDegrees, gpsLat, gpsLng]);

  // 3c. Render temporary Quick Add Pin marker while Quick Add menu is open
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (!quickAddPin) {
      if (quickAddPinMarkerRef.current) {
        map.removeLayer(quickAddPinMarkerRef.current);
        quickAddPinMarkerRef.current = null;
      }
      return;
    }

    const latLng: [number, number] = [quickAddPin.lat, quickAddPin.lng];
    if (!quickAddPinMarkerRef.current) {
      const pinIcon = L.divIcon({
        className: 'quick-add-pin-wrap',
        html: '<div class="quick-add-pin-marker"><div class="quick-add-pin-dot"></div></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      quickAddPinMarkerRef.current = L.marker(latLng, {
        icon: pinIcon,
        zIndexOffset: 1100,
        interactive: false,
      }).addTo(map);
    } else {
      quickAddPinMarkerRef.current.setLatLng(latLng);
    }
  }, [quickAddPin]);

  // 4. Render Markers into Leaflet cluster group
  useEffect(() => {
    const map = leafletMap.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    const addedMarkers: L.Marker[] = [];

    // Render Village Assets
    assets.forEach((asset) => {
      if (activeFilter !== 'all' && activeFilter !== 'assets') return;
      const svgKey =
        asset.asset_type === 'handpump'
          ? 'water'
          : asset.asset_type === 'school'
            ? 'education'
            : asset.asset_type === 'streetlight'
              ? 'lighting'
              : 'building';
      const pinClass =
        asset.asset_type === 'handpump'
          ? 'pin-water'
          : asset.asset_type === 'school'
            ? 'pin-education'
            : asset.asset_type === 'streetlight'
              ? 'pin-lighting'
              : 'pin-sanitation';

      const marker = L.marker([asset.latitude, asset.longitude], {
        icon: getCachedIcon(svgKey, pinClass),
      });

      marker.on('click', () => {
        setResolveCameraDenied(false);
        setResolveError(null);
        setSelectedItem({
          kind: 'asset',
          id: asset.id,
          title: asset.name || asset.asset_type.toUpperCase(),
          type: `Asset • ${asset.asset_type.replace('_', ' ')}`,
          details: `Status: ${asset.status.replace('_', ' ').toUpperCase()}`,
          status: asset.status,
          latitude: asset.latitude,
          longitude: asset.longitude,
          asset,
        });
      });
      markersLayer.addLayer(marker);
      addedMarkers.push(marker);
    });

    // Render Issues / Grievances (distinguish resolved vs open)
    issues.forEach((issue) => {
      if (activeFilter !== 'all' && activeFilter !== 'issues') return;
      const isResolved = issue.status === 'resolved';
      const marker = L.marker([issue.latitude, issue.longitude], {
        icon: getCachedIcon(isResolved ? 'resolved' : 'issue', isResolved ? 'pin-issue-resolved' : 'pin-issue'),
      });

      marker.on('click', () => {
        setResolveCameraDenied(false);
        setResolveError(null);
        setSelectedItem({
          kind: 'issue',
          id: issue.id,
          title: `${issue.category} Issue`,
          type: `Grievance (${issue.severity.toUpperCase()})`,
          details: issue.description || 'No description provided.',
          status: issue.status,
          latitude: issue.latitude,
          longitude: issue.longitude,
          issue,
        });
      });
      markersLayer.addLayer(marker);
      addedMarkers.push(marker);
    });

    map.invalidateSize();
    if (
      !hasFittedBoundsRef.current &&
      !hasCenteredOnGpsRef.current &&
      !hasDetectedDefaultRef.current &&
      addedMarkers.length > 0
    ) {
      hasFittedBoundsRef.current = true;
      try {
        const featureGroup = L.featureGroup(addedMarkers);
        map.fitBounds(featureGroup.getBounds().pad(0.12), { maxZoom: 16 });
      } catch {
        // Safe fallback
      }
    }
  }, [assets, issues, activeFilter]);

  const handleLocateMe = () => {
    if (permissionState === 'denied' || permissionState === 'gps_disabled') {
      requestPermissionAndStart();
      return;
    }
    setIsFollowing(true);
    followModeRef.current = true;
    if (gpsLat !== null && gpsLng !== null && leafletMap.current) {
      hasCenteredOnGpsRef.current = true;
      leafletMap.current.setView([gpsLat, gpsLng], Math.max(leafletMap.current.getZoom(), 17), {
        animate: true,
      });
      setCurrentCoords({ lat: gpsLat, lng: gpsLng });
    }
    refreshFix();
  };

  const handleStartResolveWithPhoto = async (issue: LocalIssue) => {
    setResolveError(null);
    setResolveCameraDenied(false);
    setResolveTargetIssue(issue);

    try {
      const res = await captureCameraOnlyPhoto();
      if (res.mode === 'native') {
        setResolveCameraModal({ isOpen: true, mode: 'native', initialDataUrl: res.dataUrl });
      } else {
        setResolveCameraModal({ isOpen: true, mode: 'webrtc', initialDataUrl: null });
      }
    } catch (err) {
      if (err instanceof CameraCancelledError) {
        return;
      }
      if (err instanceof CameraPermissionError) {
        setResolveCameraDenied(true);
        return;
      }
      if (err instanceof CameraUnavailableError) {
        setResolveError(err.message);
        return;
      }
      setResolveError(err instanceof Error ? err.message : 'Unable to open camera.');
    }
  };

  const handleConfirmResolutionPhoto = async (photoMeta: PhotoCaptureMeta) => {
    if (!resolveTargetIssue) return;
    const nowIso = new Date().toISOString();
    const nextVersion = (resolveTargetIssue.version_id || 1) + 1;

    try {
      await db.transaction('rw', [db.issues, db.outbox], async () => {
        await db.issues.update(resolveTargetIssue.id, {
          status: 'resolved',
          resolution_photo_url: photoMeta.data_url,
          resolution_photo_meta: photoMeta,
          version_id: nextVersion,
          sync_state: 'saved',
        });
        await db.outbox.add({
          record_id: resolveTargetIssue.id,
          table_name: 'issues',
          action: 'update',
          payload: {
            id: resolveTargetIssue.id,
            asset_id: resolveTargetIssue.asset_id ?? null,
            ward_id: resolveTargetIssue.ward_id,
            category: resolveTargetIssue.category,
            severity: resolveTargetIssue.severity,
            description: resolveTargetIssue.description,
            latitude: resolveTargetIssue.latitude,
            longitude: resolveTargetIssue.longitude,
            status: 'resolved',
            resolution_photo_url: photoMeta.data_url,
            resolution_photo_meta: photoMeta,
            date_resolved: nowIso,
            version_id: nextVersion,
          },
          client_seq_num: Date.now(),
          created_at: nowIso,
        });
      });

      const updatedIssue: LocalIssue = {
        ...resolveTargetIssue,
        status: 'resolved',
        resolution_photo_url: photoMeta.data_url,
        resolution_photo_meta: photoMeta,
        version_id: nextVersion,
        sync_state: 'saved',
      };

      setIssues((prev) => prev.map((iss) => (iss.id === updatedIssue.id ? updatedIssue : iss)));
      setSelectedItem((prev) =>
        prev && prev.id === updatedIssue.id
          ? { ...prev, status: 'resolved', issue: updatedIssue }
          : prev
      );
      setResolveCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
      setResolveTargetIssue(null);
      triggerSync();
    } catch (err) {
      console.error('Failed to resolve issue locally:', err);
      setResolveError('Failed to save resolution photo locally.');
      setResolveCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
    }
  };

  const hasLiveGps = gpsLat !== null && gpsLng !== null;
  const showingLiveCoords = hasLiveGps && isFollowing;
  const displayCoords = showingLiveCoords ? { lat: gpsLat!, lng: gpsLng! } : currentCoords;
  const showPermissionBanner = permissionState === 'denied' || permissionState === 'gps_disabled';

  const selectedPhotos = selectedItem?.issue?.photos?.length
    ? selectedItem.issue.photos.map((p) => p.data_url)
    : selectedItem?.issue?.photo_url
      ? [selectedItem.issue.photo_url]
      : selectedItem?.asset?.photo_url
        ? [selectedItem.asset.photo_url]
        : [];

  return (
    <div
      className={`map-view-container ${onReportIssueAtLocation ? 'has-bottom-cta' : ''} ${pinPickTarget ? 'is-pin-pick-mode' : ''}`}
      role="region"
      aria-label="GIS Interactive Map"
    >
      {/* Loading Skeleton */}
      {isDataLoading && (
        <div className="map-loading-skeleton">
          <span className="map-loading-text">{label('map.loadingMap', 'Loading Ward Map Data…')}</span>
        </div>
      )}

      {/* Floating HUD Telemetry & Filter Bar */}
      <div className="map-hud-overlay">
        {pinPickTarget && (
          <div className="map-pin-pick-banner" role="status">
            <div className="map-pin-pick-copy">
              <IconMapPin size={16} />
              <span>{label('map.tapToPinHint', 'Tap anywhere on the map to pick a location')}</span>
            </div>
            {onCancelPinPick && (
              <button
                type="button"
                className="map-pin-pick-cancel"
                onClick={onCancelPinPick}
              >
                {label('map.cancelPinMode', 'Cancel')}
              </button>
            )}
          </div>
        )}

        <div className="hud-telemetry-row">
          <button
            type="button"
            className="hud-telemetry-pill"
            onClick={() => setShowHudLegend((prev) => !prev)}
            aria-expanded={showHudLegend}
            title={label('map.holdToPinHint', 'Hold anywhere on map to drop a pin')}
          >
            {showingLiveCoords ? (
              <span className={`gps-tier-pill gps-tier-${qualityTier}`}>
                <span className="gps-tier-dot" />
                <span>
                  {t('gps.liveLabel')}
                  {gpsAccuracy !== null ? ` ±${gpsAccuracy}m` : ''}
                  {headingDegrees !== null ? ` · ${headingDegrees}°${cardinal ? ` ${cardinal}` : ''}` : ''}
                </span>
              </span>
            ) : (
              <span className="gps-tier-pill gps-tier-none">
                <IconMapPin size={11} />
                <span>{label('map.mapCenter', 'Map Center')}</span>
              </span>
            )}
            <span className="tabular-nums hud-coord-text">
              {displayCoords.lat.toFixed(5)}°N, {displayCoords.lng.toFixed(5)}°E
            </span>
            <IconInfo size={13} className="hud-info-icon" />
          </button>
        </div>

        {showHudLegend && (
          <div className="hud-legend-card" role="note">
            <div className="hud-legend-tiers">
              <span className="hud-tier-key is-good">● ≤15m High</span>
              <span className="hud-tier-key is-fair">● ≤50m Fair</span>
              <span className="hud-tier-key is-weak">● &gt;50m Weak</span>
            </div>
            <div className="hud-legend-tip">
              {label('map.holdToPinHint', 'Hold anywhere on map to drop a pin')}
            </div>
          </div>
        )}

        {mapToast && (
          <div className="map-toast-banner" role="status">
            <IconAlertTriangle size={14} />
            <span>{mapToast}</span>
          </div>
        )}

        {showPermissionBanner && (
          <PermissionPromptCard
            kind="location"
            permissionState={permissionState}
            onRetry={requestPermissionAndStart}
          />
        )}

        <div className="map-filter-chips" role="toolbar" aria-label="Map filters">
          <button
            type="button"
            className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
            aria-label="Show all items"
          >
            {label('map.all', 'All')} (<span className="tabular-nums">{assets.length + issues.length}</span>)
          </button>
          <button
            type="button"
            className={`filter-chip ${activeFilter === 'issues' ? 'active' : ''}`}
            onClick={() => setActiveFilter('issues')}
            aria-label="Show issues only"
          >
            {label('map.issues', 'Issues')} (<span className="tabular-nums">{issues.length}</span>)
          </button>
          <button
            type="button"
            className={`filter-chip ${activeFilter === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveFilter('assets')}
            aria-label="Show assets only"
          >
            {label('map.assets', 'Assets')} (<span className="tabular-nums">{assets.length}</span>)
          </button>
          <button
            type="button"
            className={`filter-chip ${routeResult ? 'filter-chip-route-active' : ''}`}
            onClick={handleOptimizeRoute}
            aria-label="Optimize repair route for open tickets"
          >
            <IconCompass size={14} />
            <span>{routeResult ? label('map.routeActive', 'Route Active') : label('map.repairRoute', 'Repair Route')}</span>
          </button>
        </div>
      </div>

      {/* Leaflet Map Div */}
      <div ref={mapRef} className="leaflet-map-div" />

      {/* Locate Me / Follow GPS FAB */}
      <button
        type="button"
        className={`map-locate-fab ${isFollowing && hasLiveGps ? 'is-following' : ''} ${!onReportIssueAtLocation ? 'has-no-cta' : ''} ${routeResult ? 'has-route' : ''}`}
        onClick={handleLocateMe}
        aria-label={isFollowing ? t('actions.followActive') : t('actions.locateMe')}
        title={isFollowing ? t('actions.followActive') : t('actions.locateMe')}
      >
        <IconLocate size={18} />
      </button>

      {/* Floating Route Summary Card */}
      {routeResult && (
        <div className={`route-summary-card ${onReportIssueAtLocation ? 'has-cta' : ''}`}>
          <div className="route-summary-header">
            <div className="route-summary-title">
              <IconCompass size={15} />
              <span>{label('map.routeTitle', 'Suggested Repair Route')}</span>
            </div>
            <button
              type="button"
              onClick={handleOptimizeRoute}
              className="route-summary-close"
              aria-label={label('map.closeRoute', 'Close repair route')}
            >
              <IconClose size={16} />
            </button>
          </div>
          <div className="route-summary-meta tabular-nums">
            <span><strong>{routeResult.stops.length}</strong> {label('map.stops', 'stops')}</span>
            <span aria-hidden="true">·</span>
            <span><strong>{routeResult.totalDistanceKm} km</strong></span>
            <span aria-hidden="true">·</span>
            <span>{label('map.shift', 'Shift')}: <strong>{Math.floor(routeResult.totalShiftTimeMin / 60)}h {routeResult.totalShiftTimeMin % 60}m</strong></span>
          </div>
          <div className="route-summary-stops">
            {routeResult.stops.map((stop, idx) => (
              <button
                type="button"
                key={stop.ticketId}
                className="route-stop-row"
                onClick={() => handleFocusRouteStop(stop)}
              >
                <span className="route-stop-label">
                  <strong className="tabular-nums">#{idx + 1}</strong> {stop.category}
                </span>
                <span className="status-badge urgent">{stop.severity.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      {onReportIssueAtLocation && !pinPickTarget && (
        <div className="map-cta-bar">
          <button
            type="button"
            className="btn-primary-action"
            onClick={() => onReportIssueAtLocation(displayCoords.lat, displayCoords.lng)}
            aria-label={label('map.reportHere', 'Report Issue at this Location')}
          >
            <IconPlus size={18} />
            <span>{label('map.reportHere', 'Report Issue at this Location')}</span>
          </button>
        </div>
      )}

      {/* Bottom Sheet Modal for Item Details */}
      <BottomSheet
        isOpen={!!selectedItem}
        onClose={() => {
          setSelectedItem(null);
          setResolveCameraDenied(false);
          setResolveError(null);
        }}
        title={selectedItem?.title || 'Details'}
      >
        {selectedItem && (
          <div>
            <div className="gps-fix-actions">
              <span className={`status-badge ${selectedItem.status === 'active' || selectedItem.status === 'resolved' ? 'submitted' : 'urgent'}`}>
                {selectedItem.status.toUpperCase()}
              </span>
              {selectedItem.issue?.location_source && (
                <span className="gps-tier-pill gps-tier-none tabular-nums">
                  {selectedItem.issue.location_source === 'manual_pin'
                    ? t('gps.manualPinLabel')
                    : `${t('gps.liveLabel')}${selectedItem.issue.gps_accuracy_m != null ? ` ±${Math.round(selectedItem.issue.gps_accuracy_m)}m` : ''}`}
                </span>
              )}
              <span className="gps-tier-pill gps-tier-none tabular-nums">
                {selectedItem.latitude.toFixed(5)}°N, {selectedItem.longitude.toFixed(5)}°E
              </span>
            </div>

            <p className="sheet-item-type">{selectedItem.type}</p>
            <p className="sheet-item-details">{selectedItem.details}</p>

            {selectedPhotos.length > 0 && (
              <div className="sheet-photo-strip" aria-label="Evidence photos">
                {selectedPhotos.map((src, idx) => (
                  <img
                    key={`${selectedItem.id}-sheet-photo-${idx}`}
                    src={src}
                    alt={`Evidence ${idx + 1}`}
                    className="sheet-photo-item"
                  />
                ))}
              </div>
            )}

            {selectedItem.issue?.resolution_photo_url && (
              <div className="resolution-proof-box">
                <div className="resolution-proof-header">
                  <IconPhotoCheck size={15} />
                  <span>{t('camera.resolutionProof')}</span>
                </div>
                <img
                  src={selectedItem.issue.resolution_photo_url}
                  alt="Resolution proof"
                  className="photo-preview-image photo-preview-capped"
                />
              </div>
            )}

            {selectedItem.kind === 'asset' && onReportIssueAtLocation && (
              <div className="sheet-resolve-action">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const { latitude, longitude } = selectedItem;
                    setSelectedItem(null);
                    onReportIssueAtLocation(latitude, longitude);
                  }}
                >
                  <IconPlus size={16} />
                  <span>{label('map.reportOnAsset', 'Report Issue Here')}</span>
                </button>
              </div>
            )}

            {selectedItem.kind === 'issue' &&
              selectedItem.issue &&
              canResolveIssues &&
              (selectedItem.status === 'open' || selectedItem.status === 'in_progress') && (
                <div className="sheet-resolve-action">
                  {resolveCameraDenied && (
                    <PermissionPromptCard
                      kind="camera"
                      permissionState="denied"
                      onRetry={() => selectedItem.issue && handleStartResolveWithPhoto(selectedItem.issue)}
                    />
                  )}
                  {resolveError && (
                    <div className="gps-gate-warning" role="alert">
                      <IconAlertTriangle size={15} />
                      <span>{resolveError}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-primary-action"
                    onClick={() => selectedItem.issue && handleStartResolveWithPhoto(selectedItem.issue)}
                  >
                    <IconCamera size={18} />
                    <span>{t('actions.resolveWithPhoto')}</span>
                  </button>
                </div>
              )}
          </div>
        )}
      </BottomSheet>

      {/* Quick Add Menu opened on hold-tap / long-press on map */}
      <BottomSheet
        isOpen={!!quickAddPin}
        onClose={() => setQuickAddPin(null)}
        title={label('map.quickAddAtPin', 'Quick Add at Pin')}
      >
        {quickAddPin && (
          <div>
            <div className="quick-add-menu-coords tabular-nums">
              <span className="gps-tier-pill gps-tier-none">
                <IconMapPin size={11} />
                <span>{t('gps.manualPinLabel')}</span>
              </span>
              <span>
                {quickAddPin.lat.toFixed(5)}°N, {quickAddPin.lng.toFixed(5)}°E
              </span>
            </div>

            {onQuickAddAtLocation && (
              <>
                <div className="quick-add-menu-section-label">
                  {label('map.quickAddAssetSection', 'Quick Add Infrastructure Asset')}
                </div>
                <div className="quick-add-menu-grid">
                  {QUICK_ADD_ASSET_TYPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="quick-add-menu-item"
                      onClick={() => {
                        const target = quickAddPin;
                        setQuickAddPin(null);
                        onQuickAddAtLocation(target.lat, target.lng, item.id);
                      }}
                    >
                      {getAssetTypeIcon(item.id, 16)}
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="quick-add-menu-actions">
              {onQuickAddAtLocation && (
                <button
                  type="button"
                  className="btn-primary-action"
                  onClick={() => {
                    const target = quickAddPin;
                    setQuickAddPin(null);
                    onQuickAddAtLocation(target.lat, target.lng);
                  }}
                >
                  <IconRapid size={18} />
                  <span>{label('map.openQuickAddForm', 'Open Quick Add Form at Pin')}</span>
                </button>
              )}

              {onReportIssueAtLocation && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const target = quickAddPin;
                    setQuickAddPin(null);
                    onReportIssueAtLocation(target.lat, target.lng);
                  }}
                >
                  <IconPlus size={16} />
                  <span>{label('map.reportAtPin', 'Report Issue at this Pin')}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      <CameraReviewModal
        isOpen={resolveCameraModal.isOpen}
        mode={resolveCameraModal.mode}
        initialDataUrl={resolveCameraModal.initialDataUrl}
        telemetry={{
          latitude: gpsLat,
          longitude: gpsLng,
          accuracy: gpsAccuracy,
          headingDegrees,
          locationSource: hasLiveGps ? 'gps' : null,
        }}
        title={t('actions.resolveWithPhoto')}
        onConfirm={handleConfirmResolutionPhoto}
        onCancel={() => {
          setResolveCameraModal({ isOpen: false, mode: 'webrtc', initialDataUrl: null });
          setResolveTargetIssue(null);
        }}
      />
    </div>
  );
};
