import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalAsset } from '../db';
import { initializeLocalSeedData } from '../utils/seedLoader';
import {
  IconPrinter,
  IconAlertTriangle,
  IconCheck,
} from '../components/CivicIcons';
import { API_BASE } from '../services/apiService';

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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeLocalCoverageGaps(assets: LocalAsset[]): Array<{ name: string; type: string; gap: string }> {
  const facilities = assets.filter((a) => a.asset_type === 'school' || a.asset_type === 'anganwadi');
  const activeWater = assets.filter(
    (a) => a.status === 'active' && (a.asset_type === 'handpump' || a.asset_type === 'overhead_tank')
  );
  const activeSanitation = assets.filter(
    (a) => a.status === 'active' && a.asset_type === 'public_toilet'
  );

  const gaps: Array<{ name: string; type: string; gap: string }> = [];

  for (const fac of facilities) {
    const typeLabel = fac.asset_type === 'school' ? 'School' : 'Anganwadi';
    const hasWaterNearby = activeWater.some(
      (w) => haversineMeters(fac.latitude, fac.longitude, w.latitude, w.longitude) <= 500
    );
    if (!hasWaterNearby) {
      gaps.push({
        name: fac.name || `${typeLabel} Facility`,
        type: typeLabel,
        gap: 'No active drinking water source within 500m',
      });
      continue;
    }

    const hasToiletNearby = activeSanitation.some(
      (s) => haversineMeters(fac.latitude, fac.longitude, s.latitude, s.longitude) <= 300
    );
    if (!hasToiletNearby) {
      gaps.push({
        name: fac.name || `${typeLabel} Facility`,
        type: typeLabel,
        gap: 'No active public sanitation within 300m',
      });
    }
  }

  return gaps;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onOpenPrintView }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [usingLocalSource, setUsingLocalSource] = useState(false);
  const [data, setData] = useState<SummaryData>({
    assets_count: 0,
    issues_count: 0,
    open_issues: 0,
    resolved_issues: 0,
    categories: [],
    coverage_gaps: [],
  });

  useEffect(() => {
    let isMounted = true;

    async function loadAnalytics() {
      try {
        await initializeLocalSeedData();
        const [localAssets, localIssues] = await Promise.all([
          db.assets.toArray(),
          db.issues.toArray(),
        ]);

        const localOpen = localIssues.filter((i) => i.status !== 'resolved').length;
        const localResolved = localIssues.filter((i) => i.status === 'resolved').length;
        const catMap: Record<string, number> = {};
        localIssues.forEach((i) => {
          catMap[i.category] = (catMap[i.category] || 0) + 1;
        });
        const localCats = Object.entries(catMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        const localGaps = computeLocalCoverageGaps(localAssets);

        if (isMounted) {
          setData({
            assets_count: localAssets.length,
            issues_count: localIssues.length,
            open_issues: localOpen,
            resolved_issues: localResolved,
            categories: localCats,
            coverage_gaps: localGaps,
          });
          setUsingLocalSource(true);
          setLoading(false);
        }

        const isOfflineDemo =
          typeof window !== 'undefined' &&
          localStorage.getItem('civiclens_token') === 'offline-demo-token';

        if (!navigator.onLine || isOfflineDemo) {
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
          const [summaryRes, gapsRes] = await Promise.all([
            fetch(`${API_BASE}/analytics/summary?ward_id=1`, { signal: controller.signal }),
            fetch(`${API_BASE}/analytics/coverage-gaps?ward_id=1`, { signal: controller.signal }),
          ]);
          clearTimeout(timeoutId);

          let gapsList: Array<{ name: string; type: string; gap: string }> = [];
          if (gapsRes.ok) {
            const gapsJson = await gapsRes.json();
            if (gapsJson.features && gapsJson.features.length > 0) {
              gapsList = gapsJson.features.map((f: { properties: { name?: string; type: string; gap_type: string } }) => ({
                name: f.properties.name || f.properties.type,
                type: f.properties.type,
                gap: f.properties.gap_type,
              }));
            }
          }

          if (summaryRes.ok && isMounted) {
            const summary = await summaryRes.json();
            const totalAssets =
              summary.assets?.reduce((acc: number, curr: { count: string }) => acc + parseInt(curr.count, 10), 0) || 0;
            const openCount = summary.issues_by_status?.find((s: { status: string; count: string }) => s.status === 'open')?.count || 0;
            const resolvedCount =
              summary.issues_by_status?.find((s: { status: string; count: string }) => s.status === 'resolved')?.count || 0;
            const totalIssues =
              summary.issues_by_category?.reduce((acc: number, curr: { count: string }) => acc + parseInt(curr.count, 10), 0) || 0;

            const cats =
              summary.issues_by_category?.map((c: { category: string; count: string }) => ({
                name: c.category,
                count: parseInt(c.count, 10),
              })) || [];

            setUsingLocalSource(false);
            setData((prev) => ({
              ...prev,
              assets_count: totalAssets,
              issues_count: totalIssues,
              open_issues: parseInt(String(openCount), 10),
              resolved_issues: parseInt(String(resolvedCount), 10),
              categories: cats.length > 0 ? cats : prev.categories,
              coverage_gaps: gapsList.length > 0 ? gapsList : prev.coverage_gaps,
            }));
          }
        } catch {
          // Local IndexedDB metrics already rendered cleanly
        }
      } catch (err) {
        console.error('Error loading analytics:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadAnalytics();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="admin-dashboard-container" role="region" aria-label="Gram Panchayat Analytics">
      <div className="admin-header">
        <div>
          <h2 className="view-heading">{t('dashboard.wardOverview')}</h2>
          <p className="view-subheading">{t('dashboard.metricsSubtitle')}</p>
          {usingLocalSource && !loading && (
            <p className="admin-local-note">{t('dashboard.localModeNote')}</p>
          )}
        </div>
        <button
          type="button"
          className="filter-chip chip-action"
          onClick={onOpenPrintView}
          aria-label={t('dashboard.exportReport')}
        >
          <IconPrinter size={15} />
          <span>{t('dashboard.exportReport')}</span>
        </button>
      </div>

      <div className="kpi-matrix">
        <div className="kpi-card">
          <div className="kpi-title">{t('dashboard.geotaggedAssets')}</div>
          <div className="kpi-value tabular-nums">
            {loading ? '—' : data.assets_count}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">{t('dashboard.openGrievances')}</div>
          <div className="kpi-value tabular-nums is-urgent">
            {loading ? '—' : data.open_issues}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">{t('dashboard.resolvedIssues')}</div>
          <div className="kpi-value tabular-nums is-active">
            {loading ? '—' : data.resolved_issues}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">{t('dashboard.resolutionRate')}</div>
          <div className="kpi-value tabular-nums">
            {!loading && data.issues_count > 0
              ? `${Math.round((data.resolved_issues / data.issues_count) * 100)}%`
              : '—'}
          </div>
        </div>
      </div>

      <div className="admin-section-card">
        <h3 className="admin-section-title">
          {t('dashboard.categoryDistribution')}
        </h3>
        {data.categories.length === 0 ? (
          <p className="admin-empty-note">{t('dashboard.noCategoryData')}</p>
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

      <div className="admin-section-card">
        <h3 className="admin-section-title admin-section-title-tight">
          {t('dashboard.coverageGapsTitle')}
        </h3>
        <p className="admin-section-subtitle">
          {t('dashboard.coverageGapsSubtitle')}
        </p>

        {data.coverage_gaps.length === 0 ? (
          <div className="notice-banner">
            <IconCheck size={16} />
            <span>{t('dashboard.noGapsDetected')}</span>
          </div>
        ) : (
          <div className="coverage-gap-list">
            {data.coverage_gaps.map((item, idx) => (
              <div key={idx} className="coverage-gap-item">
                <div className="coverage-gap-head">
                  <div className="coverage-gap-title-wrap">
                    <IconAlertTriangle size={15} color="var(--color-status-urgent)" />
                    <strong className="coverage-gap-name">{item.name}</strong>
                    <span className="coverage-gap-type-badge">{item.type}</span>
                  </div>
                  <span className="coverage-gap-alert-tag">{t('dashboard.gapBadge')}</span>
                </div>
                <div className="coverage-gap-detail">
                  {item.gap}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
