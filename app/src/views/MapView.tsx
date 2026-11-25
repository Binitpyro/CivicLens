import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Ensure global L is assigned before markercluster loads
if (typeof window !== 'undefined') {
  (window as unknown as { L: unknown }).L = L;
}
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { db, type LocalAsset, type LocalIssue } from '../db';
import { initializeLocalSeedData } from '../utils/seedLoader';
import { spatialIndex } from '../utils/spatialIndex';
import { preloadMapTiles, type PreloadProgress } from '../utils/tilePreloader';
import { useGeolocation } from '../hooks/useGeolocation';
import { BottomSheet } from '../components/BottomSheet';
import { IconPlus, IconGpsTarget } from '../components/CivicIcons';
import { useWard } from '../context/WardContext';

// Crisp inline SVGs for Leaflet DivIcons
const SVG_ICONS: Record<string, string> = {
  water: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h10a4 4 0 0 0 4-4V5"/><path d="M15 5h6"/><path d="M18 2v6"/><path d="M7 12v7"/><path d="M5 19h4"/><path d="M18 13a2.5 2.5 0 0 1-2.5 2.5c-1.5 0-2.5-1.5-2.5-2.5a2.5 2.5 0 0 1 5 0z"/></svg>`,
  lighting: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21h4"/><path d="M9 21V5a2 2 0 0 1 2-2h4a3 3 0 0 1 3 3v2"/><path d="M15 8h6l-1 5h-4l-1-5z"/></svg>`,
  sanitation: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5H7z"/><path d="M9 9v3a4 4 0 0 0 6 0V9"/><path d="M12 16v5"/><path d="M9 21h6"/></svg>`,
  education: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10l10-6 10 6-10 6L2 10z"/><path d="M6 12.5V17c0 2 3 3.5 6 3.5s6-1.5 6-3.5v-4.5"/><path d="M22 10v6"/></svg>`,
  building: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/></svg>`,
  issue: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
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
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

interface RawGeoJSONFeature {
  properties: Record<string, unknown>;
  geometry: {
    coordinates: [number, number];
  };
}

interface MapViewProps {
  onReportIssueAtLocation?: (lat: number, lng: number) => void;
}

export const MapView: React.FC<MapViewProps> = ({ onReportIssueAtLocation }) => {
  const { wardId, wardLabel } = useWard();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);
  const hasFittedBoundsRef = useRef<boolean>(false);
  const shouldCenterOnUserRef = useRef<boolean>(false);
  const hasAutoCenteredRef = useRef<boolean>(false);

  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);
  const clickTargetMarkerRef = useRef<L.Marker | null>(null);

  // Opt-in live geolocation watch for MapView only (prevents battery drain on other screens)
  const { latitude: userLat, longitude: userLng, accuracy: userAccuracy, heading: userHeading, isLive, locateMe } = useGeolocation({ autoWatch: true });

  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [issues, setIssues] = useState<LocalIssue[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [showHotspots, setShowHotspots] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<{ title: string; type: string; details: string; status: string; lat?: number; lng?: number } | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({ lat: 28.6139, lng: 77.2090 });
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Offline Tile Preload State
  const [isPreloadingTiles, setIsPreloadingTiles] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress | null>(null);

  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

  // 1. Prioritize fast local seed data & IndexedDB loading first
  useEffect(() => {
    let isMounted = true;

    async function initData() {
      try {
        await initializeLocalSeedData();

        const localAssets = await db.assets.toArray();
        const localIssues = await db.issues.toArray();

        if (isMounted) {
          spatialIndex.setAssets(localAssets);
          spatialIndex.setIssues(localIssues);
          setAssets(localAssets);
          setIssues(localIssues);
          setIsDataLoading(false);
        }

        if (navigator.onLine) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          try {
            const [assetRes, issueRes] = await Promise.all([
              fetch(`${API_BASE}/assets?ward_id=${wardId}`, { signal: controller.signal }),
              fetch(`${API_BASE}/issues?ward_id=${wardId}`, { signal: controller.signal }),
            ]);

            clearTimeout(timeoutId);

            if (assetRes.ok) {
              const assetData = await assetRes.json();
              if (assetData.features) {
                const remoteAssets: LocalAsset[] = assetData.features.map((f: RawGeoJSONFeature) => ({
                  id: String(f.properties.id),
                  ward_id: Number(f.properties.ward_id || wardId),
                  asset_type: String(f.properties.asset_type),
                  name: String(f.properties.name || ''),
                  lbd_asset_id: f.properties.lbd_asset_id ? String(f.properties.lbd_asset_id) : undefined,
                  status: String(f.properties.status || 'active'),
                  latitude: f.geometry.coordinates[1],
                  longitude: f.geometry.coordinates[0],
                  attributes: (f.properties.attributes as Record<string, unknown>) || {},
                  version_id: Number(f.properties.version_id || 1),
                  sync_state: 'submitted' as const,
                }));
                if (isMounted) {
                  spatialIndex.setAssets(remoteAssets);
                  setAssets(remoteAssets);
                }
              }
            }

            if (issueRes.ok) {
              const issueData = await issueRes.json();
              if (issueData.features) {
                const remoteIssues: LocalIssue[] = issueData.features.map((f: RawGeoJSONFeature) => ({
                  id: String(f.properties.id),
                  ward_id: Number(f.properties.ward_id || wardId),
                  category: String(f.properties.category),
                  severity: String(f.properties.severity || 'medium'),
                  description: String(f.properties.description || ''),
                  photo_url: f.properties.photo_url ? String(f.properties.photo_url) : undefined,
                  status: String(f.properties.status || 'open'),
                  latitude: f.geometry.coordinates[1],
                  longitude: f.geometry.coordinates[0],
                  version_id: Number(f.properties.version_id || 1),
                  client_seq_num: Number(f.properties.client_seq_num || Date.now()),
                  date_reported: String(f.properties.date_reported || new Date().toISOString()),
                  sync_state: 'submitted' as const,
                }));
                if (isMounted) {
                  spatialIndex.setIssues(remoteIssues);
                  setIssues(remoteIssues);
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
  }, [API_BASE, wardId]);

  // Fetch backend Bounding Box features on moveend when online
  const fetchViewportBboxData = useCallback(async () => {
    const map = leafletMap.current;
    if (!map || !navigator.onLine) return;

    const bounds = map.getBounds();
    const params = new URLSearchParams({
      ward_id: String(wardId),
      minLng: bounds.getWest().toFixed(5),
      minLat: bounds.getSouth().toFixed(5),
      maxLng: bounds.getEast().toFixed(5),
      maxLat: bounds.getNorth().toFixed(5),
    });

    try {
      const [assetRes, issueRes] = await Promise.all([
        fetch(`${API_BASE}/assets?${params}`),
        fetch(`${API_BASE}/issues?${params}`),
      ]);

      if (assetRes.ok) {
        const data = await assetRes.json();
        if (data.features) {
          const fetched: LocalAsset[] = data.features.map((f: any) => ({
            id: f.properties.id,
            ward_id: f.properties.ward_id,
            asset_type: f.properties.asset_type,
            name: f.properties.name,
            status: f.properties.status,
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
            attributes: f.properties.attributes || {},
            version_id: f.properties.version_id || 1,
            sync_state: 'submitted' as const,
          }));
          spatialIndex.setAssets(fetched);
          setAssets(fetched);
        }
      }

      if (issueRes.ok) {
        const data = await issueRes.json();
        if (data.features) {
          const fetched: LocalIssue[] = data.features.map((f: any) => ({
            id: f.properties.id,
            ward_id: f.properties.ward_id,
            category: f.properties.category,
            severity: f.properties.severity,
            description: f.properties.description,
            photo_url: f.properties.photo_url,
            status: f.properties.status,
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
            version_id: f.properties.version_id || 1,
            client_seq_num: f.properties.client_seq_num || Date.now(),
            date_reported: f.properties.date_reported || new Date().toISOString(),
            sync_state: 'submitted' as const,
          }));
          spatialIndex.setIssues(fetched);
          setIssues(fetched);
        }
      }
    } catch {
      // Safe fallback
    }
  }, [API_BASE]);

  // 2. Initialize Leaflet Map with Canvas renderer & High-Performance Cluster Group
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const defaultLat = 28.6139;
    const defaultLng = 77.2090;

    const map = L.map(mapRef.current, {
      preferCanvas: true, // Canvas Renderer for zero SVG DOM jank
      center: [defaultLat, defaultLng],
      zoom: 15,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const markerClusterFactory = L as unknown as { markerClusterGroup: (opts: object) => L.LayerGroup };
    const clusterGroup = markerClusterFactory.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
      chunkedLoading: true,            // Chunked async loading for 10,000+ features
      chunkInterval: 100,              // Process 100ms chunks
      chunkDelay: 50,                  // 50ms pause between chunks to keep UI responsive
      removeOutsideVisibleBounds: true,// Unload off-screen markers automatically
    });
    map.addLayer(clusterGroup);
    markersLayerRef.current = clusterGroup;
    leafletMap.current = map;

    // Interactive Map Click: Drop pin at exact cursor location with quick 'Report Issue' action
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setCurrentCoords({ lat, lng });

      if (clickTargetMarkerRef.current) {
        clickTargetMarkerRef.current.remove();
      }

      const targetIcon = L.divIcon({
        className: 'map-target-pin-wrap',
        html: `
          <div class="map-dropped-pin">
            <div class="map-dropped-pin-ring"></div>
            <div class="map-dropped-pin-icon">📍</div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([lat, lng], {
        icon: targetIcon,
        zIndexOffset: 1500,
      }).addTo(map);

      clickTargetMarkerRef.current = marker;

      const popupHtml = `
        <div class="map-click-popup">
          <div class="map-popup-header">
            <span class="map-popup-title">📍 Selected Location</span>
          </div>
          <div class="map-popup-coords tabular-nums">${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E</div>
          <div class="map-popup-meta">${wardLabel}</div>
          <button type="button" id="btn-popup-report-action" class="map-popup-btn">
            🚨 Report Issue Here
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: true,
        offset: [0, -28],
        className: 'custom-map-popup',
      }).openPopup();

      marker.on('popupopen', () => {
        const btn = document.getElementById('btn-popup-report-action');
        if (btn) {
          btn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (onReportIssueAtLocation) {
              onReportIssueAtLocation(lat, lng);
            }
          };
        }
      });
    });

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('moveend', () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const center = map.getCenter();
        setCurrentCoords({ lat: center.lat, lng: center.lng });
        fetchViewportBboxData();
      }, 150);
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
      if (moveTimer) clearTimeout(moveTimer);
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);

      // Clean up Leaflet markers & layers to prevent memory leaks
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.remove();
        userAccuracyCircleRef.current = null;
      }
      if (clickTargetMarkerRef.current) {
        clickTargetMarkerRef.current.remove();
        clickTargetMarkerRef.current = null;
      }
      if (markersLayerRef.current) {
        markersLayerRef.current.clearLayers();
        markersLayerRef.current = null;
      }
      if (hotspotLayerRef.current) {
        hotspotLayerRef.current.clearLayers();
        hotspotLayerRef.current = null;
      }
      map.remove();
      leafletMap.current = null;
    };
  }, [fetchViewportBboxData]);

  // 3. Render Markers using RBush Spatial Index Range Query for Viewport Culling
  useEffect(() => {
    const map = leafletMap.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    const addedMarkers: L.Marker[] = [];

    // Perform O(log N) RBush spatial index search for current viewport bounds
    const bounds = map.getBounds();
    const bbox = {
      minLng: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLng: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };

    const visibleAssets = spatialIndex.searchAssets(bbox);
    const visibleIssues = spatialIndex.searchIssues(bbox);

    // After initial bounds fit, render only features in viewport. Initial mount falls back to all assets.
    const assetsToRender = hasFittedBoundsRef.current ? visibleAssets : (visibleAssets.length > 0 ? visibleAssets : assets);
    const issuesToRender = hasFittedBoundsRef.current ? visibleIssues : (visibleIssues.length > 0 ? visibleIssues : issues);

    // Render Village Assets
    assetsToRender.forEach((asset) => {
      if (activeFilter !== 'all' && activeFilter !== 'assets') return;
      const svgKey = asset.asset_type === 'handpump' ? 'water' : asset.asset_type === 'school' ? 'education' : asset.asset_type === 'streetlight' ? 'lighting' : 'building';
      const pinClass = asset.asset_type === 'handpump' ? 'pin-water' : asset.asset_type === 'school' ? 'pin-education' : asset.asset_type === 'streetlight' ? 'pin-lighting' : 'pin-sanitation';

      const marker = L.marker([asset.latitude, asset.longitude], {
        icon: getCachedIcon(svgKey, pinClass),
      });

      marker.on('click', () => {
        setSelectedItem({
          title: asset.name || asset.asset_type.toUpperCase(),
          type: `Asset • ${asset.asset_type.replace('_', ' ')}`,
          details: `Status: ${asset.status.replace('_', ' ').toUpperCase()}`,
          status: asset.status,
          lat: asset.latitude,
          lng: asset.longitude,
        });
      });

      marker.bindTooltip(
        `
        <div class="custom-marker-tooltip">
          <div class="tooltip-badge asset-badge">${asset.asset_type.replace('_', ' ').toUpperCase()}</div>
          <strong class="tooltip-title">${asset.name || asset.asset_type}</strong>
          <div class="tooltip-coords tabular-nums">📍 ${asset.latitude.toFixed(5)}°N, ${asset.longitude.toFixed(5)}°E</div>
          <div class="tooltip-action-prompt">Click to view or report issue →</div>
        </div>
        `,
        { direction: 'top', offset: [0, -16], opacity: 0.98, className: 'custom-marker-tooltip' }
      );
      addedMarkers.push(marker);
    });

    // Render Issues / Grievances
    issuesToRender.forEach((issue) => {
      if (activeFilter !== 'all' && activeFilter !== 'issues') return;

      const marker = L.marker([issue.latitude, issue.longitude], {
        icon: getCachedIcon('issue', 'pin-issue'),
      });

      marker.on('click', () => {
        setSelectedItem({
          title: `${issue.category} Issue`,
          type: `Grievance (${issue.severity.toUpperCase()})`,
          details: issue.description || 'No description provided.',
          status: issue.status,
          lat: issue.latitude,
          lng: issue.longitude,
        });
      });

      marker.bindTooltip(
        `
        <div class="custom-marker-tooltip">
          <div class="tooltip-badge issue-badge">${issue.severity.toUpperCase()}</div>
          <strong class="tooltip-title">${issue.category} Issue</strong>
          <div class="tooltip-coords tabular-nums">📍 ${issue.latitude.toFixed(5)}°N, ${issue.longitude.toFixed(5)}°E</div>
          <div class="tooltip-action-prompt">Click to inspect grievance →</div>
        </div>
        `,
        { direction: 'top', offset: [0, -16], opacity: 0.98, className: 'custom-marker-tooltip' }
      );
      addedMarkers.push(marker);
    });

    // High performance bulk add in a single spatial pass
    if (addedMarkers.length > 0) {
      const clusterWithBulk = markersLayer as unknown as { addLayers?: (markers: L.Marker[]) => void };
      if (typeof clusterWithBulk.addLayers === 'function') {
        clusterWithBulk.addLayers(addedMarkers);
      } else {
        addedMarkers.forEach((m) => markersLayer.addLayer(m));
      }
    }

    map.invalidateSize();
    if (!hasFittedBoundsRef.current && addedMarkers.length > 0) {
      hasFittedBoundsRef.current = true;
      try {
        const featureGroup = L.featureGroup(addedMarkers);
        map.fitBounds(featureGroup.getBounds().pad(0.12), { maxZoom: 16 });
      } catch {
        // Safe fallback
      }
    }
  }, [assets, issues, activeFilter]);

  // 4. Google Maps Authentic Live Blue Dot & Accuracy Ring
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !isLive || !Number.isFinite(userLat) || !Number.isFinite(userLng)) return;

    const userLatLng = L.latLng(userLat, userLng);
    setCurrentCoords({ lat: userLat, lng: userLng });

    const headingSvg = userHeading !== null && userHeading !== undefined
      ? `<svg class="gmaps-heading-beam" style="transform: rotate(${userHeading}deg);" viewBox="0 0 100 100"><path d="M50 50 L20 0 A55 55 0 0 1 80 0 Z" fill="url(#gmapsHeadingGrad)" opacity="0.5"/><defs><linearGradient id="gmapsHeadingGrad" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#1A73E8" stop-opacity="0.9"/><stop offset="100%" stop-color="#4285F4" stop-opacity="0"/></linearGradient></defs></svg>`
      : '';

    const gmapsBlueDotHtml = `
      <div class="gmaps-blue-dot-wrap">
        ${headingSvg}
        <div class="gmaps-blue-dot-pulse"></div>
        <div class="gmaps-blue-dot-core"></div>
      </div>
    `;

    const gmapsIcon = L.divIcon({
      className: 'gmaps-blue-dot-leaflet-icon',
      html: gmapsBlueDotHtml,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    // Create or update Google Maps Blue Dot Marker
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(userLatLng, {
        icon: gmapsIcon,
        zIndexOffset: 2000,
        interactive: false,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(userLatLng);
      userMarkerRef.current.setIcon(gmapsIcon);
    }

    // Create or update Google Maps Precision Accuracy Circle
    if (userAccuracy) {
      if (!userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current = L.circle(userLatLng, {
          radius: userAccuracy,
          color: '#1A73E8',
          fillColor: '#4285F4',
          fillOpacity: 0.14,
          weight: 1,
        }).addTo(map);
      } else {
        userAccuracyCircleRef.current.setLatLng(userLatLng);
        userAccuracyCircleRef.current.setRadius(userAccuracy);
      }
    }

    // Auto-center map over user's live blue dot on first fix or button press
    if (!hasAutoCenteredRef.current || shouldCenterOnUserRef.current) {
      hasAutoCenteredRef.current = true;
      shouldCenterOnUserRef.current = false;
      map.flyTo(userLatLng, 16, {
        animate: true,
        duration: 1.2,
      });
    }
  }, [userLat, userLng, userAccuracy, userHeading, isLive]);

  const handleLocateMe = () => {
    shouldCenterOnUserRef.current = true;
    locateMe();
    if (leafletMap.current && Number.isFinite(userLat) && Number.isFinite(userLng)) {
      leafletMap.current.flyTo([userLat, userLng], 16, {
        animate: true,
        duration: 1.2,
      });
    }
  };

  // Hotspot overlay: fetch from /api/analytics/hotspots and draw L.circle per cluster
  const fetchAndRenderHotspots = useCallback(async () => {
    const map = leafletMap.current;
    if (!map || !navigator.onLine) return;

    try {
      const res = await fetch(`${API_BASE}/analytics/hotspots?ward_id=${wardId}`);
      if (!res.ok) return;
      const data = await res.json();

      // Lazy-create a dedicated LayerGroup for hotspots
      if (!hotspotLayerRef.current) {
        hotspotLayerRef.current = L.layerGroup().addTo(map);
      }
      hotspotLayerRef.current.clearLayers();

      const SEVERITY_COLORS: Record<string, string> = {
        critical: '#ef4444',
        high:     '#f97316',
        medium:   '#eab308',
        low:      '#22c55e',
      };

      (data.features || []).forEach((f: any) => {
        const count   = f.properties?.count || 1;
        const severity = f.properties?.peak_severity || 'medium';
        const coords  = f.geometry?.coordinates;
        if (!coords) return;

        const circle = L.circle([coords[1], coords[0]], {
          radius:      Math.max(60, count * 40),   // min 60m, scale with issue density
          color:       SEVERITY_COLORS[severity] || '#eab308',
          fillColor:   SEVERITY_COLORS[severity] || '#eab308',
          fillOpacity: 0.25,
          weight:      2,
        });

        circle.bindTooltip(
          `<div class="custom-marker-tooltip">
            <div class="tooltip-badge issue-badge">${severity.toUpperCase()} HOTSPOT</div>
            <strong class="tooltip-title">${count} Active Issue${count > 1 ? 's' : ''}</strong>
            <div class="tooltip-action-prompt">Complaint density cluster</div>
          </div>`,
          { direction: 'top', opacity: 0.98, className: 'custom-marker-tooltip' }
        );

        hotspotLayerRef.current!.addLayer(circle);
      });
    } catch {
      // Offline or API unavailable — silently skip
    }
  }, [API_BASE]);

  // Toggle hotspot layer visibility
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (showHotspots) {
      fetchAndRenderHotspots();
    } else if (hotspotLayerRef.current) {
      hotspotLayerRef.current.clearLayers();
    }
  }, [showHotspots, fetchAndRenderHotspots]);

  // Preload Map Tiles for Ward Offline Usage
  const handlePreloadTiles = async () => {
    if (isPreloadingTiles) return;
    const map = leafletMap.current;
    if (!map) return;

    setIsPreloadingTiles(true);
    setPreloadProgress({ total: 0, completed: 0, failed: 0, percent: 0 });

    const bounds = map.getBounds();
    const wardBounds = {
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast(),
    };

    try {
      await preloadMapTiles(wardBounds, 13, 16, (prog) => {
        setPreloadProgress(prog);
      });
    } catch (err) {
      console.error('Failed to preload map tiles:', err);
    } finally {
      setTimeout(() => {
        setIsPreloadingTiles(false);
        setPreloadProgress(null);
      }, 1500);
    }
  };

  return (
    <div className="map-view-container" role="region" aria-label="GIS Interactive Map">
      {/* Floating GPS Target Button */}
      <button
        type="button"
        className={`btn-locate-me ${isLive ? 'active' : ''}`}
        onClick={handleLocateMe}
        title="Locate My Live Position"
        aria-label="Locate My Live Position"
      >
        <IconGpsTarget size={22} />
      </button>

      {/* Loading Skeleton */}
      {isDataLoading && (
        <div className="map-loading-skeleton">
          <span className="map-loading-text">Loading Ward Map Data…</span>
        </div>
      )}

      {/* Floating HUD Telemetry & Filter Bar */}
      <div className="map-hud-overlay">
        <div className="hud-telemetry-pill">
          <span className="hud-gps-tag">
            <span className="hud-gps-dot" />
            GPS {userAccuracy !== null && userAccuracy !== undefined ? `±${userAccuracy}m` : 'EXACT'}
          </span>
          <span className="tabular-nums">{currentCoords.lat.toFixed(6)}°N, {currentCoords.lng.toFixed(6)}°E</span>

          <button
            type="button"
            className="filter-chip active"
            onClick={handlePreloadTiles}
            disabled={isPreloadingTiles}
            style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px' }}
          >
            {isPreloadingTiles ? `Caching ${preloadProgress?.percent || 0}%` : '📥 Offline Map'}
          </button>
        </div>

        <div className="map-filter-chips" role="toolbar" aria-label="Map filters">
          <button 
            type="button"
            className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
            aria-label="Show all items"
          >
            All ({assets.length + issues.length})
          </button>
          <button 
            type="button"
            className={`filter-chip ${activeFilter === 'issues' ? 'active' : ''}`}
            onClick={() => setActiveFilter('issues')}
            aria-label="Show issues only"
          >
            Issues ({issues.length})
          </button>
          <button 
            type="button"
            className={`filter-chip ${activeFilter === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveFilter('assets')}
            aria-label="Show assets only"
          >
            Assets ({assets.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${showHotspots ? 'active' : ''}`}
            onClick={() => setShowHotspots(prev => !prev)}
            aria-label="Toggle complaint density hotspot overlay"
            title={navigator.onLine ? 'Toggle hotspot overlay' : 'Hotspots require network'}
          >
            🔥 Hotspots
          </button>
        </div>
      </div>

      {/* Leaflet Map Div */}
      <div ref={mapRef} className="leaflet-map-div" />

      {/* Primary Action Button */}
      {onReportIssueAtLocation && (
        <div className="map-cta-bar">
          <button 
            type="button"
            className="btn-primary-action"
            onClick={() => onReportIssueAtLocation(currentCoords.lat, currentCoords.lng)}
            aria-label="Report issue at map center coordinates"
          >
            <IconPlus size={18} />
            <span>Report Issue at this Location</span>
          </button>
        </div>
      )}

      {/* Bottom Sheet Modal for Item Details */}
      <BottomSheet
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.title || 'Details'}
      >
        {selectedItem && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span className={`status-badge ${selectedItem.status === 'active' || selectedItem.status === 'resolved' ? 'submitted' : 'urgent'}`}>
                {selectedItem.status.toUpperCase()}
              </span>
              {selectedItem.lat !== undefined && selectedItem.lng !== undefined && (
                <span className="sheet-coords-badge tabular-nums">
                  📍 {selectedItem.lat.toFixed(5)}°N, {selectedItem.lng.toFixed(5)}°E
                </span>
              )}
            </div>
            <p className="sheet-item-type">{selectedItem.type}</p>
            <p className="sheet-item-details">{selectedItem.details}</p>

            {onReportIssueAtLocation && selectedItem.lat !== undefined && selectedItem.lng !== undefined && (
              <button
                type="button"
                className="btn-primary-action"
                style={{ marginTop: '14px', width: '100%' }}
                onClick={() => {
                  const lat = selectedItem.lat!;
                  const lng = selectedItem.lng!;
                  setSelectedItem(null);
                  onReportIssueAtLocation(lat, lng);
                }}
              >
                <IconPlus size={18} />
                <span>Report Issue at this Location</span>
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
};