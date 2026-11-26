import React, { useEffect, useMemo, useState } from 'react';
import { db, decryptPII, type LocalIssue } from '../db';
import { useTranslation } from 'react-i18next';
import {
  getCategoryIcon,
  IconClipboard,
  IconLock,
  IconPhotoCheck,
  IconCrosshair,
  IconMapPin,
  IconPlus,
} from '../components/CivicIcons';

interface IssueWithDecryptedPhone extends LocalIssue {
  decryptedPhone?: string;
}

type ReportFilter = 'all' | 'open' | 'resolved' | 'pending';

interface MyReportsViewProps {
  onStartReport?: () => void;
}

const decryptedPhoneCache = new Map<string, string>();

function getAccuracyTierClass(accuracy?: number | null): string {
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy)) {
    return 'gps-tier-none';
  }
  if (accuracy <= 15) return 'gps-tier-excellent';
  if (accuracy <= 50) return 'gps-tier-fair';
  return 'gps-tier-poor';
}

export const MyReportsView: React.FC<MyReportsViewProps> = ({ onStartReport }) => {
  const { t } = useTranslation();
  const [myIssues, setMyIssues] = useState<IssueWithDecryptedPhone[]>([]);
  const [filter, setFilter] = useState<ReportFilter>('all');

  useEffect(() => {
    let isMounted = true;
    let prevFingerprint = '';

    async function fetchMyIssues() {
      try {
        const issues = await db.issues.reverse().toArray();

        const currentFingerprint = issues
          .map(
            (i) =>
              `${i.id}:${i.sync_state}:${i.status}:${i.version_id}:${i.photos?.length || 0}:${i.resolution_photo_url ? '1' : '0'}:${i.gps_accuracy_m ?? ''}:${i.location_source || ''}`
          )
          .join('|');
        if (currentFingerprint === prevFingerprint) {
          return;
        }

        const augmented = await Promise.all(
          issues.map(async (iss) => {
            if (!iss.encrypted_phone) return iss;
            let dec = decryptedPhoneCache.get(iss.encrypted_phone);
            if (!dec) {
              dec = await decryptPII(iss.encrypted_phone);
              decryptedPhoneCache.set(iss.encrypted_phone, dec);
            }
            return { ...iss, decryptedPhone: dec };
          })
        );

        if (isMounted) {
          prevFingerprint = currentFingerprint;
          setMyIssues(augmented);
        }
      } catch (err) {
        console.error('Error fetching my reports:', err);
      }
    }

    fetchMyIssues();
    const interval = setInterval(fetchMyIssues, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const counts = useMemo(() => {
    const open = myIssues.filter((i) => i.status !== 'resolved').length;
    const resolved = myIssues.filter((i) => i.status === 'resolved').length;
    const pending = myIssues.filter((i) => i.sync_state !== 'submitted').length;
    return { all: myIssues.length, open, resolved, pending };
  }, [myIssues]);

  const filteredIssues = useMemo(() => {
    if (filter === 'open') return myIssues.filter((i) => i.status !== 'resolved');
    if (filter === 'resolved') return myIssues.filter((i) => i.status === 'resolved');
    if (filter === 'pending') return myIssues.filter((i) => i.sync_state !== 'submitted');
    return myIssues;
  }, [myIssues, filter]);

  return (
    <div className="reports-timeline-container" role="region" aria-label="My Reported Incidents">
      <div className="form-header-card">
        <h2 className="view-heading">
          {t('nav.myReportsFull')} <span className="tabular-nums">({myIssues.length})</span>
        </h2>
        <p className="view-subheading">{t('reports.subtitle')}</p>
      </div>

      {myIssues.length > 0 && (
        <div className="reports-filter-bar" role="tablist" aria-label="Filter reports">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('reports.filterAll')} (<span className="tabular-nums">{counts.all}</span>)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'open'}
            className={`filter-chip ${filter === 'open' ? 'active' : ''}`}
            onClick={() => setFilter('open')}
          >
            {t('reports.filterOpen')} (<span className="tabular-nums">{counts.open}</span>)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'resolved'}
            className={`filter-chip ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            {t('reports.filterResolved')} (<span className="tabular-nums">{counts.resolved}</span>)
          </button>
          {counts.pending > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'pending'}
              className={`filter-chip ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              {t('reports.filterPending')} (<span className="tabular-nums">{counts.pending}</span>)
            </button>
          )}
        </div>
      )}

      {myIssues.length === 0 ? (
        <div className="empty-state">
          <div className="category-icon-box empty-state-icon">
            <IconClipboard size={24} />
          </div>
          <h3>{t('reports.emptyTitle')}</h3>
          <p>{t('reports.emptyDesc')}</p>
          {onStartReport && (
            <button type="button" className="btn-primary-action empty-state-cta" onClick={onStartReport}>
              <IconPlus size={18} />
              <span>{t('reports.startReport')}</span>
            </button>
          )}
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="empty-state">
          <p>{t('reports.noMatchingFilter')}</p>
          <button type="button" className="filter-chip chip-action" onClick={() => setFilter('all')}>
            {t('reports.filterAll')}
          </button>
        </div>
      ) : (
        <div className="timeline-list">
          {filteredIssues.map((issue) => {
            const photosList = issue.photos && issue.photos.length > 0 ? issue.photos : null;
            const isManualPin = issue.location_source === 'manual_pin';
            const tierClass = getAccuracyTierClass(issue.gps_accuracy_m);

            return (
              <article key={issue.id} className="incident-card" aria-labelledby={`issue-title-${issue.id}`}>
                <div className="incident-card-top">
                  <span id={`issue-title-${issue.id}`} className="incident-category-title">
                    {getCategoryIcon(issue.category, 16)}
                    <span>{issue.category}</span>
                  </span>
                  <span className={`status-badge ${issue.sync_state === 'saved' ? 'saved' : issue.sync_state === 'syncing' ? 'syncing' : 'submitted'}`}>
                    {issue.sync_state === 'saved' && t('reports.savedOnPhone')}
                    {issue.sync_state === 'syncing' && t('reports.syncing')}
                    {issue.sync_state === 'submitted' && t('reports.transmitted')}
                  </span>
                </div>

                <div className="incident-telemetry-row">
                  <span className={`gps-tier-pill ${isManualPin ? 'gps-tier-none' : tierClass}`}>
                    {isManualPin ? <IconMapPin size={11} /> : <IconCrosshair size={11} />}
                    <span>
                      {isManualPin
                        ? t('gps.manualPinLabel')
                        : `${t('gps.liveLabel')}${issue.gps_accuracy_m != null ? ` ±${Math.round(issue.gps_accuracy_m)}m` : ''}`}
                    </span>
                  </span>
                  {issue.heading_deg != null && (
                    <span className="gps-tier-pill gps-tier-none tabular-nums">
                      {Math.round(issue.heading_deg)}°
                    </span>
                  )}
                  <span className={`status-badge ${issue.severity === 'critical' || issue.severity === 'high' ? 'urgent' : 'saved'}`}>
                    {issue.severity.toUpperCase()}
                  </span>
                </div>

                <p className="incident-desc">
                  {issue.description || t('reports.noDescription')}
                </p>

                {issue.decryptedPhone && (
                  <div className="incident-contact">
                    <IconLock size={12} />
                    <span>
                      {t('reports.smsContact')}: <strong className="tabular-nums">{issue.decryptedPhone}</strong>
                    </span>
                  </div>
                )}

                {photosList ? (
                  <div className="report-photo-strip" aria-label={`Attached photos (${photosList.length})`}>
                    {photosList.map((p, idx) => (
                      <img
                        key={`${issue.id}-photo-${idx}`}
                        src={p.data_url}
                        alt={`Attached incident evidence ${idx + 1}`}
                        className="report-photo-thumb"
                      />
                    ))}
                  </div>
                ) : (
                  issue.photo_url && (
                    <div className="photo-preview-container incident-photo">
                      <img src={issue.photo_url} alt="Attached incident evidence" className="photo-preview-image photo-preview-capped" />
                    </div>
                  )
                )}

                {issue.resolution_photo_url && (
                  <div className="resolution-proof-box">
                    <div className="resolution-proof-header">
                      <IconPhotoCheck size={15} />
                      <span>{t('camera.resolutionProof')}</span>
                    </div>
                    <img
                      src={issue.resolution_photo_url}
                      alt="Resolution proof photo"
                      className="photo-preview-image photo-preview-capped"
                    />
                  </div>
                )}

                <div className="incident-footer">
                  <span className={`incident-status ${issue.status === 'resolved' ? 'is-resolved' : 'is-open'}`}>
                    {issue.status.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="tabular-nums">
                    {new Date(issue.date_reported).toLocaleDateString()}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
