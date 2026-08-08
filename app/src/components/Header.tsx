import React from 'react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '../hooks/useOfflineSync';

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isOnline, outboxCount, isSyncing, coldStartNotice, triggerSync } = useOfflineSync();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <header className="top-header">
      <div className="header-brand">
        <span className="brand-logo">🗺️</span>
        <div>
          <h1 className="brand-title">{t('appName')}</h1>
          <p className="brand-subtitle">Ward 3 • Shivpur GP</p>
        </div>
      </div>

      <div className="header-controls">
        {/* Native Script Language Switcher */}
        <div className="lang-switcher">
          <button 
            className={`lang-btn ${i18n.language === 'hi' ? 'active' : ''}`}
            onClick={() => changeLanguage('hi')}
          >
            हिंदी
          </button>
          <button 
            className={`lang-btn ${i18n.language === 'mr' ? 'active' : ''}`}
            onClick={() => changeLanguage('mr')}
          >
            मराठी
          </button>
          <button 
            className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
            onClick={() => changeLanguage('en')}
          >
            EN
          </button>
        </div>

        {/* 3-State Sync Badge / Offline Indicator */}
        <div className="sync-status-badge" onClick={triggerSync}>
          {!isOnline ? (
            <span className="badge badge-offline">🔴 {t('status.offline')}</span>
          ) : isSyncing ? (
            <span className="badge badge-syncing">🔵 {t('status.syncing')}</span>
          ) : outboxCount > 0 ? (
            <span className="badge badge-saved">🟡 {outboxCount} {t('status.saved')}</span>
          ) : (
            <span className="badge badge-submitted">🟢 {t('status.online')}</span>
          )}
        </div>
      </div>

      {/* Render Cold Start Notice Banner */}
      {coldStartNotice && (
        <div className="cold-start-banner">
          ⏳ {t('status.coldStart')}
        </div>
      )}
    </header>
  );
};
