import { db, type LocalAsset, type LocalIssue } from '../db';

export async function initializeLocalSeedData(): Promise<void> {
  try {
    const assetCount = await db.assets.count();
    if (assetCount === 0) {
      const seedModule = await import('../data/seed_pilot_ward.json');
      const seedData = seedModule.default || seedModule;
      await db.assets.bulkPut(seedData.assets as LocalAsset[]);
      await db.issues.bulkPut(seedData.issues as LocalIssue[]);
      console.log('IndexedDB initialized with 20 geotagged assets & 6 issues for Ward 3.');
    }
  } catch (err) {
    console.error('Error initializing local seed data:', err);
  }
}
