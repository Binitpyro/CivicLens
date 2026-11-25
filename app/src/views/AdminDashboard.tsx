import React, { useState, useEffect } from 'react';
import { db } from '../db';
import {
  IconPrinter,
  IconAlertTriangle
} from '../components/CivicIcons';
import { useWard } from '../context/WardContext';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

interface CoverageGap {
  name: string;
  type: string;
  gap: string;
}

interface SeverityItem {
  name: string;
  count: number;
}

interface SummaryData {
  assets_count: number;
  issues_count: number;
  open_issues: number;
  resolved_issues: number;
  categories: Array<{ name: string; count: number }>;
  severities: SeverityItem[];
  coverage_gaps: CoverageGap[];
  gaps_loading: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--color-status-urgent)',
  high:     '#f97316',
  medium:   '#eab308',
  low:      'var(--color-status-active)',
};

interface AdminDashboardProps {
  onOpenPrintView: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onOpenPrintView }) => {
  const { wardId, wardLabel } = useWard();
  const [data, setData] = useState<SummaryData>({
    assets_count: 0,
    issues_count: 0,
    open_issues: 0,
    resolved_issues: 0,
    categories: [],
    severities: [],
    coverage_gaps: [],
    gaps_loading: false,
  });

  useEffect(() => {
    async function loadAnalytics() {
      // --- 1. Summary (counts, categories, severities) ---
      if (navigator.onLine) {
        try {
          const res = await fetch(`${API_BASE}/analytics/summary?ward_id=${wardId}`);
          if (res.ok) {
            const summary = await res.json();
            const totalAssets = summary.assets?.reduce((acc: number, curr: any) => acc + parseInt(curr.count, 10), 0) || 0;
            const openCount   = summary.issues_by_status?.find((s: any) => s.status === 'open')?.count || 0;
            const resolvedCount = summary.issues_by_status?.find((s: any) => s.status === 'resolved')?.count || 0;
            const totalIssues = summary.issues_by_category?.reduce((acc: number, curr: any) => acc + parseInt(curr.count, 10), 0) || 0;

            const cats: Array<{ name: string; count: number }> = summary.issues_by_category?.map((c: any) => ({
              name: c.category,
              count: parseInt(c.count, 10),
            })) || [];

            const sevs: SeverityItem[] = (summary.issues_by_severity || []).map((s: any) => ({
              name:  s.severity,
              count: parseInt(s.count, 10),
            }));

            setData(prev => ({
              ...prev,
              assets_count:    totalAssets,
              issues_count:    totalIssues,
              open_issues:     parseInt(openCount, 10),
              resolved_issues: parseInt(resolvedCount, 10),
              categories:      cats.length > 0 ? cats : prev.categories,
              severities:      sevs,
            }));
          }
        } catch {
          // Fallback to local below
        }
      }

      // --- 1b. Local fallback for counts ---
      try {
        const localAssets = await db.assets.where('ward_id').equals(wardId).count();
        const localIssues = (await db.issues.toArray()).filter((issue) => issue.ward_id === wardId);
        const open     = localIssues.filter(i => i.status === 'open').length;
        const resolved = localIssues.filter(i => i.status === 'resolved').length;

        const catMap: Record<string, number> = {};
        const sevMap: Record<string, number> = {};
        localIssues.forEach(i => {
          catMap[i.category] = (catMap[i.category] || 0) + 1;
          sevMap[i.severity] = (sevMap[i.severity]  || 0) + 1;
        });

        setData(prev => ({
          ...prev,
          assets_count:    prev.assets_count || localAssets,
          issues_count:    prev.issues_count || localIssues.length,
          open_issues:     prev.open_issues  || open,
          resolved_issues: prev.resolved_issues || resolved,
          categories:      prev.categories.length > 0 ? prev.categories : Object.entries(catMap).map(([name, count]) => ({ name, count })),
          severities:      prev.severities.length  > 0 ? prev.severities  : Object.entries(sevMap).map(([name, count]) => ({ name, count })),
        }));
      } catch (err) {
        console.error('Error reading offline analytics from Dexie:', err);
      }

      // --- 2. Coverage gaps — separate parallel fetch ---
      if (navigator.onLine) {
        setData(prev => ({ ...prev, gaps_loading: true }));
        try {
          const gapRes = await fetch(`${API_BASE}/analytics/coverage-gaps?ward_id=${wardId}&distance_m=500`);
          if (gapRes.ok) {
            const gapData = await gapRes.json();
            const gaps: CoverageGap[] = (gapData.features || []).map((f: any) => ({
              name: f.properties?.name || `${f.properties?.type} Facility`,
              type: f.properties?.type?.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Facility',
              gap:  f.properties?.gap_type || 'No active water access within 500m',
            }));
            setData(prev => ({ ...prev, coverage_gaps: gaps, gaps_loading: false }));
            return;
          }
        } catch {
          // Fallback: show empty with note
        }
        setData(prev => ({ ...prev, gaps_loading: false }));
      }
    }

    loadAnalytics();
  }, [wardId]);

  return (
    <div className="admin-dashboard-container" role="region" aria-label="Gram Panchayat Analytics">
      <div className="admin-header">
        <div>
          <h2 className="view-heading">Ward Overview</h2>
          <p className="view-subheading">Panchayat Planning &amp; Gram Sabha Metrics · {wardLabel}</p>
        </div>
        <button
          className="filter-chip chip-action"
          onClick={onOpenPrintView}
          aria-label="Export official Gram Sabha Report"
        >
          <IconPrinter size={15} />
          <span>Export Report</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-matrix">
        <div className="kpi-card">
          <div className="kpi-title">Geotagged Assets</div>
          <div className="kpi-value tabular-nums">{data.assets_count}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Open Grievances</div>
          <div className="kpi-value tabular-nums is-urgent">{data.open_issues}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Resolved Issues</div>
          <div className="kpi-value tabular-nums is-active">{data.resolved_issues}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Resolution Rate</div>
          <div className="kpi-value tabular-nums">
            {data.issues_count > 0 ? `${Math.round((data.resolved_issues / data.issues_count) * 100)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Grievance Category Distribution */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">Grievance Category Distribution</h3>
        {data.categories.length === 0 ? (
          <p className="admin-empty-note">No category data recorded yet.</p>
        ) : (
          <div className="category-bar-list">
            {data.categories.map((cat) => {
              const maxCount = Math.max(...data.categories.map((c) => c.count), 1);
              const pct = Math.round((cat.count / maxCount) * 100);
              return (
                <div key={cat.name} className="category-bar-item">
                  <div className="category-bar-meta">
                    <span className="category-bar-name">{cat.name}</span>
                    <span className="tabular-nums category-bar-count">{cat.count}</span>
                  </div>
                  <div className="category-bar-track">
                    <div className="category-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Severity Distribution */}
      {data.severities.length > 0 && (
        <div className="admin-section-card">
          <h3 className="admin-section-title">Issue Severity Breakdown</h3>
          <div className="category-bar-list">
            {(['critical', 'high', 'medium', 'low'] as const)
              .map(sev => data.severities.find(s => s.name === sev))
              .filter((s): s is SeverityItem => !!s)
              .map((sev) => {
                const maxCount = Math.max(...data.severities.map((s) => s.count), 1);
                const pct = Math.round((sev.count / maxCount) * 100);
                const color = SEVERITY_COLORS[sev.name] || 'var(--color-ink-muted)';
                return (
                  <div key={sev.name} className="category-bar-item">
                    <div className="category-bar-meta">
                      <span className="category-bar-name" style={{ textTransform: 'capitalize' }}>
                        {sev.name}
                      </span>
                      <span className="tabular-nums category-bar-count">{sev.count}</span>
                    </div>
                    <div className="category-bar-track">
                      <div
                        className="category-bar-fill"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Coverage Gaps — live from PostGIS */}
      <div className="admin-section-card">
        <h3 className="admin-section-title" style={{ marginBottom: 4 }}>
          Service Coverage &amp; Infrastructure Gaps
        </h3>
        <p className="admin-section-subtitle">
          Public facilities lacking active drinking water or sanitation access within 500m buffer:
        </p>

        {data.gaps_loading ? (
          <p className="admin-empty-note">Analysing coverage gaps via PostGIS…</p>
        ) : data.coverage_gaps.length === 0 ? (
          <p className="admin-empty-note" style={{ color: 'var(--color-status-active)' }}>
            ✓ All schools and health facilities in {wardLabel} have functional water access within 500m.
            {!navigator.onLine && ' (Connect to server to run live analysis.)'}
          </p>
        ) : (
          <div className="coverage-gap-list">
            {data.coverage_gaps.map((item, idx) => (
              <div key={idx} className="coverage-gap-item">
                <div className="coverage-gap-head">
                  <IconAlertTriangle size={15} color="var(--color-status-urgent)" />
                  <strong className="coverage-gap-name">{item.name}</strong>
                  <span className="coverage-gap-type">({item.type})</span>
                </div>
                <div className="coverage-gap-detail">{item.gap}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
