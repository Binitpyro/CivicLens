import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, type LocalAsset, type LocalIssue } from '../db';
import { BottomSheet } from '../components/BottomSheet';

interface MapViewProps {
  onReportIssueAtLocation?: (lat: number, lng: number) => void;
}

export const MapView: React.FC<MapViewProps> = ({ onReportIssueAtLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);

  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [issues, setIssues] = useState<LocalIssue[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<{ title: string; type: string; details: string; status: string } | null>(null);

  // Load local items from Dexie IndexedDB
  useEffect(() => {
    async function loadData() {
      try {
        const localAssets = await db.assets.toArray();
        const localIssues = await db.issues.toArray();
        setAssets(localAssets);
        setIssues(localIssues);
      } catch (err) {
        console.error('Error loading map data from Dexie:', err);
      }
    }
    loadData();

    // Default mock data if empty
    db.assets.count().then(count => {
      if (count === 0) {
        db.assets.bulkAdd([
          { id: 'a1', ward_id: 1, asset_type: 'handpump', name: 'Main Chowk Handpump', status: 'active', latitude: 28.6139, longitude: 77.2090, attributes: {}, version_id: 1, sync_state: 'submitted' },
          { id: 'a2', ward_id: 1, asset_type: 'school', name: 'Primary School Ward 3', status: 'active', latitude: 28.6155, longitude: 77.2120, attributes: {}, version_id: 1, sync_state: 'submitted' },
          { id: 'a3', ward_id: 1, asset_type: 'streetlight', name: 'Temple St. Light', status: 'non_functional', latitude: 28.6145, longitude: 77.2102, attributes: {}, version_id: 1, sync_state: 'submitted' }
        ]);
        db.issues.bulkAdd([
          { id: 'i1', ward_id: 1, category: 'Water Supply', severity: 'high', description: 'Handpump handle broken', latitude: 28.6152, longitude: 77.2115, status: 'open', version_id: 1, client_seq_num: 1, date_reported: new Date().toISOString(), sync_state: 'submitted' },
          { id: 'i2', ward_id: 1, category: 'Drainage', severity: 'critical', description: 'Drain overflow near school', latitude: 28.6132, longitude: 77.2095, status: 'in_progress', version_id: 1, client_seq_num: 2, date_reported: new Date().toISOString(), sync_state: 'submitted' }
        ]);
      }
    });
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false, // Touch-first custom buttons
    }).setView([28.6139, 77.2090], 15);

    // OpenStreetMap tiles with custom user-agent policy compliance
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    leafletMap.current = map;

    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, []);

  // Render Markers on Map
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    // Clear existing markers
    map.eachLayer((layer: L.Layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Custom Icon generator
    const createCustomIcon = (emoji: string, color: string) => {
      return L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="background-color: ${color}; width: 36px; height: 36px; borderRadius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); border: 2px solid white;">${emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
    };

    // Render Assets
    assets.forEach((asset) => {
      if (activeFilter !== 'all' && activeFilter !== 'assets') return;
      const emoji = asset.asset_type === 'handpump' ? '🚰' : asset.asset_type === 'school' ? '🏫' : asset.asset_type === 'streetlight' ? '💡' : '🏛️';
      const color = asset.status === 'active' ? '#16a34a' : '#dc2626';

      const marker = L.marker([asset.latitude, asset.longitude], {
        icon: createCustomIcon(emoji, color),
      }).addTo(map);

      marker.on('click', () => {
        setSelectedItem({
          title: asset.name || asset.asset_type.toUpperCase(),
          type: `Asset: ${asset.asset_type}`,
          details: `Status: ${asset.status.replace('_', ' ').toUpperCase()}`,
          status: asset.status,
        });
      });
    });

    // Render Issues
    issues.forEach((issue) => {
      if (activeFilter !== 'all' && activeFilter !== 'issues') return;
      const emoji = issue.severity === 'critical' ? '🚨' : issue.severity === 'high' ? '⚠️' : '🔧';
      const color = issue.status === 'open' ? '#ea580c' : issue.status === 'in_progress' ? '#2563eb' : '#16a34a';

      const marker = L.marker([issue.latitude, issue.longitude], {
        icon: createCustomIcon(emoji, color),
      }).addTo(map);

      marker.on('click', () => {
        setSelectedItem({
          title: `${issue.category} Issue`,
          type: `Grievance (${issue.severity.toUpperCase()})`,
          details: issue.description || 'No description provided.',
          status: issue.status,
        });
      });
    });
  }, [assets, issues, activeFilter]);

  return (
    <div className="map-view-container">
      {/* Offline Tile Fallback Banner */}
      {!navigator.onLine && (
        <div className="offline-map-banner">
          📶 Offline Mode — Exact map tiles cached from memory. Location pins saved locally.
        </div>
      )}

      {/* Touch-First Category Filters */}
      <div className="map-filter-bar">
        <button 
          className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All Items ({assets.length + issues.length})
        </button>
        <button 
          className={`filter-chip ${activeFilter === 'issues' ? 'active' : ''}`}
          onClick={() => setActiveFilter('issues')}
        >
          🚨 Issues ({issues.length})
        </button>
        <button 
          className={`filter-chip ${activeFilter === 'assets' ? 'active' : ''}`}
          onClick={() => setActiveFilter('assets')}
        >
          🏛️ Assets ({assets.length})
        </button>
      </div>

      {/* Leaflet Map Div */}
      <div ref={mapRef} className="leaflet-map-div" />

      {/* Floating CTA in Thumb Zone */}
      {onReportIssueAtLocation && (
        <button 
          className="floating-thumb-cta"
          onClick={() => onReportIssueAtLocation(28.6139, 77.2090)}
        >
          ➕ Report Issue Here
        </button>
      )}

      {/* Bottom Sheet Modal for Item Details */}
      <BottomSheet
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.title || 'Details'}
      >
        {selectedItem && (
          <div className="item-detail-sheet">
            <span className={`status-pill pill-${selectedItem.status}`}>
              {selectedItem.status.toUpperCase()}
            </span>
            <p className="item-type-label">{selectedItem.type}</p>
            <p className="item-description">{selectedItem.details}</p>
          </div>
        )}
      </BottomSheet>
    </div>
  );
};
