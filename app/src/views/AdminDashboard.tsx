import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { 
  IconPrinter, 
  IconAlertTriangle 
} from '../components/CivicIcons';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

interface SummaryData {
  assets_count: number;
  issues_count: number;
  open_issues: number;
  resolved_issues: number;
  categories: Array<{ name: string; count: number }>;
  coverage_gaps: Array<{ name: string; type: string; gap: string }>;
}

interface AdminDashboardProps {
  onOpenPrintView: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onOpenPrintView }) => {
  const [data, setData] = useState<SummaryData>({
    assets_count: 0,
    issues_count: 0,
    open_issues: 0,
    resolved_issues: 0,
    categories: [],
    coverage_gaps: [
      { name: 'Govt Primary School Ward 3', type: 'School', gap: 'No active handpump within 500m' },
      { name: 'Anganwadi Center Kalyanpur', type: 'Anganwadi', gap: 'No public sanitation within 300m' },
    ],
  });

  useEffect(() => {
    async function loadAnalytics() {
      if (navigator.onLine) {
        try {
          const res = await fetch(`${API_BASE}/analytics/summary?ward_id=1`);
          if (res.ok) {
            const summary = await res.json();
            const totalAssets = summary.assets?.reduce((acc: number, curr: any) => acc + parseInt(curr.count, 10), 0) || 0;
            const openCount = summary.issues_by_status?.find((s: any) => s.status === 'open')?.count || 0;
            const resolvedCount = summary.issues_by_status?.find((s: any) => s.status === 'resolved')?.count || 0;
            const totalIssues = summary.issues_by_category?.reduce((acc: number, curr: any) => acc + parseInt(curr.count, 10), 0) || 0;
            
            const cats = summary.issues_by_category?.map((c: any) => ({
              name: c.category,
              count: parseInt(c.count, 10),
            })) || [];

            setData(prev => ({
              ...prev,
              assets_count: totalAssets,
              issues_count: totalIssues,
              open_issues: parseInt(openCount, 10),
              resolved_issues: parseInt(resolvedCount, 10),
              categories: cats.length > 0 ? cats : prev.categories,
            }));
            return;
          }
        } catch {
          // Fallback to local
        }
      }

      // Offline fallback from Dexie
      try {
        const localAssets = await db.assets.count();
        const localIssues = await db.issues.toArray();
        const open = localIssues.filter(i => i.status === 'open').length;
        const resolved = localIssues.filter(i => i.status === 'resolved').length;
        
        const catMap: Record<string, number> = {};
        localIssues.forEach(i => {
          catMap[i.category] = (catMap[i.category] || 0) + 1;
        });

        setData(prev => ({
          ...prev,
          assets_count: localAssets,
          issues_count: localIssues.length,
          open_issues: open,
          resolved_issues: resolved,
          categories: Object.entries(catMap).map(([name, count]) => ({ name, count })),
        }));
      } catch (err) {
        console.error('Error reading offline analytics from Dexie:', err);
      }
    }

    loadAnalytics();
  }, []);

  return (
    <div className="admin-dashboard-container" role="region" aria-label="Gram Panchayat Analytics">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 className="view-heading">Ward Overview</h2>
          <p className="view-subheading">Panchayat Planning & Gram Sabha Metrics · Ward 3</p>
        </div>
        <button 
          className="filter-chip"
          style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-ink)', fontWeight: 600 }}
          onClick={onOpenPrintView}
          aria-label="Export official Gram Sabha Report"
        >
          <IconPrinter size={15} />
          <span>Export Report</span>
        </button>
      </div>

      {/* KPI Matrix with Tabular Figures */}
      <div className="kpi-matrix">
        <div className="kpi-card">
          <div className="kpi-title">Geotagged Assets</div>
          <div className="kpi-value tabular-nums">
            {data.assets_count}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Open Grievances</div>
          <div className="kpi-value tabular-nums" style={{ color: 'var(--color-status-urgent)' }}>
            {data.open_issues}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Resolved Issues</div>
          <div className="kpi-value tabular-nums" style={{ color: 'var(--color-status-active)' }}>
            {data.resolved_issues}
          </div>
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
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          Grievance Category Distribution
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.categories.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>No category data recorded yet.</p>
          ) : (
            data.categories.map((cat) => {
              const maxCount = Math.max(...data.categories.map((c) => c.count), 1);
              const pct = Math.round((cat.count / maxCount) * 100);
              return (
                <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--color-ink-2)' }}>{cat.name}</span>
                    <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{cat.count}</span>
                  </div>
                  <div className="category-bar-track">
                    <div className="category-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Spatial Coverage Gaps */}
      <div className="admin-section-card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          Service Coverage & Infrastructure Gaps
        </h3>
        <p style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 14 }}>
          Public facilities lacking active drinking water or sanitation access within proximity buffer:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.coverage_gaps.map((item, idx) => (
            <div key={idx} className="coverage-gap-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconAlertTriangle size={15} color="var(--color-status-urgent)" />
                <strong style={{ fontSize: 13, color: 'var(--color-ink)' }}>{item.name}</strong>
                <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>({item.type})</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-status-urgent)', marginTop: 3, fontWeight: 500, paddingLeft: 21 }}>
                {item.gap}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
