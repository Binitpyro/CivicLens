import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { setAppLanguage } from '../i18n';
import { 
  IconCivicLensLogo, 
  IconSync, 
  IconCheck, 
  IconAlertTriangle, 
  IconSun, 
  IconMoon, 
  IconLogout 
} from './CivicIcons';

interface HeaderProps {
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ theme = 'light', onToggleTheme, onLogout }) => {
  const { t, i18n } = useTranslation();
  const { isOnline, outboxCount, isSyncing, coldStartNotice, triggerSync } = useOfflineSync();
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('civiclens-theme') as 'dark' | 'light') || theme;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  const handleToggle = () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(next);
    localStorage.setItem('civiclens-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    if (onToggleTheme) onToggleTheme();
  };

  const changeLanguage = (lng: string) => {
    setAppLanguage(lng);
  };

  const getSyncChipClass = () => {
    if (!isOnline) return 'is-offline';
    if (isSyncing) return 'is-syncing';
    if (outboxCount > 0) return 'has-pending';
    return '';
  };

  return (
    <header className="top-header" role="banner">
      <div className="header-brand">
        <div className="brand-icon-box" aria-hidden="true">
          <IconCivicLensLogo size={20} />
        </div>
        <div className="brand-title-wrap">
          <div className="brand-title">
            <span>{t('appName')}</span>
          </div>
          <span className="brand-subtitle">WARD 3 · KALYANPUR GP</span>
        </div>
      </div>

      <div className="header-actions">
        {/* Sync Status Pill */}
        <button 
          className={`sync-status-chip ${getSyncChipClass()}`}
          onClick={triggerSync}
          title="Click to trigger sync"
          aria-label={`Sync Status: ${!isOnline ? 'Offline' : isSyncing ? 'Syncing' : outboxCount > 0 ? `${outboxCount} Queued` : 'Connected'}`}
        >
          {!isOnline ? (
            <>
              <IconAlertTriangle size={12} />
              <span>{t('status.offline')}</span>
            </>
          ) : isSyncing ? (
            <>
              <IconSync size={12} className="is-spinning" />
              <span>{t('status.syncing')}</span>
            </>
          ) : outboxCount > 0 ? (
            <>
              <IconSync size={12} />
              <span><span className="tabular-nums">{outboxCount}</span> {t('status.saved')}</span>
            </>
          ) : (
            <>
              <IconCheck size={12} />
              <span>{t('status.online')}</span>
            </>
          )}
        </button>

        {/* Language Selector */}
        <div className="lang-selector" role="group" aria-label="Language selection">
          <button 
            type="button"
            className={i18n.language === 'en' ? 'active' : ''}
            onClick={() => changeLanguage('en')}
            aria-label="English language"
          >
            EN
          </button>
          <button 
            type="button"
            className={i18n.language === 'hi' ? 'active' : ''}
            onClick={() => changeLanguage('hi')}
            aria-label="Hindi language"
          >
            HI
          </button>
          <button 
            type="button"
            className={i18n.language === 'mr' ? 'active' : ''}
            onClick={() => changeLanguage('mr')}
            aria-label="Marathi language"
          >
            MR
          </button>
        </div>

        {/* Theme Toggle Button */}
        <button 
          type="button"
          className="header-icon-btn"
          onClick={handleToggle}
          title={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
          aria-label={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {currentTheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        
        {/* Logout Button */}
        {onLogout && (
          <button
            type="button"
            className="header-icon-btn"
            onClick={onLogout}
            title={t('auth.logout')}
            aria-label={t('auth.logout')}
          >
            <IconLogout size={16} />
          </button>
        )}
      </div>

      {coldStartNotice && (
        <div className="cold-start-banner" role="alert" aria-live="polite">
          <IconSync size={14} />
          <span>{t('status.coldStart')}</span>
        </div>
      )}
    </header>
  );
};
