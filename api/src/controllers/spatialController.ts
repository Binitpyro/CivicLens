import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import {
  findDuplicateIssues,
  corroborateIssue,
} from '../services/spatialDedupService';
import {
  classifyRuralIssuePhoto,
  calculateHammingDistance,
} from '../services/visionService';
import { getMonsoonWaterloggingAnalysis } from '../services/waterloggingService';

// Validation Schemas
const checkDuplicatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  category: z.string().trim().optional(),
  radius_meters: z.number().positive().max(500).default(30.0),
  limit: z.number().int().positive().max(20).default(5),
});

const corroborateSchema = z.object({
  action_type: z
    .enum(['upvote', 'corroborate_still_present', 'severity_worsened', 'fixed_by_community'])
    .default('upvote'),
  notes: z.string().max(1000).optional(),
  // $0 Cloud Rule: Enforce CDN/Storage URLs only; reject database-bloating base64 strings
  photo_url: z.string().url('Photo must be uploaded to CDN/Storage URL; raw base64 rejected').max(1024).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  device_fingerprint: z.string().max(128).optional(),
});

const classifyPhotoSchema = z.object({
  imageBytesOrBase64: z.string().optional(),
  claimedCategory: z.string().trim().optional(),
  precomputedFeatures: z
    .object({
      damageAreaRatio: z.number().min(0).max(1).optional(),
      edgeRoughness: z.number().min(0).max(1).optional(),
      waterStagnant: z.boolean().optional(),
      dHash: z.string().length(16).optional(),
    })
    .optional(),
  exif: z
    .object({
      hasGps: z.boolean(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      captureTimestamp: z.string().optional(),
      cameraModel: z.string().optional(),
      isLikelyLiveCapture: z.boolean(),
    })
    .optional(),
});

const monsoonQuerySchema = z.object({
  ward_id: z.coerce.number().int().positive().default(1),
  min_risk: z.enum(['CRITICAL', 'HIGH', 'MODERATE', 'LOW']).optional(),
});

/**
 * Controller: Check for duplicate open issues within 30m radius (Pillar 2 Deduplication)
 * POST /api/issues/check-duplicates
 */
export async function checkDuplicateIssues(req: AuthRequest, res: Response) {
  try {
    const parseResult = checkDuplicatesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const duplicates = await findDuplicateIssues(parseResult.data);

    return res.json({
      hasDuplicates: duplicates.length > 0,
      duplicateCount: duplicates.length,
      radiusMeters: parseResult.data.radius_meters,
      duplicates,
    });
  } catch (error: any) {
    console.error('Error checking duplicate issues:', error);
    return res.status(500).json({ error: 'Failed to query duplicate issues' });
  }
}

/**
 * Controller: 1-Tap Upvote / Corroborate an Existing Issue
 * POST /api/issues/:id/corroborate
 */
export async function corroborateIssueHandler(req: AuthRequest, res: Response) {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      return res.status(400).json({ error: 'Issue ID is required' });
    }

    const parseResult = corroborateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const userId = req.user ? req.user.id : null;
    const {
      action_type,
      notes,
      photo_url,
      latitude,
      longitude,
      device_fingerprint,
    } = parseResult.data;

    const result = await corroborateIssue({
      issue_id: id,
      user_id: userId,
      device_fingerprint: device_fingerprint || null,
      action_type,
      notes: notes || null,
      photo_url: photo_url || null,
      latitude,
      longitude,
    });

    return res.status(200).json({
      message: 'Issue successfully corroborated',
      ...result,
    });
  } catch (error: any) {
    console.error('Error corroborating issue:', error);
    const message = error.message || 'Failed to corroborate issue';
    const status = message.includes('already corroborated') ? 409 : 500;
    return res.status(status).json({ error: message });
  }
}

/**
 * Controller: Thin API Image Classification & Automated Severity Scoring
 * POST /api/cv/classify-issue
 */
export async function classifyIssuePhotoHandler(req: AuthRequest, res: Response) {
  try {
    const parseResult = classifyPhotoSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const result = await classifyRuralIssuePhoto(parseResult.data);

    return res.json({
      success: true,
      analysis: result,
    });
  } catch (error: any) {
    console.error('Error classifying issue photo:', error);
    return res.status(500).json({ error: 'Computer vision analysis failed' });
  }
}

/**
 * Controller: Monsoon Waterlogging Vulnerability Analysis
 * GET /api/analytics/monsoon-vulnerability
 */
export async function getMonsoonVulnerabilityHandler(req: AuthRequest, res: Response) {
  try {
    const parseResult = monsoonQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { ward_id, min_risk } = parseResult.data;
    const data = await getMonsoonWaterloggingAnalysis(ward_id, min_risk);

    return res.json({
      type: 'FeatureCollection',
      ward_id: data.ward_id,
      total_hotspots: data.total_hotspots,
      critical_hotspots: data.critical_hotspots,
      features: data.features,
    });
  } catch (error: any) {
    console.error('Error in monsoon vulnerability handler:', error);
    return res.status(500).json({ error: 'Failed to generate monsoon vulnerability report' });
  }
}
