import { useState, lazy, Suspense } from 'react';
import './i18n';
import './App.css';
import { Header } from './components/Header';
import { BottomNav, type TabType } from './components/BottomNav';
import { StoragePersistModal } from './components/StoragePersistModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GeolocationProvider } from './hooks/useGeolocation';
import type { UserProfile } from './services/apiService';

// Code-split heavy view components for fast initial load
const MapView = lazy(() => import('./views/MapView').then(m => ({ default: m.MapView })));
const ReportIssueForm = lazy(() => import('./views/ReportIssueForm').then(m => ({ default: m.ReportIssueForm })));
const MyReportsView = lazy(() => import('./views/MyReportsView').then(m => ({ default: m.MyReportsView })));
const VolunteerQuickAdd = lazy(() => import('./views/VolunteerQuickAdd').then(m => ({ default: m.VolunteerQuickAdd })));
const AdminDashboard = lazy(() => import('./views/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ReportPrintView = lazy(() => import('./views/ReportPrintView').then(m => ({ default: m.ReportPrintView })));
const AuthScreen = lazy(() => import('./views/AuthScreen').then(m => ({ default: m.AuthScreen })));

function ViewLoadingFallback() {
  return (
    <div className="view-loading">
      <div className="spinner" />
      <span className="view-loading-text">Loading…</span>
    </div>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [isPrintView, setIsPrintView] = useState<boolean>(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [quickAddAssetType, setQuickAddAssetType] = useState<string | null>(null);
  const [pinPickTarget, setPinPickTarget] = useState<'report' | 'quickAdd' | null>(null);
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const token = localStorage.getItem('civiclens_token');
      const userData = localStorage.getItem('civiclens_user');
      if (token && userData) {
        return JSON.parse(userData);
      }
    } catch {
      // invalid user data
    }
    return null;
  });

  if (!user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ViewLoadingFallback />}>
          <AuthScreen onAuthSuccess={setUser} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (isPrintView) {
    return (
      <ErrorBoundary>
        <GeolocationProvider>
          <Suspense fallback={<ViewLoadingFallback />}>
            <ReportPrintView onBack={() => setIsPrintView(false)} />
          </Suspense>
        </GeolocationProvider>
      </ErrorBoundary>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('civiclens_token');
    localStorage.removeItem('civiclens_user');
    setUser(null);
  };

  const handleTabChange = (nextTab: TabType) => {
    setPinPickTarget(null);
    setActiveTab(nextTab);
  };

  return (
    <ErrorBoundary>
      <GeolocationProvider>
        <div className="app-mobile-shell">
          <StoragePersistModal />

          <Header
            onLogout={handleLogout}
            userName={user.name}
            userRole={user.role}
          />

          <main className={`main-content-viewport ${activeTab === 'map' ? 'is-map-active' : ''}`}>
            <Suspense fallback={<ViewLoadingFallback />}>
              {/* Keep MapView mounted so Leaflet map zoom, pan, and filter state are preserved */}
              <div className={`map-tab-pane ${activeTab === 'map' ? 'is-active' : 'is-hidden'}`}>
                <MapView
                  userRole={user.role}
                  pinPickTarget={pinPickTarget}
                  onCancelPinPick={() => setPinPickTarget(null)}
                  onPinPicked={(lat, lng) => {
                    const target = pinPickTarget;
                    setPinPickTarget(null);
                    setSelectedCoords({ lat, lng });
                    if (target === 'quickAdd') {
                      setActiveTab('quickAdd');
                    } else {
                      setQuickAddAssetType(null);
                      setActiveTab('report');
                    }
                  }}
                  onReportIssueAtLocation={(lat, lng) => {
                    setPinPickTarget(null);
                    setSelectedCoords({ lat, lng });
                    setQuickAddAssetType(null);
                    setActiveTab('report');
                  }}
                  onQuickAddAtLocation={(lat, lng, assetType) => {
                    setPinPickTarget(null);
                    setSelectedCoords({ lat, lng });
                    setQuickAddAssetType(assetType ?? null);
                    setActiveTab('quickAdd');
                  }}
                />
              </div>

              {activeTab === 'report' && (
                <ReportIssueForm
                  wardId={user.ward_id || 1}
                  initialCoords={selectedCoords}
                  onClearSelectedCoords={() => setSelectedCoords(null)}
                  onPickOnMap={() => {
                    setPinPickTarget('report');
                    setActiveTab('map');
                  }}
                  onSuccess={() => {
                    setSelectedCoords(null);
                    setQuickAddAssetType(null);
                    setActiveTab('myReports');
                  }}
                />
              )}

              {activeTab === 'myReports' && (
                <MyReportsView onStartReport={() => setActiveTab('report')} />
              )}

              {activeTab === 'quickAdd' && (
                <VolunteerQuickAdd
                  key={
                    selectedCoords
                      ? `${selectedCoords.lat.toFixed(6)},${selectedCoords.lng.toFixed(6)}:${quickAddAssetType ?? ''}`
                      : 'live-gps'
                  }
                  wardId={user.ward_id || 1}
                  initialCoords={selectedCoords}
                  initialAssetType={quickAddAssetType}
                  onClearSelectedCoords={() => setSelectedCoords(null)}
                  onPickOnMap={() => {
                    setPinPickTarget('quickAdd');
                    setActiveTab('map');
                  }}
                />
              )}

              {activeTab === 'admin' && (
                <AdminDashboard
                  onOpenPrintView={() => setIsPrintView(true)}
                />
              )}
            </Suspense>
          </main>

          <BottomNav
            activeTab={activeTab}
            setActiveTab={handleTabChange}
          />
        </div>
      </GeolocationProvider>
    </ErrorBoundary>
  );
}

export default App;
