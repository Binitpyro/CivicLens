import React from 'react';
import { useTranslation } from 'react-i18next';

export type TabType = 'map' | 'report' | 'myReports' | 'quickAdd' | 'admin';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  userRole?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => setActiveTab('map')}
      >
        <span className="nav-icon">🗺️</span>
        <span className="nav-label">{t('nav.map')}</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'report' ? 'active' : ''}`}
        onClick={() => setActiveTab('report')}
      >
        <span className="nav-icon">➕</span>
        <span className="nav-label">{t('nav.report')}</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'myReports' ? 'active' : ''}`}
        onClick={() => setActiveTab('myReports')}
      >
        <span className="nav-icon">📋</span>
        <span className="nav-label">{t('nav.myReports')}</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'quickAdd' ? 'active' : ''}`}
        onClick={() => setActiveTab('quickAdd')}
      >
        <span className="nav-icon">⚡</span>
        <span className="nav-label">{t('nav.quickAdd')}</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
        onClick={() => setActiveTab('admin')}
      >
        <span className="nav-icon">📊</span>
        <span className="nav-label">{t('nav.analytics')}</span>
      </button>
    </nav>
  );
};
