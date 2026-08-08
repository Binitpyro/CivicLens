import React, { useEffect, useState } from 'react';
import { db, type LocalIssue } from '../db';
import { useTranslation } from 'react-i18next';

export const MyReportsView: React.FC = () => {
  const { t } = useTranslation();
  const [myIssues, setMyIssues] = useState<LocalIssue[]>([]);

  useEffect(() => {
    async function fetchMyIssues() {
      try {
        const issues = await db.issues.reverse().toArray();
        setMyIssues(issues);
      } catch (err) {
        console.error('Error fetching my reports:', err);
      }
    }
    fetchMyIssues();
    const interval = setInterval(fetchMyIssues, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="my-reports-container">
      <h2 className="view-heading">📋 {t('nav.myReports')} ({myIssues.length})</h2>

      {myIssues.length === 0 ? (
        <div className="empty-reports-card">
          <span className="empty-icon">📭</span>
          <h3>No Reports Yet</h3>
          <p>Tap the ➕ Report button to log a broken handpump, streetlight, or drain issue.</p>
        </div>
      ) : (
        <div className="reports-timeline">
          {myIssues.map((issue) => (
            <div key={issue.id} className="timeline-card">
              <div className="timeline-card-header">
                <span className="issue-category-tag">{issue.category}</span>
                <span className={`sync-badge sync-${issue.sync_state}`}>
                  {issue.sync_state === 'saved' && '🟡 Saved on Phone'}
                  {issue.sync_state === 'syncing' && '🔵 Syncing...'}
                  {issue.sync_state === 'submitted' && '🟢 Submitted'}
                </span>
              </div>

              <p className="timeline-description">
                {issue.description || 'No description provided.'}
              </p>

              {issue.photo_url && (
                <img src={issue.photo_url} alt="Uploaded issue" className="timeline-photo-thumbnail" />
              )}

              <div className="timeline-footer">
                <span className={`status-tag status-${issue.status}`}>
                  Status: {issue.status.toUpperCase()}
                </span>
                <span className="timeline-date">
                  {new Date(issue.date_reported).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
