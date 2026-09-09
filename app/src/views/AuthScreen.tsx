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
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: 'var(--color-paper)',
      padding: 'var(--space-md)',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-body)'
    }}>
      {/* Top Language Toggle Bar */}
      <div style={{
        position: 'absolute',
        top: 'var(--space-md)',
        right: 'var(--space-md)',
        zIndex: 10
      }}>
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

      <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
        <div className="brand-icon-box" style={{ width: 48, height: 48, margin: '0 auto var(--space-xs) auto' }} aria-hidden="true">
          <IconCivicLensLogo size={28} />
        </div>
        <h1 style={{ color: 'var(--color-ink)', margin: 0, fontSize: 'var(--text-2xl)' }}>CivicLens</h1>
        <p style={{ color: 'var(--color-ink-2)', margin: '4px 0 0 0', fontSize: 'var(--text-sm)' }}>
          {t('tagline')}
        </p>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'var(--color-surface)',
        padding: 'var(--space-lg)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-rule)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <h2 style={{ color: 'var(--color-ink)', marginTop: 0, marginBottom: 'var(--space-md)', textAlign: 'center', fontSize: 'var(--text-lg)' }}>
          {isLogin ? t('auth.login') : t('auth.register')}
        </h2>

        {error && (
          <div style={{
            backgroundColor: 'var(--color-status-urgent-bg)',
            border: '1px solid var(--color-status-urgent)',
            color: 'var(--color-status-urgent)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 'var(--space-md)',
            fontSize: 'var(--text-xs)'
          }}>
            <div>{error}</div>
            {serverOffline && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--color-status-urgent)' }}>
                <p style={{ margin: '0 0 8px 0', color: 'var(--color-ink)', fontSize: '12px' }}>
                  {t('auth.serverUnreachable')}
                </p>
                <button
                  type="button"
                  onClick={() => handleOfflineLogin(name, phone)}
                  className="filter-chip active"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <IconCheck size={14} />
                  <span>{t('auth.useOfflineNow')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
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
            style={{ marginTop: 4 }}
          >
            {loading ? 'Authenticating…' : (isLogin ? t('auth.loginBtn') : t('auth.registerBtn'))}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-md)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              fontWeight: 600
            }}
          >
            {isLogin ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
        </div>

        {/* Offline Demo / Test Bypass */}
        <div style={{
          marginTop: 'var(--space-md)',
          paddingTop: 'var(--space-sm)',
          borderTop: '1px solid var(--color-rule)',
          textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--color-ink-muted)' }}>
            {t('auth.offlineNotice')}
          </p>
          <button
            type="button"
            onClick={() => handleOfflineLogin()}
            className="filter-chip"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '8px 12px',
              color: 'var(--color-ink)',
              fontWeight: 600
            }}
          >
            <IconCheck size={14} color="var(--color-status-active)" />
            <span>{t('auth.offlineMode')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
