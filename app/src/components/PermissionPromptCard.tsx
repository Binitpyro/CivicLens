import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCamera, IconCrosshair, IconSync } from './CivicIcons';

export interface PermissionPromptCardProps {
  kind: 'location' | 'camera';
  permissionState: string;
  onRetry: () => void;
  message?: string;
}

export const PermissionPromptCard: React.FC<PermissionPromptCardProps> = ({
  kind,
  permissionState,
  onRetry,
  message,
}) => {
  const { t } = useTranslation();
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);

  const isLocation = kind === 'location';
  const isGpsDisabled = permissionState === 'gps_disabled';
  const isUnsupported = permissionState === 'unsupported';

  const defaultTitle = isLocation
    ? isGpsDisabled
      ? t('permissions.gpsDisabledTitle', 'Device GPS Is Turned Off')
      : isUnsupported
        ? t('permissions.locationUnsupportedTitle', 'Location Unavailable')
        : t('permissions.locationDeniedTitle', 'Location Permission Required')
    : t('permissions.cameraDeniedTitle', 'Camera Permission Required');

  const defaultBody = isLocation
    ? isGpsDisabled
      ? t(
          'permissions.gpsDisabledBody',
          'CivicLens needs GPS turned on to accurately geotag village infrastructure and map issues.'
        )
      : isUnsupported
        ? t(
            'permissions.locationUnsupportedBody',
            'Your browser does not support live GPS. You can still place a manual pin on the map.'
          )
        : t(
            'permissions.locationDeniedBody',
            'Allow Precise Location so CivicLens can lock onto your coordinates for field verification.'
          )
    : t(
        'permissions.cameraDeniedBody',
        'CivicLens requires live camera access to capture on-site evidence photos (gallery uploads are disabled).'
      );

  const isNative = Capacitor.isNativePlatform();
  const settingsInstructions = isNative
    ? isLocation && isGpsDisabled
      ? t(
          'permissions.androidGpsSettingsSteps',
          'Open Android Settings > Location and switch Location ON (High Accuracy), then tap Retry Permission.'
        )
      : t(
          'permissions.androidAppSettingsSteps',
          `Open Android Settings > Apps > CivicLens > Permissions > ${isLocation ? 'Location (Allow while using app + Precise)' : 'Camera (Allow only while using app)'}.`
        )
    : t(
        'permissions.webSettingsSteps',
        `Click the lock/site-settings icon next to the address bar and set ${isLocation ? 'Location' : 'Camera'} permission to Allow, then tap Retry Permission.`
      );

  const handleOpenSettings = () => {
    setShowSettingsHelp((prev) => !prev);
  };

  return (
    <div
      className="permission-prompt-card"
      role="alert"
      aria-live="polite"
      data-kind={kind}
      data-permission-state={permissionState}
    >
      <div className="permission-prompt-card__header">
        <span className="permission-prompt-card__icon" aria-hidden="true">
          {isGpsDisabled || isUnsupported ? (
            <IconAlertTriangle size={18} />
          ) : isLocation ? (
            <IconCrosshair size={18} />
          ) : (
            <IconCamera size={18} />
          )}
        </span>
        <div className="permission-prompt-card__copy">
          <h4 className="permission-prompt-card__title">{defaultTitle}</h4>
          <p className="permission-prompt-card__message">{message || defaultBody}</p>
        </div>
      </div>

      {showSettingsHelp && (
        <div className="permission-prompt-card__steps" role="note">
          {settingsInstructions}
        </div>
      )}

      <div className="permission-prompt-card__actions">
        {!isUnsupported && (
          <button
            type="button"
            className="btn-primary-action permission-prompt-card__retry"
            onClick={onRetry}
          >
            <IconSync size={14} />
            <span>{t('permissions.retryBtn', 'Retry Permission')}</span>
          </button>
        )}
        <button
          type="button"
          className="btn-secondary permission-prompt-card__settings"
          onClick={handleOpenSettings}
          aria-expanded={showSettingsHelp}
        >
          {t('permissions.openSettingsBtn', 'Open App Settings')}
        </button>
      </div>
    </div>
  );
};
