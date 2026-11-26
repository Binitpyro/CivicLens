import React, { useState, useEffect, useRef } from 'react';
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
  IconLogout,
  IconSliders,
  IconGlobe,
} from './CivicIcons';

interface HeaderProps {
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onLogout?: () => void;
  userName?: string;
  userRole?: string;
}

const LANG_OPTIONS = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'hi', short: 'हिं', label: 'हिन्दी' },
  { code: 'mr', short: 'म', label: 'मराठी' },
] as const;

export const Header: React.FC<HeaderProps> = ({
  theme = 'light',
  onToggleTheme,
  onLogout,
  userName,
  userRole,
}) => {
  const { t, i18n } = useTranslation();
  const { isOnline, outboxCount, isSyncing, coldStartNotice, triggerSync } = useOfflineSync();
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = (localStorage.getItem('civiclens-theme') as 'dark' | 'light') || theme;
      document.documentElement.setAttribute('data-theme', saved);
      return saved;
    }
    return theme;
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [syncHintOpen, setSyncHintOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  const isOfflineDemo =
    typeof window !== 'undefined' &&
    localStorage.getItem('civiclens_token') === 'offline-demo-token';

  useEffect(() => {
    if (!menuOpen && !syncHintOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmLogout(false);
        setSyncHintOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setConfirmLogout(false);
        setSyncHintOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, syncHintOpen]);

  useEffect(() => {
    if (!syncHintOpen) return;
    const timer = setTimeout(() => setSyncHintOpen(false), 3200);
    return () => clearTimeout(timer);
  }, [syncHintOpen]);

  const handleToggleTheme = () => {
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
    if (isOfflineDemo) return 'is-demo';
    return '';
  };

  const handleSyncPress = () => {
    if (isOfflineDemo || !isOnline) {
      setSyncHintOpen((prev) => !prev);
      setMenuOpen(false);
      return;
    }
    triggerSync();
    setSyncHintOpen(true);
  };

  const currentLangShort =
    LANG_OPTIONS.find((opt) => opt.code === i18n.language)?.short || 'EN';

  const syncAriaLabel = !isOnline
    ? t('header.offline')
    : isSyncing
      ? t('header.syncing')
      : outboxCount > 0
        ? t('header.savedCount', { count: outboxCount })
        : isOfflineDemo
          ? t('header.localDemo')
          : t('header.online');

  return (
    <header className="top-header" role="banner" ref={menuWrapRef}>
      <div className="header-brand">
        <div className="brand-icon-box" aria-hidden="true">
          <IconCivicLensLogo size={19} />
        </div>
        <div className="brand-title-wrap">
          <div className="brand-title">{t('appName')}</div>
          <span className="brand-subtitle">{t('header.wardSubtitle')}</span>
        </div>
      </div>

      <div className="header-actions">
        <button
          type="button"
          className={`sync-status-chip ${getSyncChipClass()}`}
          onClick={handleSyncPress}
          title={syncAriaLabel}
          aria-label={syncAriaLabel}
        >
          {!isOnline ? (
            <>
              <IconAlertTriangle size={12} />
              <span>{t('header.offline')}</span>
            </>
          ) : isSyncing ? (
            <>
              <IconSync size={12} className="is-spinning" />
              <span>{t('header.syncing')}</span>
            </>
          ) : outboxCount > 0 ? (
            <>
              <IconSync size={12} />
              <span className="tabular-nums">{t('header.savedCount', { count: outboxCount })}</span>
            </>
          ) : isOfflineDemo ? (
            <>
              <span className="sync-demo-dot" aria-hidden="true" />
              <span>{t('header.localDemo')}</span>
            </>
          ) : (
            <>
              <IconCheck size={12} />
              <span>{t('header.online')}</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="header-icon-btn"
          onClick={handleToggleTheme}
          title={currentTheme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
          aria-label={currentTheme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
        >
          {currentTheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>

        <button
          type="button"
          className={`header-menu-btn ${menuOpen ? 'is-open' : ''}`}
          onClick={() => {
            setMenuOpen((prev) => !prev);
            setConfirmLogout(false);
            setSyncHintOpen(false);
          }}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          aria-label={t('header.menuLabel')}
        >
          <span className="header-lang-code">{currentLangShort}</span>
          <IconSliders size={15} />
        </button>
      </div>

      {syncHintOpen && (
        <div className="header-sync-toast" role="status" aria-live="polite">
          <span>
            {isOfflineDemo
              ? t('header.syncInfoDemo')
              : !isOnline
                ? t('header.syncInfoOffline')
                : t('header.syncInfoOnline')}
          </span>
        </div>
      )}

      {menuOpen && (
        <div
          className="header-popover"
          role="dialog"
          aria-label={t('header.menuLabel')}
        >
          {userName && (
            <div className="header-popover-profile">
              <div className="header-popover-meta">{t('header.signedInAs')}</div>
              <div className="header-popover-user">
                <span className="header-popover-username">{userName}</span>
                {userRole && (
                  <span className="status-badge info">
                    {isOfflineDemo ? t('header.localDemo') : userRole}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="header-popover-section">
            <div className="header-popover-label">
              <IconGlobe size={13} />
              <span>{t('header.language')}</span>
            </div>
            <div className="header-lang-grid" role="group" aria-label={t('header.language')}>
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  className={`header-lang-option ${i18n.language === opt.code ? 'active' : ''}`}
                  onClick={() => changeLanguage(opt.code)}
                  aria-pressed={i18n.language === opt.code}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="header-popover-section">
            <div className="header-popover-label">{t('header.appearance')}</div>
            <div className="header-theme-grid">
              <button
                type="button"
                className={`header-lang-option ${currentTheme === 'light' ? 'active' : ''}`}
                onClick={() => currentTheme !== 'light' && handleToggleTheme()}
              >
                <IconSun size={14} />
                <span>{t('header.lightMode')}</span>
              </button>
              <button
                type="button"
                className={`header-lang-option ${currentTheme === 'dark' ? 'active' : ''}`}
                onClick={() => currentTheme !== 'dark' && handleToggleTheme()}
              >
                <IconMoon size={14} />
                <span>{t('header.darkMode')}</span>
              </button>
            </div>
          </div>

          {onLogout && (
            <div className="header-popover-footer">
              {!confirmLogout ? (
                <button
                  type="button"
                  className="btn-secondary header-logout-btn"
                  onClick={() => setConfirmLogout(true)}
                >
                  <IconLogout size={16} />
                  <span>{t('auth.logout')}</span>
                </button>
              ) : (
                <div className="header-logout-confirm">
                  {outboxCount > 0 && (
                    <p className="header-logout-warn tabular-nums">
                      {t('header.logoutPendingWarn', { count: outboxCount })}
                    </p>
                  )}
                  <div className="header-logout-confirm-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setConfirmLogout(false)}
                    >
                      {t('header.cancel')}
                    </button>
                    <button
                      type="button"
                      className="btn-danger-action"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmLogout(false);
                        onLogout();
                      }}
                    >
                      <IconLogout size={15} />
                      <span>{t('auth.logout')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {coldStartNotice && (
        <div className="cold-start-banner" role="alert" aria-live="polite">
          <IconSync size={14} />
          <span>{t('status.coldStart')}</span>
        </div>
      )}
    </header>
  );
};
