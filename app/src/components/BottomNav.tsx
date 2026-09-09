import React from 'react';
import { useTranslation } from 'react-i18next';
import { 
  IconMap, 
  IconPlus, 
  IconClipboard, 
  IconRapid, 
  IconBarChart 
} from './CivicIcons';

export type TabType = 'map' | 'report' | 'myReports' | 'quickAdd' | 'admin';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav-dock" role="navigation" aria-label="Main Navigation">
      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => setActiveTab('map')}
        aria-label={t('nav.map')}
        aria-current={activeTab === 'map' ? 'page' : undefined}
      >
        <span className="tab-icon" aria-hidden="true">
          <IconMap size={20} />
        </span>
        <span className="tab-label">{t('nav.map')}</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
        onClick={() => setActiveTab('report')}
        aria-label={t('nav.report')}
        aria-current={activeTab === 'report' ? 'page' : undefined}
      >
        <span className="tab-icon" aria-hidden="true">
          <IconPlus size={20} />
        </span>
        <span className="tab-label">{t('nav.report')}</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'myReports' ? 'active' : ''}`}
        onClick={() => setActiveTab('myReports')}
        aria-label={t('nav.myReports')}
        aria-current={activeTab === 'myReports' ? 'page' : undefined}
      >
        <span className="tab-icon" aria-hidden="true">
          <IconClipboard size={20} />
        </span>
        <span className="tab-label">{t('nav.myReports')}</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'quickAdd' ? 'active' : ''}`}
        onClick={() => setActiveTab('quickAdd')}
        aria-label={t('nav.quickAdd')}
        aria-current={activeTab === 'quickAdd' ? 'page' : undefined}
      >
        <span className="tab-icon" aria-hidden="true">
          <IconRapid size={20} />
        </span>
        <span className="tab-label">{t('nav.quickAdd')}</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
        onClick={() => setActiveTab('admin')}
        aria-label={t('nav.analytics')}
        aria-current={activeTab === 'admin' ? 'page' : undefined}
      >
        <span className="tab-icon" aria-hidden="true">
          <IconBarChart size={20} />
        </span>
        <span className="tab-label">{t('nav.analytics')}</span>
      </button>
    </nav>
  );
};
