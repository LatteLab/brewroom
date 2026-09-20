/**
 * One-time migration: add post-event photo albums and align lottery_history
 * with the Drizzle schema's (user_id, event_id) upsert target.
 *
 * Usage: npx tsx scripts/migrate-event-photos.ts
 */

import { loadEnvConfig } from '@next/env';
import * as path from 'path';

loadEnvConfig(path.join(__dirname, '..'));

async function main() {
  const { db } = await import('../lib/db/index.js');
  const { sql } = await import('drizzle-orm');

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = cols.attnum
        WHERE c.contype = 'u'
          AND c.conrelid = 'public.lottery_history'::regclass
        GROUP BY c.oid
        HAVING array_agg(a.attname::text ORDER BY cols.ord) = ARRAY['user_id', 'event_id']::text[]
      ) THEN
        ALTER TABLE public.lottery_history
        ADD CONSTRAINT lottery_history_user_event_unique UNIQUE (user_id, event_id);
      END IF;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.event_photos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
      storage_path text NOT NULL UNIQUE,
      public_url text NOT NULL,
      caption text,
      uploaded_by text NOT NULL REFERENCES public.users(id),
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS event_photos_event_id_idx
    ON public.event_photos (event_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS event_photos_event_order_idx
    ON public.event_photos (event_id, sort_order, created_at)
  `);

  // RLS: event_photos must NOT be writable via the anon/authenticated Supabase REST API.
  // Server-side Drizzle uses the postgres role which bypasses RLS, so this is purely defensive
  // against the public anon key being misused. Same pattern as other server-only tables.
  await db.execute(sql`ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY`);
  await db.execute(sql`REVOKE ALL ON public.event_photos FROM anon, authenticated`);

  await db.execute(sql`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'event-photos',
      'event-photos',
      true,
      10485760,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'event_photos_public_read'
      ) THEN
        CREATE POLICY event_photos_public_read
        ON storage.objects
        FOR SELECT
        TO anon
        USING (bucket_id = 'event-photos');
      END IF;

      DROP POLICY IF EXISTS event_photos_anon_upload ON storage.objects;
      DROP POLICY IF EXISTS event_photos_anon_delete ON storage.objects;
    END $$;
  `);

  console.log('Migration applied: event_photos table, event-photos bucket, lottery_history unique constraint, storage write policies locked down');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
