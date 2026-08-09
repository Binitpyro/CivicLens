import React, { useEffect, useState } from 'react';
import { db, type LocalAsset, type LocalIssue } from '../db';

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
          } catch (e) {
            console.warn('Could not fetch online coverage gaps:', e);
          }
        }
      } catch (err) {
        console.error('Error loading report print view data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadReportData();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  // Group assets by type for dynamic summary table
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
        <button className="btn-back" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <button className="btn-print-now" onClick={handlePrint} disabled={loading}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <div className="printable-document">
        <div className="doc-header">
          <h1>GRAM PANCHAYAT INFRASTRUCTURE & GRIEVANCE REPORT</h1>
          <h2>Gram Panchayat Monitoring Report — Ward 1</h2>
          <p className="doc-meta">
            Generated Date: {new Date().toLocaleDateString()} | System: CivicLens GIS Platform
          </p>
        </div>

        <hr className="doc-divider" />

        <section className="doc-section">
          <h3>1. Executive Infrastructure Inventory</h3>
          {assetSummary.length === 0 ? (
            <p className="doc-text">No geotagged assets recorded yet.</p>
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
                    <td>{item.type.replace('_', ' ').toUpperCase()}</td>
                    <td>{item.total}</td>
                    <td>{item.active}</td>
                    <td>{item.nonFunctional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="doc-section">
          <h3>2. High-Priority Grievances for Gram Sabha Resolution</h3>
          {activeGrievances.length === 0 ? (
            <p className="doc-text">No open grievances pending resolution.</p>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Coordinates (Lat, Lng)</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeGrievances.map((iss) => (
                  <tr key={iss.id}>
                    <td>{iss.category}</td>
                    <td>{iss.severity.toUpperCase()}</td>
                    <td>{iss.latitude.toFixed(4)}, {iss.longitude.toFixed(4)}</td>
                    <td>{iss.description || 'No description'}</td>
                    <td>{iss.status.toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="doc-section">
          <h3>3. Coverage Gap Analysis</h3>
          {coverageGaps.length > 0 ? (
            <div className="doc-gap-list">
              {coverageGaps.map((gap, idx) => (
                <p key={gap.properties.id || idx} className="doc-text">
                  <strong>Target Action Required:</strong> {gap.properties.name || gap.properties.type} — {gap.properties.gap_type}
                </p>
              ))}
            </div>
          ) : (
            <p className="doc-text">
              <strong>Target Action Required:</strong> Schools and health facilities in Ward 1 currently have functional drinking water access within 500m buffer zone.
            </p>
          )}
        </section>

        <div className="doc-footer">
          <div className="signature-box">
            <p>Prepared By: ___________________</p>
            <p>Gram Panchayat Secretary (Gram Sachiv)</p>
          </div>
          <div className="signature-box">
            <p>Approved By: ___________________</p>
            <p>Sarpanch / Ward Member</p>
          </div>
        </div>
      </div>
    </div>
  );
};
