import React, { useEffect, useState } from 'react';
import { db, decryptPII, type LocalIssue } from '../db';
import { useTranslation } from 'react-i18next';
import {
  getCategoryIcon,
  IconClipboard,
  IconLock
} from '../components/CivicIcons';

interface IssueWithDecryptedPhone extends LocalIssue {
  decryptedPhone?: string;
}

const decryptedPhoneCache = new Map<string, string>();

export const MyReportsView: React.FC = () => {
  const { t } = useTranslation();
  const [myIssues, setMyIssues] = useState<IssueWithDecryptedPhone[]>([]);

  useEffect(() => {
    let isMounted = true;
    let prevFingerprint = '';

    async function fetchMyIssues() {
      try {
        const issues = await db.issues.reverse().toArray();

        const currentFingerprint = issues.map(i => `${i.id}:${i.sync_state}:${i.status}:${i.version_id}`).join('|');
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

  return (
    <div className="reports-timeline-container" role="region" aria-label="My Reported Incidents">
      <div className="form-header-card">
        <h2 className="view-heading">
          {t('nav.myReports')} <span className="tabular-nums">({myIssues.length})</span>
        </h2>
        <p className="view-subheading">Grievance logs synchronized with Gram Panchayat records.</p>
      </div>

      {myIssues.length === 0 ? (
        <div className="empty-state">
          <div className="category-icon-box empty-state-icon">
            <IconClipboard size={24} />
          </div>
          <h3>No Grievances Recorded Yet</h3>
          <p>
            Use the Report tab to log a broken handpump, road damage, or failed streetlight in your ward.
          </p>
        </div>
      ) : (
        <div className="timeline-list">
          {myIssues.map((issue) => (
            <article key={issue.id} className="incident-card" aria-labelledby={`issue-title-${issue.id}`}>
              <div className="incident-card-top">
                <span id={`issue-title-${issue.id}`} className="incident-category-title">
                  {getCategoryIcon(issue.category, 16)}
                  <span>{issue.category}</span>
                </span>
                <span className={`status-badge ${issue.sync_state === 'saved' ? 'saved' : issue.sync_state === 'syncing' ? 'syncing' : 'submitted'}`}>
                  {issue.sync_state === 'saved' && 'Saved on Phone'}
                  {issue.sync_state === 'syncing' && 'Syncing…'}
                  {issue.sync_state === 'submitted' && 'Transmitted'}
                </span>
              </div>

              <p className="incident-desc">
                {issue.description || 'No descriptive notes recorded.'}
              </p>

              {issue.decryptedPhone && (
                <div className="incident-contact">
                  <IconLock size={12} />
                  <span>SMS Contact: <strong className="tabular-nums">{issue.decryptedPhone}</strong></span>
                </div>
              )}

              {issue.photo_url && (
                <div className="photo-preview-container incident-photo">
                  <img src={issue.photo_url} alt="Attached incident evidence" className="photo-preview-image" style={{ maxHeight: 150 }} />
                </div>
              )}

              <div className="incident-footer">
                <span className={`incident-status ${issue.status === 'resolved' ? 'is-resolved' : 'is-open'}`}>
                  {issue.status.toUpperCase()}
                </span>
                <span className="tabular-nums">
                  {new Date(issue.date_reported).toLocaleDateString()}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
