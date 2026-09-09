import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginUser, registerUser, type UserProfile } from '../services/apiService';
import { setAppLanguage } from '../i18n';
import {
  IconCivicLensLogo,
  IconCheck
} from '../components/CivicIcons';

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const { t, i18n } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [serverOffline, setServerOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOfflineLogin = (customName?: string, customPhone?: string) => {
    const offlineUser: UserProfile = {
      id: Date.now(),
      name: (customName || name).trim() || 'Ward Volunteer',
      phone: (customPhone || phone).trim() || '9876543210',
      role: 'volunteer',
      ward_id: 1,
    };
    localStorage.setItem('civiclens_token', 'offline-demo-token');
    localStorage.setItem('civiclens_user', JSON.stringify(offlineUser));
    onAuthSuccess(offlineUser);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setServerOffline(false);
    setLoading(true);

    try {
      let res;
      if (isLogin) {
        res = await loginUser(phone, password);
      } else {
        res = await registerUser(name, phone, password);
      }

      localStorage.setItem('civiclens_token', res.token);
      localStorage.setItem('civiclens_user', JSON.stringify(res.user));
      onAuthSuccess(res.user);
    } catch (err: any) {
      const errMsg = err?.message || '';
      const isNetworkIssue =
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('Network') ||
        errMsg.includes('network') ||
        errMsg.includes('abort') ||
        errMsg.includes('timeout') ||
        errMsg.includes('404') ||
        errMsg.includes('500');

      if (isNetworkIssue) {
        setServerOffline(true);
      }
      setError(errMsg || t('auth.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-lang-bar">
        <div className="lang-selector" role="group" aria-label="Language selection">
          <button
            type="button"
            className={i18n.language === 'en' ? 'active' : ''}
            onClick={() => setAppLanguage('en')}
            aria-label="English language"
          >
            EN
          </button>
          <button
            type="button"
            className={i18n.language === 'hi' ? 'active' : ''}
            onClick={() => setAppLanguage('hi')}
            aria-label="Hindi language"
          >
            HI
          </button>
          <button
            type="button"
            className={i18n.language === 'mr' ? 'active' : ''}
            onClick={() => setAppLanguage('mr')}
            aria-label="Marathi language"
          >
            MR
          </button>
        </div>
      </div>

      <div className="auth-brand">
        <div className="brand-icon-box auth-brand-icon" aria-hidden="true">
          <IconCivicLensLogo size={28} />
        </div>
        <h1>CivicLens</h1>
        <p>{t('tagline')}</p>
      </div>

      <div className="auth-card">
        <h2>{isLogin ? t('auth.login') : t('auth.register')}</h2>

        {error && (
          <div className="auth-error" role="alert">
            <div>{error}</div>
            {serverOffline && (
              <div className="auth-error-offline">
                <p>{t('auth.serverUnreachable')}</p>
                <button
                  type="button"
                  onClick={() => handleOfflineLogin(name, phone)}
                  className="filter-chip active chip-block"
                >
                  <IconCheck size={14} />
                  <span>{t('auth.useOfflineNow')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-input-group">
              <label htmlFor="auth-name" className="form-label">{t('auth.name')}</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="form-input"
              />
            </div>
          )}

          <div className="form-input-group">
            <label htmlFor="auth-phone" className="form-label">{t('auth.phone')}</label>
            <input
              id="auth-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              className="form-input"
              placeholder="e.g. 9876543210"
            />
          </div>

          <div className="form-input-group">
            <label htmlFor="auth-password" className="form-label">{t('auth.password')}</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="form-input"
            />
          </div>

          <button
            type="submit"
            className="btn-primary-action"
            disabled={loading}
          >
            {loading ? 'Authenticating…' : (isLogin ? t('auth.loginBtn') : t('auth.registerBtn'))}
          </button>
        </form>

        <div className="auth-switch">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
        </div>

        <div className="auth-offline-block">
          <p>{t('auth.offlineNotice')}</p>
          <button
            type="button"
            onClick={() => handleOfflineLogin()}
            className="filter-chip chip-block"
          >
            <IconCheck size={14} color="var(--color-status-active)" />
            <span>{t('auth.offlineMode')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
