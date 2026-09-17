import React, { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';
import { db } from '../db';
import { useOfflineSync } from '../hooks/useOfflineSync';
import {
  getAssetTypeIcon,
  IconCrosshair,
  IconCheck,
  IconAlertTriangle,
  IconCamera,
} from '../components/CivicIcons';
import { compressPhotoOffThread } from '../services/photoWorker';

const ASSET_TYPES = [
  { id: 'handpump', name: 'Handpump' },
  { id: 'streetlight', name: 'Streetlight' },
  { id: 'public_toilet', name: 'Public Toilet' },
  { id: 'drainage', name: 'Drainage Culvert' },
  { id: 'anganwadi', name: 'Anganwadi' },
  { id: 'school', name: 'School Facility' },
];

interface OperationalLevel {
  level: number;
  id: string;
  name: string;
  badge: string;
  range: string;
  percentage: number;
  color: string;
  gradient: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  description: string;
}

const OPERATIONAL_LEVELS: OperationalLevel[] = [
  {
    level: 1,
    id: 'non_functional',
    name: 'Breakdown',
    badge: 'Level 1 · Total Breakdown (0 - 25%)',
    range: '0 - 25%',
    percentage: 25,
    color: '#DC2626',
    gradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    bgColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#EF4444',
    glowColor: 'rgba(220, 38, 38, 0.45)',
    description: 'Defunct, broken, or inoperable. Urgent replacement or emergency overhaul required.',
  },
  {
    level: 2,
    id: 'needs_repair',
    name: 'Major Fault',
    badge: 'Level 2 · Major Fault (25 - 50%)',
    range: '25 - 50%',
    percentage: 50,
    color: '#EA580C',
    gradient: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)',
    bgColor: 'rgba(234, 88, 12, 0.12)',
    borderColor: '#F97316',
    glowColor: 'rgba(234, 88, 12, 0.45)',
    description: 'Severely impaired functionality, heavy leakage, or structural hazard requiring repair.',
  },
  {
    level: 3,
    id: 'needs_repair',
    name: 'Minor Issue',
    badge: 'Level 3 · Minor Defect (50 - 75%)',
    range: '50 - 75%',
    percentage: 75,
    color: '#D97706',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
    bgColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: '#F59E0B',
    glowColor: 'rgba(217, 119, 6, 0.45)',
    description: 'Partially functioning with minor faults, worn parts, or periodic maintenance needed.',
  },
  {
    level: 4,
    id: 'active',
    name: 'Optimal',
    badge: 'Level 4 · Fully Operational (75 - 100%)',
    range: '75 - 100%',
    percentage: 100,
    color: '#16A34A',
    gradient: 'linear-gradient(135deg, #10B981 0%, #15803D 100%)',
    bgColor: 'rgba(22, 163, 74, 0.12)',
    borderColor: '#10B981',
    glowColor: 'rgba(22, 163, 74, 0.45)',
    description: 'Optimal working condition with continuous operation, reliable service, and no defects.',
  },
];

interface ContextualSpec {
  id: string;
  label: string;
  options: string[];
}

