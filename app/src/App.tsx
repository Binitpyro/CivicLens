import { useState, lazy, Suspense } from 'react';
import './i18n';
import './App.css';
import { Header } from './components/Header';
import { BottomNav, type TabType } from './components/BottomNav';
import { StoragePersistModal } from './components/StoragePersistModal';
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
      <Suspense fallback={<ViewLoadingFallback />}>
        <AuthScreen onAuthSuccess={setUser} />
      </Suspense>
    );
  }

  if (isPrintView) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <ReportPrintView onBack={() => setIsPrintView(false)} />
      </Suspense>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('civiclens_token');
    localStorage.removeItem('civiclens_user');
    setUser(null);
  };

  return (
    <div className="app-mobile-shell">
      <StoragePersistModal />

      <Header onLogout={handleLogout} />

      <main className="main-content-viewport">
        <Suspense fallback={<ViewLoadingFallback />}>
          {activeTab === 'map' && (
            <MapView
              onReportIssueAtLocation={(lat, lng) => {
                setSelectedCoords({ lat, lng });
                setActiveTab('report');
              }}
            />
          )}

          {activeTab === 'report' && (
            <ReportIssueForm
              initialCoords={selectedCoords}
              onSuccess={() => {
                setSelectedCoords(null);
                setActiveTab('myReports');
              }}
            />
          )}

          {activeTab === 'myReports' && <MyReportsView />}

          {activeTab === 'quickAdd' && <VolunteerQuickAdd />}

          {activeTab === 'admin' && (
            <AdminDashboard
              onOpenPrintView={() => setIsPrintView(true)}
            />
          )}
        </Suspense>
      </main>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}

export default App;
