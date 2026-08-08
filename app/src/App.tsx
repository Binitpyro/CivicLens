import { useState } from 'react';
import './i18n';
import './App.css';
import { Header } from './components/Header';
import { BottomNav, type TabType } from './components/BottomNav';
import { StoragePersistModal } from './components/StoragePersistModal';
import { MapView } from './views/MapView';
import { ReportIssueForm } from './views/ReportIssueForm';
import { MyReportsView } from './views/MyReportsView';
import { VolunteerQuickAdd } from './views/VolunteerQuickAdd';
import { AdminDashboard } from './views/AdminDashboard';
import { ReportPrintView } from './views/ReportPrintView';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [isPrintView, setIsPrintView] = useState<boolean>(false);

  if (isPrintView) {
    return <ReportPrintView onBack={() => setIsPrintView(false)} />;
  }

  return (
    <div className="app-mobile-shell">
      {/* Storage Persistence Prompt Modal */}
      <StoragePersistModal />

      {/* Top Mobile Header */}
      <Header />

      {/* Main View Area */}
      <main className="main-content-viewport">
        {activeTab === 'map' && (
          <MapView 
            onReportIssueAtLocation={() => setActiveTab('report')} 
          />
        )}

        {activeTab === 'report' && (
          <ReportIssueForm 
            onSuccess={() => setActiveTab('myReports')} 
          />
        )}

        {activeTab === 'myReports' && <MyReportsView />}

        {activeTab === 'quickAdd' && <VolunteerQuickAdd />}

        {activeTab === 'admin' && (
          <AdminDashboard 
            onOpenPrintView={() => setIsPrintView(true)} 
          />
        )}
      </main>

      {/* Mobile Bottom Thumb Zone Navigation */}
      <BottomNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
      />
    </div>
  );
}

export default App;
