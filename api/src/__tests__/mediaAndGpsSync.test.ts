import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../config/db', () => ({
  pool: {
    query: mockQuery,
    on: vi.fn(),
  },
}));

import {
  createIssue,
  getIssuesGeoJSON,
  updateIssueStatus,
} from '../controllers/issueController';
import { processSyncBatch } from '../controllers/syncController';

function buildTestApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req: any, _res, next) => {
    req.user = { id: 1, phone: '9876543210', role: 'panchayat_officer', ward_id: 1 };
    next();
  });
  app.get('/api/issues', getIssuesGeoJSON);
  app.post('/api/issues', createIssue);
  app.patch('/api/issues/:id/status', updateIssueStatus);
  app.post('/api/sync', processSyncBatch);
  return app;
}

const samplePhoto = (idx: number) => ({
  data_url: `data:image/jpeg;base64,SAMPLE_${idx}`,
  dhash: `000000000000000${idx}`,
  captured_at: '2026-11-25T13:45:00.000Z',
  latitude: 28.6139,
  longitude: 77.209,
  accuracy_m: 8.5,
  heading_deg: 142,
  location_source: 'gps' as const,
  capture_source: 'camera_native' as const,
  quality_warnings: [],
});

describe('Media & GPS Telemetry API + Sync', () => {
  const app = buildTestApp();

  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('SQL Schema & Migration Idempotency', () => {
    const requiredColumns = [
      'photos',
      'gps_accuracy_m',
      'heading_deg',
      'location_source',
      'resolution_photo_url',
      'resolution_photo_meta',
    ];

    it('includes all media and GPS telemetry columns in schema.sql', () => {
      const schemaSql = readFileSync(resolve(__dirname, '../db/schema.sql'), 'utf-8');
      for (const col of requiredColumns) {
        expect(schemaSql).toContain(col);
      }
    });

    it('includes idempotent ALTER TABLE ADD COLUMN IF NOT EXISTS statements in migration.sql', () => {
      const migrationSql = readFileSync(resolve(__dirname, '../db/migration.sql'), 'utf-8');
      for (const col of requiredColumns) {
        expect(migrationSql).toMatch(
          new RegExp(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS ${col}\\b`, 'i')
        );
      }
    });
  });

  describe('POST /api/issues (createIssue) & GET /api/issues (getIssuesGeoJSON)', () => {
    it('stores multi-photo array, GPS telemetry, and falls back photo_url to photos[0].data_url', async () => {
      const photos = [samplePhoto(1), samplePhoto(2)];
      const returnedRow = {
        id: '11111111-1111-1111-1111-111111111111',
        category: 'Road Pothole',
        severity: 'high',
        status: 'open',
        photo_url: photos[0].data_url,
        photos,
        gps_accuracy_m: 8.5,
        heading_deg: 0,
        location_source: 'gps',
        resolution_photo_url: null,
        resolution_photo_meta: null,
        version_id: 1,
        server_received_at: '2026-11-25T13:50:00.000Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [returnedRow] });

      const res = await request(app)
        .post('/api/issues')
        .send({
          id: '11111111-1111-1111-1111-111111111111',
          ward_id: 1,
          category: 'Road Pothole',
          severity: 'high',
          description: 'Deep pothole near school gate',
          photos,
          gps_accuracy_m: 8.5,
          heading_deg: 0,
          location_source: 'gps',
          latitude: 28.6139,
          longitude: 77.209,
        });

      expect(res.status).toBe(201);
      expect(res.body.photo_url).toBe(photos[0].data_url);
      expect(res.body.photos).toHaveLength(2);
      expect(res.body.gps_accuracy_m).toBe(8.5);
      expect(res.body.heading_deg).toBe(0);
      expect(res.body.location_source).toBe('gps');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('photos');
      expect(sql).toContain('gps_accuracy_m');
      expect(sql).toContain('heading_deg');
      expect(sql).toContain('location_source');
      expect(params[6]).toBe(photos[0].data_url);
      expect(params[7]).toBe(JSON.stringify(photos));
      expect(params[8]).toBe(8.5);
      expect(params[9]).toBe(0); // 0 deg North must not be coerced to null
      expect(params[10]).toBe('gps');
    });

    it('rejects > 3 photos or invalid location_source with 400', async () => {
      const res = await request(app)
        .post('/api/issues')
        .send({
          id: '22222222-2222-2222-2222-222222222222',
          category: 'Waterlogging',
          photos: [samplePhoto(1), samplePhoto(2), samplePhoto(3), samplePhoto(4)],
          location_source: 'cell_tower',
          latitude: 28.61,
          longitude: 77.2,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns media and GPS fields in getIssuesGeoJSON properties', async () => {
      const photos = [samplePhoto(1)];
      const resolutionMeta = samplePhoto(9);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            asset_id: null,
            ward_id: 1,
            category: 'Road Pothole',
            severity: 'high',
            description: 'Repaired',
            photo_url: photos[0].data_url,
            photos,
            gps_accuracy_m: 11.2,
            heading_deg: 215,
            location_source: 'manual_pin',
            resolution_photo_url: resolutionMeta.data_url,
            resolution_photo_meta: resolutionMeta,
            encrypted_phone: null,
            status: 'resolved',
            reported_by: 1,
            assigned_officer: 'Officer Verma',
            version_id: 2,
            client_seq_num: 1001,
            server_received_at: '2026-11-25T13:50:00.000Z',
            date_reported: '2026-11-25T13:45:00.000Z',
            date_resolved: '2026-11-25T14:00:00.000Z',
            geometry: { type: 'Point', coordinates: [77.209, 28.6139] },
          },
        ],
      });

      const res = await request(app).get('/api/issues');
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('FeatureCollection');
      const props = res.body.features[0].properties;
      expect(props.photos).toEqual(photos);
      expect(props.gps_accuracy_m).toBe(11.2);
      expect(props.heading_deg).toBe(215);
      expect(props.location_source).toBe('manual_pin');
      expect(props.resolution_photo_url).toBe(resolutionMeta.data_url);
      expect(props.resolution_photo_meta).toEqual(resolutionMeta);
    });
  });

  describe('PATCH /api/issues/:id/status (updateIssueStatus)', () => {
    it('persists resolution_photo_url and resolution_photo_meta when resolving an issue', async () => {
      const resolutionMeta = samplePhoto(5);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            category: 'Road Pothole',
            status: 'resolved',
            assigned_officer: 'Officer Verma',
            resolution_photo_url: resolutionMeta.data_url,
            resolution_photo_meta: resolutionMeta,
            version_id: 2,
            date_resolved: '2026-11-25T14:10:00.000Z',
          },
        ],
      });

      const res = await request(app)
        .patch('/api/issues/11111111-1111-1111-1111-111111111111/status')
        .send({
          status: 'resolved',
          assigned_officer: 'Officer Verma',
          resolution_photo_url: resolutionMeta.data_url,
          resolution_photo_meta: resolutionMeta,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved');
      expect(res.body.resolution_photo_url).toBe(resolutionMeta.data_url);
      expect(res.body.resolution_photo_meta).toEqual(resolutionMeta);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('resolution_photo_url');
      expect(sql).toContain('resolution_photo_meta');
      expect(params[0]).toBe('resolved');
      expect(params[1]).toBe('Officer Verma');
      expect(params[2]).toBe(resolutionMeta.data_url);
      expect(params[3]).toBe(JSON.stringify(resolutionMeta));
      expect(params[4]).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('returns 404 if issue ID does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .patch('/api/issues/99999999-9999-9999-9999-999999999999/status')
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Issue not found');
    });
  });

  describe('POST /api/sync (processSyncBatch)', () => {
    it('upserts multi-photo, GPS metadata, and resolution proof in sync batch', async () => {
      const photos = [samplePhoto(1), samplePhoto(2), samplePhoto(3)];
      const resolutionMeta = samplePhoto(4);

      // Item 1: new issue create with 3 photos + GPS metadata
      mockQuery.mockResolvedValueOnce({ rows: [] }); // existing check
      mockQuery.mockResolvedValueOnce({ rows: [] }); // upsert

      // Item 2: offline resolution update with omitted photos/gps (should pass null so COALESCE preserves)
      mockQuery.mockResolvedValueOnce({ rows: [{ version_id: 1, status: 'open' }] }); // existing check
      mockQuery.mockResolvedValueOnce({ rows: [] }); // upsert

      const res = await request(app)
        .post('/api/sync')
        .send({
          batch: [
            {
              record_id: 'aaaa1111-1111-1111-1111-111111111111',
              table_name: 'issues',
              action: 'create',
              client_seq_num: 1732542000000,
              payload: {
                ward_id: 1,
                category: 'Streetlight Outage',
                severity: 'medium',
                description: 'Pole #14 dark',
                photos,
                gps_accuracy_m: 12.4,
                heading_deg: 270,
                location_source: 'manual_pin',
                latitude: 28.614,
                longitude: 77.2095,
                status: 'open',
              },
            },
            {
              record_id: 'bbbb2222-2222-2222-2222-222222222222',
              table_name: 'issues',
              action: 'update',
              client_seq_num: 1732542100000,
              payload: {
                ward_id: 1,
                category: 'Drinking Handpump Broken',
                latitude: 28.615,
                longitude: 77.21,
                status: 'resolved',
                resolution_photo_url: resolutionMeta.data_url,
                resolution_photo_meta: resolutionMeta,
              },
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.processed_count).toBe(2);
      expect(res.body.acks).toEqual([
        { record_id: 'aaaa1111-1111-1111-1111-111111111111', status: 'synced' },
        { record_id: 'bbbb2222-2222-2222-2222-222222222222', status: 'synced' },
      ]);

      // Verify item 1 upsert parameters
      const [sql1, params1] = mockQuery.mock.calls[1];
      expect(sql1).toContain('COALESCE($8::jsonb, issues.photos)');
      expect(sql1).toContain('COALESCE(EXCLUDED.gps_accuracy_m, issues.gps_accuracy_m)');
      expect(sql1).toContain('COALESCE($11, issues.location_source)');
      expect(params1[6]).toBe(photos[0].data_url); // backward-compat photo_url fallback
      expect(params1[7]).toBe(JSON.stringify(photos));
      expect(params1[8]).toBe(12.4);
      expect(params1[9]).toBe(270);
      expect(params1[10]).toBe('manual_pin');

      // Verify item 2 upsert preserves omitted fields via NULL + COALESCE
      const [, params2] = mockQuery.mock.calls[3];
      expect(params2[7]).toBeNull(); // omitted photos -> preserved via COALESCE
      expect(params2[8]).toBeNull(); // omitted gps_accuracy_m -> preserved
      expect(params2[9]).toBeNull(); // omitted heading_deg -> preserved
      expect(params2[10]).toBeNull(); // omitted location_source -> preserved
      expect(params2[11]).toBe(resolutionMeta.data_url);
      expect(params2[12]).toBe(JSON.stringify(resolutionMeta));
      expect(params2[16]).toBe('resolved');
    });
  });
});