const CONTEXTUAL_SPECS: Record<string, ContextualSpec[]> = {
  handpump: [
    {
      id: 'water_flow',
      label: 'Water Discharge & Flow',
      options: ['Normal Continuous Flow', 'Low Pressure / Trickle', 'Dry / No Water Discharge'],
    },
    {
      id: 'water_quality',
      label: 'Water Quality & Potability',
      options: ['Clean & Drinkable', 'High Iron / Salty Taste', 'Turbid / Muddy / Contaminated'],
    },
    {
      id: 'pump_model',
      label: 'Handpump Model',
      options: ['India Mark II (Deep Well)', 'India Mark III', 'Submersible Motor Attached', 'Traditional Shallow Pump'],
    },
  ],
  streetlight: [
    {
      id: 'power_source',
      label: 'Luminaire & Power Source',
      options: ['Solar Powered LED (Standalone)', 'Grid Electricity LED (Panchayat Line)', 'Sodium / Fluorescent Tube Light'],
    },
    {
      id: 'pole_type',
      label: 'Mounting & Pole Structure',
      options: ['Dedicated Concrete Pole', 'Electricity Board (EB) Pole Mount', 'Building Wall Mount', 'Damaged / Leaning Pole'],
    },
    {
      id: 'sensor_mode',
      label: 'Control Mechanism',
      options: ['Automatic Dusk-to-Dawn Timer', 'Manual Switch Operated', 'Always On / Broken Timer'],
    },
  ],
  public_toilet: [
    {
      id: 'running_water',
      label: 'Running Water Availability',
      options: ['Piped Running Water (Overhead Tank)', 'Stored Tanker / Drum Water', 'Dry Sanitation (No Water Source)'],
    },
    {
      id: 'cleanliness',
      label: 'Hygiene & Cleanliness Level',
      options: ['Clean & Well Maintained', 'Dirty / Requires Cleaning', 'Choked / Blocked Drainage'],
    },
    {
      id: 'facility_type',
      label: 'Facility Type',
      options: ['Community Toilet (Separate Male/Female)', 'Single Unit Public Booth', 'Gram Panchayat Common Toilet'],
    },
  ],
  drainage: [
    {
      id: 'drain_construction',
      label: 'Drain Construction Type',
      options: ['Covered Concrete Drain (Pucca)', 'Open Masonry / Brick Drain', 'Earthen / Kachha Ditch'],
    },
    {
      id: 'clogging_status',
      label: 'Silting & Water Flow',
      options: ['Free Flowing (Clear)', 'Partially Silted with Garbage', 'Completely Choked / Overflowing'],
    },
  ],
  anganwadi: [
    {
      id: 'building_ownership',
      label: 'Premises Ownership',
      options: ['Government Dedicated Building', 'Rented Room / Temporary Space', 'Shared with Village Community'],
    },
    {
      id: 'drinking_water',
      label: 'Drinking Water on Site',
      options: ['Functional Piped Tap / RO', 'Nearby Functional Handpump', 'No Safe Water Source on Premises'],
    },
    {
      id: 'electricity',
      label: 'Electricity Supply',
      options: ['Metered Power & Fans Working', 'Irregular Supply / Fuse Blown', 'No Electricity Connection'],
    },
  ],
  school: [
    {
      id: 'school_level',
      label: 'School Category',
      options: ['Primary School (Grades 1-5)', 'Upper Primary (Grades 6-8)', 'Secondary / High School'],
    },
    {
      id: 'girls_toilet',
      label: 'Dedicated Girls Toilet Facility',
      options: ['Functional with Running Water', 'Present but Needs Repair', 'No Separate Girls Facility'],
    },
    {
      id: 'drinking_water_school',
      label: 'Safe Drinking Water Access',
      options: ['Dedicated Handpump / RO Filter', 'Tap Water Connection', 'No Safe Water on Campus'],
    },
  ],
};

function mapAssetTypeToCategory(assetType: string): string {
  switch (assetType) {
    case 'handpump':
    case 'overhead_tank':
      return 'Water Supply';
    case 'streetlight':
      return 'Street Lighting';
    case 'public_toilet':
      return 'Public Sanitation';
    case 'drainage':
    case 'road':
      return 'Roads & Drains';
    case 'anganwadi':
    case 'school':
      return 'School / Anganwadi';
    case 'phc':
      return 'Health (PHC)';
    default:
      return 'Water Supply';
  }
}

