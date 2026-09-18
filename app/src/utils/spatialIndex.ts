import RBush from 'rbush';
import type { LocalAsset, LocalIssue } from '../db';

export interface BBoxItem<T> {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  data: T;
}

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export class SpatialIndexManager {
  private assetTree = new RBush<BBoxItem<LocalAsset>>();
  private issueTree = new RBush<BBoxItem<LocalIssue>>();

  public setAssets(assets: LocalAsset[]): void {
    this.assetTree.clear();
    const items: BBoxItem<LocalAsset>[] = assets.map((asset) => ({
      minX: asset.longitude,
      minY: asset.latitude,
      maxX: asset.longitude,
      maxY: asset.latitude,
      data: asset,
    }));
    this.assetTree.load(items);
  }

  public setIssues(issues: LocalIssue[]): void {
    this.issueTree.clear();
    const items: BBoxItem<LocalIssue>[] = issues.map((issue) => ({
      minX: issue.longitude,
      minY: issue.latitude,
      maxX: issue.longitude,
      maxY: issue.latitude,
      data: issue,
    }));
    this.issueTree.load(items);
  }

  public searchAssets(bbox: BoundingBox): LocalAsset[] {
    const results = this.assetTree.search({
      minX: bbox.minLng,
      minY: bbox.minLat,
      maxX: bbox.maxLng,
      maxY: bbox.maxLat,
    });
    return results.map((item: BBoxItem<LocalAsset>) => item.data);
  }

  public searchIssues(bbox: BoundingBox): LocalIssue[] {
    const results = this.issueTree.search({
      minX: bbox.minLng,
      minY: bbox.minLat,
      maxX: bbox.maxLng,
      maxY: bbox.maxLat,
    });
    return results.map((item: BBoxItem<LocalIssue>) => item.data);
  }
}

export const spatialIndex = new SpatialIndexManager();
