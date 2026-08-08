import React from 'react';

interface ReportPrintViewProps {
  onBack: () => void;
}

export const ReportPrintView: React.FC<ReportPrintViewProps> = ({ onBack }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print-view-wrapper">
      <div className="print-header-actions no-print">
        <button className="btn-back" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <button className="btn-print-now" onClick={handlePrint}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      <div className="printable-document">
        <div className="doc-header">
          <h1>GRAM PANCHAYAT INFRASTRUCTURE & GRIEVANCE REPORT</h1>
          <h2>Shivpur Gram Panchayat • Ward 3 (Kalyanpur)</h2>
          <p className="doc-meta">Generated Date: {new Date().toLocaleDateString()} | System: CivicLens GIS Platform</p>
        </div>

        <hr className="doc-divider" />

        <section className="doc-section">
          <h3>1. Executive Infrastructure Inventory</h3>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Asset Type</th>
                <th>Total Geotagged</th>
                <th>Working Condition</th>
                <th>Non-Functional</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Handpumps (Water)</td>
                <td>6</td>
                <td>4</td>
                <td>2</td>
              </tr>
              <tr>
                <td>Streetlights (Solar LED)</td>
                <td>8</td>
                <td>6</td>
                <td>2</td>
              </tr>
              <tr>
                <td>Public Toilets</td>
                <td>2</td>
                <td>2</td>
                <td>0</td>
              </tr>
              <tr>
                <td>Schools / Anganwadis</td>
                <td>3</td>
                <td>3</td>
                <td>0</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="doc-section">
          <h3>2. High-Priority Grievances for Gram Sabha Resolution</h3>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Severity</th>
                <th>Location / Hamlet</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Water Supply</td>
                <td>HIGH</td>
                <td>School Badi Handpump</td>
                <td>Handle broken and water smells foul</td>
                <td>OPEN</td>
              </tr>
              <tr>
                <td>Drainage</td>
                <td>CRITICAL</td>
                <td>East Hamlet Drain</td>
                <td>Drain blocked by waste causing overflow</td>
                <td>OPEN</td>
              </tr>
              <tr>
                <td>Street Lighting</td>
                <td>MEDIUM</td>
                <td>Temple Junction</td>
                <td>Solar battery dead, street dark at night</td>
                <td>IN PROGRESS</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="doc-section">
          <h3>3. Coverage Gap Analysis</h3>
          <p className="doc-text">
            <strong>Target Action Required:</strong> Govt Primary School Ward 3 lacks a functional drinking water handpump within 500 meters. Installation recommended before upcoming monsoon.
          </p>
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