export const VolunteerQuickAdd: React.FC = () => {
  const { latitude, longitude, accuracy, getSingleFix, loading: geoLoading } = useGeolocation();
  const { triggerSync } = useOfflineSync();

  const [assetType, setAssetType] = useState<string>('handpump');
  const [assetName, setAssetName] = useState<string>('');
  const [lbdCode, setLbdCode] = useState<string>('');
  const [status, setStatus] = useState<string>('active');
  const [selectedLevel, setSelectedLevel] = useState<number>(4);
  const [contextualValues, setContextualValues] = useState<Record<string, string>>({});
  const [counter, setCounter] = useState<number>(0);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [sessionSurveys, setSessionSurveys] = useState<Array<{
    id: string;
    name: string;
    assetType: string;
    level: number;
    levelObj: OperationalLevel;
    time: string;
    hasProblem: boolean;
  }>>([]);

  const activeLevelObj = OPERATIONAL_LEVELS.find((l) => l.level === selectedLevel) || OPERATIONAL_LEVELS[3];

  // Problem / Damage Reporting state
  const [hasProblem, setHasProblem] = useState<boolean>(false);
  const [problemDescription, setProblemDescription] = useState<string>('');
  const [problemSeverity, setProblemSeverity] = useState<string>('high');
  const [problemPhoto, setProblemPhoto] = useState<string | null>(null);
  const [compressing, setCompressing] = useState<boolean>(false);

  const handleContextualChange = (fieldId: string, value: string) => {
    setContextualValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleProblemPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setCompressing(true);
      const compressedUrl = await compressPhotoOffThread(file);
      setProblemPhoto(compressedUrl);
    } catch (err) {
      console.error('Error compressing problem photo:', err);
      alert('Photo optimization failed. Please try another image.');
    } finally {
      setCompressing(false);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const assetId = 'ast_' + crypto.randomUUID();
      const activeSpecs = CONTEXTUAL_SPECS[assetType] || [];
      const computedAttributes: Record<string, string | number> = {
        surveyed_by: 'Field Volunteer',
        operational_level: selectedLevel,
        health_percentage: activeLevelObj.percentage,
        condition_grade: activeLevelObj.name,
      };
      activeSpecs.forEach((spec) => {
        computedAttributes[spec.id] = contextualValues[spec.id] || spec.options[0];
      });

      const newAsset = {
        id: assetId,
        ward_id: 1,
        asset_type: assetType,
        name: assetName || `${assetType.replace('_', ' ').toUpperCase()} #${counter + 1}`,
        lbd_asset_id: lbdCode || undefined,
        status,
        latitude: latitude || 28.6139,
        longitude: longitude || 77.2090,
        attributes: computedAttributes,
        version_id: 1,
        sync_state: 'saved' as const,
      };

      await db.transaction('rw', [db.assets, db.issues, db.outbox], async () => {
        await db.assets.add(newAsset);
        await db.outbox.add({
          record_id: assetId,
          table_name: 'assets',
          action: 'create',
          payload: {
            id: assetId,
            ward_id: 1,
            asset_type: assetType,
            name: newAsset.name,
            lbd_asset_id: lbdCode || null,
            status,
            latitude: latitude || 28.6139,
            longitude: longitude || 77.2090,
            attributes: newAsset.attributes,
          },
          client_seq_num: Date.now(),
          created_at: new Date().toISOString(),
        });

        // If a problem/damage was flagged, simultaneously create and queue a linked issue
        if (hasProblem && problemDescription.trim()) {
          const issueId = 'iss_' + crypto.randomUUID();
          const category = mapAssetTypeToCategory(assetType);
          const issueDesc = `[Asset ${newAsset.name}]: ${problemDescription.trim()}`;
          const clientSeqNum = Date.now() + 1;

          await db.issues.add({
            id: issueId,
            asset_id: assetId,
            ward_id: 1,
            category,
            severity: problemSeverity,
            description: issueDesc,
            photo_url: problemPhoto || undefined,
            latitude: latitude || 28.6139,
            longitude: longitude || 77.2090,
            status: 'open',
            version_id: 1,
            client_seq_num: clientSeqNum,
            date_reported: new Date().toISOString(),
            sync_state: 'saved' as const,
          });

          await db.outbox.add({
            record_id: issueId,
            table_name: 'issues',
            action: 'create',
            payload: {
              id: issueId,
              asset_id: assetId,
              ward_id: 1,
              category,
              severity: problemSeverity,
              description: issueDesc,
              photo_url: problemPhoto || null,
              latitude: latitude || 28.6139,
              longitude: longitude || 77.2090,
              status: 'open',
            },
            client_seq_num: clientSeqNum,
            created_at: new Date().toISOString(),
          });
        }
      });

      const recordedItem = {
        id: assetId,
        name: assetName || `${assetType.replace('_', ' ').toUpperCase()} #${counter + 1}`,
        assetType,
        level: selectedLevel,
        levelObj: activeLevelObj,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hasProblem,
      };
      setSessionSurveys((prev) => [recordedItem, ...prev]);

      setCounter((prev) => prev + 1);
      setAssetName('');
      setLbdCode('');
      setContextualValues({});
      setSelectedLevel(4);
      setStatus('active');
      setHasProblem(false);
      setProblemDescription('');
      setProblemPhoto(null);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);

      getSingleFix();
      triggerSync();
    } catch (err) {
      console.error('Error in Quick Add asset:', err);
    }
  };

  return (
    <div className="report-form-container" role="region" aria-label="Field Asset Rapid Survey">
      <div className="form-header-card">
        <div className="admin-header">
          <h2 className="view-heading">Rapid Field Survey</h2>
          <span className="status-badge submitted tabular-nums">
            {counter} Logged
          </span>
        </div>
        <p className="view-subheading">Fast-track geotagging for ward infrastructure field surveys.</p>
      </div>

      {savedNotice && (
        <div className="notice-banner">
          <IconCheck size={16} />
          <span>Asset #{counter} saved to local survey log!</span>
        </div>
      )}

      <form onSubmit={handleQuickAdd}>
        <h3 className="form-section-title">1. Select Asset Type</h3>
        <div className="category-selection-grid" role="radiogroup" aria-label="Asset Type">
          {ASSET_TYPES.map((type) => {
            const isSelected = assetType === type.id;
            return (
              <button
                type="button"
                key={type.id}
                role="radio"
                aria-checked={isSelected}
                className={`category-card-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setAssetType(type.id)}
              >
                <div className="category-icon-box" aria-hidden="true">
                  {getAssetTypeIcon(type.id, 18)}
                </div>
                <span className="category-card-label">{type.name}</span>
              </button>
            );
          })}
        </div>

        <h3 className="form-section-title">2. Location Coordinates</h3>
        <div className="gps-fix-card">
          <div>
            <div className="gps-fix-coords">
              {geoLoading ? (
                <span>Acquiring GPS fix…</span>
              ) : latitude ? (
                <span className="tabular-nums">{latitude.toFixed(5)}°N, {longitude?.toFixed(5)}°E</span>
              ) : (
                <span>Coordinates unavailable</span>
              )}
            </div>
            <div className="gps-fix-meta">
              {accuracy !== null ? `Accuracy ±${accuracy}m` : 'Ward 3 · Kalyanpur'}
            </div>
          </div>
          <button
            type="button"
            className="filter-chip"
            onClick={getSingleFix}
            disabled={geoLoading}
            aria-label="Refresh GPS coordinates"
          >
            <IconCrosshair size={14} />
            <span>{geoLoading ? 'Fixing…' : 'Refresh'}</span>
          </button>
        </div>

        <h3 className="form-section-title">3. Operational Condition Level</h3>
        <div className="operational-level-bar-wrap" role="radiogroup" aria-label="Operational condition level">
          <div className="operational-stepped-bar">
            {OPERATIONAL_LEVELS.map((lvl) => {
              const isSelected = selectedLevel === lvl.level;
              return (
                <button
                  key={lvl.level}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`operational-step-btn ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    border: isSelected
                      ? `2px solid ${lvl.borderColor}`
                      : `1.5px solid ${lvl.borderColor}80`,
                    background: isSelected ? lvl.gradient : lvl.bgColor,
                    boxShadow: isSelected
                      ? `0 4px 14px ${lvl.glowColor}, inset 0 1px 0 rgba(255, 255, 255, 0.35)`
                      : 'none',
                    transform: isSelected ? 'translateY(-2px)' : 'none',
                  }}
                  onClick={() => {
                    setSelectedLevel(lvl.level);
                    setStatus(lvl.id);
                  }}
                >
                  <span
                    className="step-num-pill"
                    style={{
                      backgroundColor: isSelected ? '#FFFFFF' : lvl.color,
                      color: isSelected ? lvl.color : '#FFFFFF',
                      boxShadow: isSelected
                        ? '0 2px 6px rgba(0, 0, 0, 0.25)'
                        : `0 0 6px ${lvl.glowColor}`,
                    }}
                  >
                    L{lvl.level}
                  </span>
                  <span
                    className="step-name-label"
                    style={{
                      color: isSelected ? '#FFFFFF' : lvl.color,
                      fontWeight: 800,
                      textShadow: isSelected ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
                    }}
                  >
                    {lvl.name}
                  </span>
                  <span
                    className="step-pct-label"
                    style={{
                      color: isSelected ? '#FFFFFF' : lvl.color,
                      backgroundColor: isSelected
                        ? 'rgba(0, 0, 0, 0.22)'
                        : `${lvl.borderColor}20`,
                      border: `1px solid ${isSelected ? 'rgba(255, 255, 255, 0.4)' : `${lvl.borderColor}60`}`,
                    }}
                  >
                    {lvl.range}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="operational-meter-track" aria-hidden="true">
            <div
              className="operational-meter-fill"
              style={{
                width: `${activeLevelObj.percentage}%`,
                background: activeLevelObj.gradient,
                boxShadow: `0 0 12px ${activeLevelObj.glowColor}`,
              }}
            />
            <div className="operational-meter-tick" style={{ left: '25%' }} title="25% Breakdown Threshold" />
            <div className="operational-meter-tick" style={{ left: '50%' }} title="50% Major Fault Threshold" />
            <div className="operational-meter-tick" style={{ left: '75%' }} title="75% Minor Defect Threshold" />
          </div>

          <div
            className="operational-level-feedback"
            style={{
              border: `1.5px solid ${activeLevelObj.borderColor}80`,
              borderLeft: `6px solid ${activeLevelObj.color}`,
              backgroundColor: activeLevelObj.bgColor,
              boxShadow: `0 2px 10px ${activeLevelObj.glowColor}`,
            }}
          >
            <div className="operational-feedback-head">
              <span
                className="operational-feedback-pill-badge"
                style={{
                  background: activeLevelObj.gradient,
                  color: '#FFFFFF',
                }}
              >
                LEVEL {activeLevelObj.level}
              </span>
              <strong className="operational-feedback-title" style={{ color: activeLevelObj.color }}>
                {activeLevelObj.badge}
              </strong>
            </div>
            <p className="operational-feedback-desc">{activeLevelObj.description}</p>
          </div>
        </div>

        {CONTEXTUAL_SPECS[assetType] && CONTEXTUAL_SPECS[assetType].length > 0 && (
          <div className="contextual-fields-section">
            <h3 className="form-section-title">
              4. {ASSET_TYPES.find((t) => t.id === assetType)?.name} Field Attributes
            </h3>
            <div className="contextual-fields-card">
              {CONTEXTUAL_SPECS[assetType].map((spec) => (
                <div key={spec.id} className="form-input-group">
                  <label htmlFor={`field-${spec.id}`} className="form-label">
                    {spec.label}
                  </label>
                  <select
                    id={`field-${spec.id}`}
                    className="form-input"
                    value={contextualValues[spec.id] || spec.options[0]}
                    onChange={(e) => handleContextualChange(spec.id, e.target.value)}
                  >
                    {spec.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Flag Damage / Grievance on this Asset */}
        <div className="problem-toggle-zone">
          <button
            type="button"
            className={`problem-toggle-btn ${hasProblem ? 'active' : ''}`}
            onClick={() => setHasProblem((prev) => !prev)}
            aria-expanded={hasProblem}
          >
            <IconAlertTriangle size={17} />
            <span>
              {hasProblem
                ? `✓ Problem Flagged on this ${ASSET_TYPES.find((t) => t.id === assetType)?.name}`
                : `+ Report Specific Problem / Damage on this ${ASSET_TYPES.find((t) => t.id === assetType)?.name}`}
            </span>
          </button>

          {hasProblem && (
            <div className="problem-details-card">
              <div className="problem-card-header">
                <span className="problem-card-title">
                  <IconAlertTriangle size={15} />
                  <span>Problem Description & Photo</span>
                </span>
                <button
                  type="button"
                  className="filter-chip chip-action"
                  onClick={() => {
                    setHasProblem(false);
                    setProblemDescription('');
                    setProblemPhoto(null);
                  }}
                >
                  Cancel
                </button>
              </div>

              <div className="form-input-group">
                <label htmlFor="problem-desc" className="form-label">
                  What is wrong with this asset?
                </label>
                <textarea
                  id="problem-desc"
                  className="form-textarea"
                  placeholder="e.g. Pump handle broken, riser pipe leaking at base, water pressure dropped..."
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                />
              </div>

              <div className="form-input-group">
                <label className="form-label">Problem Urgency</label>
                <div className="severity-segmented-bar" role="radiogroup">
                  <button
                    type="button"
                    className={`severity-pill-btn ${problemSeverity === 'medium' ? 'active-medium' : ''}`}
                    onClick={() => setProblemSeverity('medium')}
                  >
                    Moderate
                  </button>
                  <button
                    type="button"
                    className={`severity-pill-btn ${problemSeverity === 'high' ? 'active-high' : ''}`}
                    onClick={() => setProblemSeverity('high')}
                  >
                    Urgent
                  </button>
                  <button
                    type="button"
                    className={`severity-pill-btn ${problemSeverity === 'critical' ? 'active-critical' : ''}`}
                    onClick={() => setProblemSeverity('critical')}
                  >
                    Critical
                  </button>
                </div>
              </div>

              <div className="form-input-group">
                <label className="form-label">Photo Evidence</label>
                {problemPhoto ? (
                  <div className="photo-preview-container">
                    <img src={problemPhoto} alt="Damage evidence preview" className="photo-preview-image" />
                    <button
                      type="button"
                      className="btn-remove-photo"
                      onClick={() => setProblemPhoto(null)}
                    >
                      Remove Photo
                    </button>
                  </div>
                ) : (
                  <div className="photo-upload-zone">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      id="problem-photo-input"
                      className="photo-upload-input"
                      onChange={handleProblemPhotoSelect}
                    />
                    <label htmlFor="problem-photo-input" className="photo-upload-label">
                      <div className="category-icon-box photo-upload-icon">
                        <IconCamera size={22} />
                      </div>
                      <span className="photo-upload-title">
                        {compressing ? 'Compressing photo…' : 'Attach Photo / Take Picture'}
                      </span>
                      <span className="photo-upload-hint">
                        Camera or gallery snapshot (compressed on phone)
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <h3 className="form-section-title">
          {CONTEXTUAL_SPECS[assetType]?.length ? '6. Landmark & Identifiers' : '5. Landmark & Identifiers'}
        </h3>
        <div className="form-input-group">
          <label htmlFor="asset-name" className="form-label">
            Asset Name or Landmark (Optional)
          </label>
          <input
            id="asset-name"
            name="assetName"
            type="text"
            className="form-input"
            placeholder="e.g. Handpump near Panchayat Ghar…"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
          />
        </div>

        <div className="form-input-group">
          <label htmlFor="asset-lbd" className="form-label">
            Panchayat / LBD Asset ID (Optional)
          </label>
          <input
            id="asset-lbd"
            name="lbdCode"
            type="text"
            className="form-input"
            placeholder="e.g. LBD-HP-092…"
            value={lbdCode}
            onChange={(e) => setLbdCode(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn-primary-action"
          aria-label="Record asset to local database and advance to next"
        >
          <IconCheck size={18} />
          <span>Record Asset & Advance</span>
        </button>
      </form>

      {sessionSurveys.length > 0 && (
        <div className="recent-surveys-card" role="region" aria-label="Session Survey Feed">
          <div className="recent-surveys-header">
            <h4 className="recent-surveys-title">Session Survey Feed</h4>
            <span className="survey-counter-chip">{sessionSurveys.length} Logged Today</span>
          </div>
          <div className="recent-surveys-list">
            {sessionSurveys.slice(0, 5).map((survey) => (
              <div key={survey.id} className="recent-survey-item">
                <div className="recent-survey-left">
                  <span className="recent-survey-icon" aria-hidden="true">
                    {getAssetTypeIcon(survey.assetType, 16)}
                  </span>
                  <div>
                    <div className="recent-survey-name">{survey.name}</div>
                    <div className="recent-survey-time">
                      {survey.time} · {survey.hasProblem ? '⚠️ Issue Logged' : 'Surveyed'}
                    </div>
                  </div>
                </div>
                <div className="recent-survey-right">
                  <span
                    className="operational-survey-level-chip"
                    style={{
                      background: survey.levelObj.gradient,
                      color: '#FFFFFF',
                      boxShadow: `0 2px 6px ${survey.levelObj.glowColor}`,
                    }}
                  >
                    L{survey.level} · {survey.levelObj.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
