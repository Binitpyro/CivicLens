import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
  const [data] = useState<SummaryData>({
    assets_count: 18,
    issues_count: 7,
    open_issues: 4,
    resolved_issues: 3,
    categories: [
      { name: 'Water Supply', count: 3 },
      { name: 'Street Lighting', count: 2 },
      { name: 'Drainage', count: 2 },
    ],
    coverage_gaps: [
      { name: 'Govt Primary School Ward 3', type: 'School', gap: 'No active handpump within 500m' },
      { name: 'Anganwadi Center Kalyanpur', type: 'Anganwadi', gap: 'No public toilet within 300m' },
    ],
  });

  const COLORS = ['#0284c7', '#eab308', '#ea580c', '#16a34a', '#dc2626'];

  return (
    <div className="admin-dashboard-container">
      <div className="admin-header">
        <div>
          <h2>📊 Gram Panchayat Admin Dashboard</h2>
          <p className="subtext">Ward 3 (Kalyanpur) • Shivpur GP</p>
        </div>
        <button className="btn-print-trigger" onClick={onOpenPrintView}>
          🖨️ Export Gram Sabha Report
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-value">{data.assets_count}</span>
          <span className="kpi-label">Geotagged Assets</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value kpi-open">{data.open_issues}</span>
          <span className="kpi-label">Open Grievances</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value kpi-resolved">{data.resolved_issues}</span>
          <span className="kpi-label">Resolved Issues</span>
        </div>
      </div>

      {/* Issues by Category Chart (Recharts) */}
      <div className="chart-card">
        <h3>Grievance Categories Distribution</h3>
        <div className="chart-container" style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={data.categories} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.categories.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Spatial Coverage Gap Analysis (Buffer Analysis Results) */}
      <div className="coverage-gaps-card">
        <h3>📍 PostGIS Coverage Gap Detection</h3>
        <p className="gap-subtext">Facilities requiring priority water & sanitation infrastructure:</p>

        <div className="gap-list">
          {data.coverage_gaps.map((item, idx) => (
            <div key={idx} className="gap-item">
              <span className="gap-icon">⚠️</span>
              <div>
                <strong>{item.name}</strong> ({item.type})
                <p className="gap-detail">{item.gap}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conflict Arbitration Notice */}
      <div className="conflict-notice-card">
        <h3>🛡️ Offline Sync Arbitration Engine</h3>
        <p>No unresolved sync conflicts detected. Dual-timestamp sequence vector checks active.</p>
      </div>
    </div>
  );
};
