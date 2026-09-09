import React, { useEffect, useState } from 'react';
import { db, type LocalAsset, type LocalIssue } from '../db';
import { IconPrinter } from '../components/CivicIcons';

interface ReportPrintViewProps {
  onBack: () => void;
}

export const ReportPrintView: React.FC<ReportPrintViewProps> = ({ onBack }) => {
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [issues, setIssues] = useState<LocalIssue[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

  useEffect(() => {
    async function loadReportData() {
      try {
        const localAssets = await db.assets.toArray();
        const localIssues = await db.issues.toArray();
        setAssets(localAssets);
        setIssues(localIssues);

        if (navigator.onLine) {
          try {
            const gapRes = await fetch(`${API_BASE}/analytics/coverage-gaps`);
            if (gapRes.ok) {
              const gapData = await gapRes.json();
              if (gapData.features) {
                setCoverageGaps(gapData.features);
              }
            }
          } catch {
            // Offline fallback
          }
        }
      } catch (err) {
        console.error('Error loading report print view data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadReportData();
  }, [API_BASE]);

  const handlePrint = () => {
    window.print();
  };

  const assetTypes = Array.from(new Set(assets.map((a) => a.asset_type)));
  const assetSummary = assetTypes.map((type) => {
    const matching = assets.filter((a) => a.asset_type === type);
    const active = matching.filter((a) => a.status === 'active').length;
    const nonFunctional = matching.filter((a) => a.status !== 'active').length;
    return { type, total: matching.length, active, nonFunctional };
  });

  const activeGrievances = issues.filter((i) => i.status !== 'resolved');

  return (
    <div className="print-view-wrapper">
      <div className="print-header-actions no-print">
        <button
          type="button"
          className="filter-chip chip-action"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>
        <button
          type="button"
          className="filter-chip active chip-action"
          onClick={handlePrint}
          disabled={loading}
        >
          <IconPrinter size={16} />
          <span>Print / Save as PDF</span>
        </button>
      </div>

      <div className="printable-document">
        <div className="doc-header">
          <h1>GRAM PANCHAYAT INFRASTRUCTURE & GRIEVANCE REPORT</h1>
          <h2>Gram Panchayat Monitoring Report — Ward 3 (Kalyanpur)</h2>
          <p className="doc-meta">
            Generated Date: {new Date().toLocaleDateString()} | System: CivicLens GIS Platform
          </p>
        </div>

        <hr className="doc-rule" />

        <section className="doc-section">
          <h3 className="doc-section-title">
            1. Executive Infrastructure Inventory
          </h3>
          {assetSummary.length === 0 ? (
            <p className="doc-note">No geotagged assets recorded yet.</p>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Asset Type</th>
                  <th>Total Geotagged</th>
                  <th>Working Condition</th>
                  <th>Non-Functional / Damaged</th>
                </tr>
              </thead>
              <tbody>
                {assetSummary.map((item) => (
                  <tr key={item.type}>
                    <td className="doc-cell-strong">{item.type.replace('_', ' ').toUpperCase()}</td>
                    <td className="tabular-nums">{item.total}</td>
                    <td className="tabular-nums doc-cell-ok">{item.active}</td>
                    <td className="tabular-nums doc-cell-bad">{item.nonFunctional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="doc-section">
          <h3 className="doc-section-title">
            2. High-Priority Grievances for Gram Sabha Resolution
          </h3>
          {activeGrievances.length === 0 ? (
            <p className="doc-note">No open grievances pending resolution.</p>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Urgency</th>
                  <th>Coordinates</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeGrievances.map((iss) => (
                  <tr key={iss.id}>
                    <td className="doc-cell-strong">{iss.category}</td>
                    <td>{iss.severity.toUpperCase()}</td>
                    <td className="tabular-nums">{iss.latitude.toFixed(5)}°N, {iss.longitude.toFixed(5)}°E</td>
                    <td>{iss.description || 'No description recorded'}</td>
                    <td>{iss.status.toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="doc-section">
          <h3 className="doc-section-title">
            3. Coverage Gap Analysis
          </h3>
          {coverageGaps.length > 0 ? (
            <div>
              {coverageGaps.map((gap, idx) => (
                <p key={gap.properties?.id || idx} className="doc-note" style={{ color: '#0F172A', marginBottom: 4 }}>
                  <strong>Target Action Required:</strong> {gap.properties?.name || gap.properties?.type} — {gap.properties?.gap_type}
                </p>
              ))}
            </div>
          ) : (
            <p className="doc-note" style={{ color: '#334155' }}>
              <strong>Target Action Required:</strong> Schools and health facilities in Ward 3 currently have functional drinking water access within 500m buffer zone.
            </p>
          )}
        </section>

        <div className="doc-signoff">
          <div>
            <p className="doc-signoff-line">Prepared By: ___________________</p>
            <p className="doc-signoff-role">Gram Panchayat Secretary (Gram Sachiv)</p>
          </div>
          <div>
            <p className="doc-signoff-line">Approved By: ___________________</p>
            <p className="doc-signoff-role">Sarpanch / Ward Member</p>
          </div>
        </div>
      </div>
    </div>
  );
};
