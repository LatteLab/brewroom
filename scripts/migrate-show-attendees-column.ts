/**
 * One-time migration: add `show_attendees_pre_registration` column to events table.
 * Usage: npx tsx scripts/migrate-show-attendees-column.ts
 */

import { loadEnvConfig } from '@next/env';
import * as path from 'path';

loadEnvConfig(path.join(__dirname, '..'));

async function main() {
  const { db } = await import('../lib/db/index.js');
  const { sql } = await import('drizzle-orm');

  await db.execute(sql`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS show_attendees_pre_registration BOOLEAN NOT NULL DEFAULT TRUE
  `);

  console.log('Migration applied: events.show_attendees_pre_registration');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
