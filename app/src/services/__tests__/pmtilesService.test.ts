import { describe, it, expect } from 'vitest';
import {
  parsePMTilesHeader,
  zxyToTileId,
  findTileEntry,
  IndexedDbPMTilesSource,
  type PMTilesEntry,
} from '../pmtilesService';

describe('pmtilesService', () => {
  describe('parsePMTilesHeader', () => {
    it('throws error for buffers smaller than 127 bytes', () => {
      const buffer = new ArrayBuffer(50);
      expect(() => parsePMTilesHeader(buffer)).toThrow(/at least 127 bytes/);
    });

    it('throws error for invalid magic bytes', () => {
      const buffer = new ArrayBuffer(127);
      const view = new DataView(buffer);
      view.setUint8(0, 0x58); // 'X'
      expect(() => parsePMTilesHeader(buffer)).toThrow(/Invalid PMTiles magic bytes/);
    });

    it('correctly parses a valid PMTiles v3 binary header', () => {
      const buffer = new ArrayBuffer(127);
      const view = new DataView(buffer);

      // Magic: 'P', 'M', 'T', 'i'
      view.setUint8(0, 0x50);
      view.setUint8(1, 0x4d);
      view.setUint8(2, 0x54);
      view.setUint8(3, 0x69);
      // Version: 3
      view.setUint8(4, 3);

      // Root directory offset & length (little endian BigInt)
      view.setBigUint64(7, 127n, true);
      view.setBigUint64(15, 1024n, true);

      // Min/Max Zoom
      view.setUint8(97, 5);
      view.setUint8(98, 15);

      // MinLon, MinLat, MaxLon, MaxLat (scaled 1e7)
      view.setInt32(99, 825000000, true); // 82.5
      view.setInt32(103, 250000000, true); // 25.0
      view.setInt32(107, 835000000, true); // 83.5
      view.setInt32(111, 260000000, true); // 26.0

      const header = parsePMTilesHeader(buffer);
      expect(header.specVersion).toBe(3);
      expect(header.rootDirectoryOffset).toBe(127);
      expect(header.rootDirectoryLength).toBe(1024);
      expect(header.minZoom).toBe(5);
      expect(header.maxZoom).toBe(15);
      expect(header.minLon).toBeCloseTo(82.5);
      expect(header.minLat).toBeCloseTo(25.0);
      expect(header.maxLon).toBeCloseTo(83.5);
      expect(header.maxLat).toBeCloseTo(26.0);
    });
  });

  describe('zxyToTileId', () => {
    it('calculates root tile id 0 at zoom 0', () => {
      expect(zxyToTileId(0, 0, 0)).toBe(0);
    });

    it('calculates unique IDs for zoom 1 tiles', () => {
      const id00 = zxyToTileId(1, 0, 0);
      const id10 = zxyToTileId(1, 1, 0);
      const id11 = zxyToTileId(1, 1, 1);
      const id01 = zxyToTileId(1, 0, 1);

      expect(id00).toBeGreaterThan(0);
      expect(new Set([id00, id10, id11, id01]).size).toBe(4);
    });
  });

  describe('findTileEntry', () => {
    const entries: PMTilesEntry[] = [
      { tileId: 10, offset: 500, length: 120, runLength: 1 },
      { tileId: 15, offset: 620, length: 200, runLength: 3 }, // covers 15, 16, 17
      { tileId: 25, offset: 820, length: 150, runLength: 1 },
    ];

    it('finds exact tile matching tileId', () => {
      const found = findTileEntry(entries, 10);
      expect(found).not.toBeNull();
      expect(found?.offset).toBe(500);
    });

    it('finds tile inside a run-length span', () => {
      const found16 = findTileEntry(entries, 16);
      expect(found16).not.toBeNull();
      expect(found16?.tileId).toBe(15);
      expect(found16?.offset).toBe(620);
    });

    it('returns null when tile is not indexed', () => {
      expect(findTileEntry(entries, 12)).toBeNull();
      expect(findTileEntry(entries, 99)).toBeNull();
    });
  });

  describe('IndexedDbPMTilesSource', () => {
    it('fetches zero-copy byte slices accurately', async () => {
      const sampleData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
      const blob = new Blob([sampleData]);
      const source = new IndexedDbPMTilesSource('test_pkg', blob);

      const resp = await source.getBytes(2, 4);
      const sliceBytes = new Uint8Array(resp.data);
      expect(sliceBytes.length).toBe(4);
      expect(Array.from(sliceBytes)).toEqual([30, 40, 50, 60]);
    });

    it('throws error when range is outside blob bounds', async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])]);
      const source = new IndexedDbPMTilesSource('test_pkg', blob);
      await expect(source.getBytes(2, 10)).rejects.toThrow(/Out of range/);
    });
  });
});
