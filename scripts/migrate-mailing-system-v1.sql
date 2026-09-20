-- ============================================================================
-- Latte Lab mailing system v1 + event photo album migration
-- Safe to re-run. Intended for Supabase SQL Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Event lifecycle additions.
ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS show_attendees_pre_registration boolean NOT NULL DEFAULT true;

-- Email enums.
DO $$ BEGIN
  CREATE TYPE email_outbox_kind AS ENUM ('transactional', 'blast', 'forwarded_reply');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE email_outbox_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'bounced', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inbound_threading_source AS ENUM ('reply_address', 'in_reply_to', 'references', 'manual', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inbound_forward_status AS ENUM ('not_attempted', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- lottery_history must match the Drizzle upsert target.
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

-- Outbound audit/retry queue.
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind email_outbox_kind NOT NULL,
  template text,
  template_version integer NOT NULL DEFAULT 1,
  recipient_user_id text,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  payload json NOT NULL,
  reply_address text,
  message_id text,
  status email_outbox_status NOT NULL DEFAULT 'queued',
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  idempotency_key text,
  related_event_id uuid,
  related_registration_id uuid,
  related_blast_id uuid,
  reply_to_inbound_id uuid,
  extra_headers json,
  scheduled_for timestamp NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp,
  locked_at timestamp,
  sent_at timestamp,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS reply_to_inbound_id uuid,
  ADD COLUMN IF NOT EXISTS extra_headers json;

-- Convert old partial idempotency index to a normal unique constraint so
-- INSERT ... ON CONFLICT (idempotency_key) works.
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_idempotency_key_idx;
DROP INDEX IF EXISTS public.email_outbox_idempotency_key_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.email_outbox'::regclass
      AND contype = 'u'
      AND conname = 'email_outbox_idempotency_key_key'
  ) THEN
    ALTER TABLE public.email_outbox
      ADD CONSTRAINT email_outbox_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- Drop both observed FK naming styles before recreating with ON DELETE SET NULL.
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_recipient_user_id_fkey;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_recipient_user_id_users_id_fk;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_related_event_id_fkey;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_related_event_id_events_id_fk;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_related_registration_id_fkey;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_related_registration_id_event_registrations_id_fk;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_related_blast_id_fkey;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_related_blast_id_email_blasts_id_fk;

DO $$ BEGIN
  ALTER TABLE public.email_outbox
    ADD CONSTRAINT email_outbox_recipient_user_id_fkey
    FOREIGN KEY (recipient_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_outbox
    ADD CONSTRAINT email_outbox_related_event_id_fkey
    FOREIGN KEY (related_event_id) REFERENCES public.events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_outbox
    ADD CONSTRAINT email_outbox_related_registration_id_fkey
    FOREIGN KEY (related_registration_id) REFERENCES public.event_registrations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_outbox
    ADD CONSTRAINT email_outbox_related_blast_id_fkey
    FOREIGN KEY (related_blast_id) REFERENCES public.email_blasts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS email_outbox_drain_idx
  ON public.email_outbox(status, scheduled_for);

CREATE INDEX IF NOT EXISTS email_outbox_provider_message_id_idx
  ON public.email_outbox(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_outbox_recipient_idx
  ON public.email_outbox(recipient_user_id, created_at);

CREATE INDEX IF NOT EXISTS email_outbox_template_idx
  ON public.email_outbox(template, created_at);

CREATE INDEX IF NOT EXISTS email_outbox_related_event_idx
  ON public.email_outbox(related_event_id);

CREATE INDEX IF NOT EXISTS email_outbox_reply_to_inbound_idx
  ON public.email_outbox(reply_to_inbound_id)
  WHERE reply_to_inbound_id IS NOT NULL;

-- Inbound email audit log.
CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_email_id text NOT NULL UNIQUE,
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL,
  subject text,
  body_text text,
  body_html text,
  headers json,
  attachments_meta json,
  message_id text,
  in_reply_to text,
  "references" text,
  threading_source inbound_threading_source NOT NULL DEFAULT 'none',
  reply_to_outbox_id uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  reply_to_blast_id uuid REFERENCES public.email_blasts(id) ON DELETE SET NULL,
  related_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  related_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  forwarded_to text,
  forward_status inbound_forward_status NOT NULL DEFAULT 'not_attempted',
  forwarded_at timestamp,
  raw_payload json,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_reply_to_inbound_fk;
ALTER TABLE public.email_outbox DROP CONSTRAINT IF EXISTS email_outbox_reply_to_inbound_id_fkey;

DO $$ BEGIN
  ALTER TABLE public.email_outbox
    ADD CONSTRAINT email_outbox_reply_to_inbound_fk
    FOREIGN KEY (reply_to_inbound_id) REFERENCES public.inbound_emails(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS inbound_emails_outbox_idx
  ON public.inbound_emails(reply_to_outbox_id)
  WHERE reply_to_outbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inbound_emails_blast_idx
  ON public.inbound_emails(reply_to_blast_id)
  WHERE reply_to_blast_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inbound_emails_event_idx
  ON public.inbound_emails(related_event_id, created_at);

CREATE INDEX IF NOT EXISTS inbound_emails_from_idx
  ON public.inbound_emails(from_email, created_at);

-- Per-event email reminder rules + sent guards.
CREATE TABLE IF NOT EXISTS public.event_email_reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  offset_minutes integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (event_id, offset_minutes)
);

CREATE TABLE IF NOT EXISTS public.event_email_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  offset_minutes integer NOT NULL,
  outbox_id uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  sent_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (registration_id, offset_minutes)
);

INSERT INTO public.event_email_reminder_rules (event_id, offset_minutes, enabled)
SELECT id, 1440, true
FROM public.events e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.event_email_reminder_rules r
  WHERE r.event_id = e.id
    AND r.offset_minutes = 1440
);

-- Existing blast system keeps its own recipient table, but gets a message_id column
-- for optional reply threading fallback.
ALTER TABLE public.email_blasts
  ADD COLUMN IF NOT EXISTS message_id text;

CREATE INDEX IF NOT EXISTS email_recipients_resend_email_id_idx
  ON public.email_recipients(resend_email_id)
  WHERE resend_email_id IS NOT NULL;

-- Event photo album metadata.
CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  caption text,
  uploaded_by text NOT NULL REFERENCES public.users(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_photos_event_id_idx
  ON public.event_photos(event_id);

CREATE INDEX IF NOT EXISTS event_photos_event_order_idx
  ON public.event_photos(event_id, sort_order, created_at);

-- Server-only tables: no direct Supabase REST access.
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_email_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_email_reminder_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_outbox FROM anon, authenticated;
REVOKE ALL ON public.inbound_emails FROM anon, authenticated;
REVOKE ALL ON public.event_email_reminder_rules FROM anon, authenticated;
REVOKE ALL ON public.event_email_reminder_sends FROM anon, authenticated;
REVOKE ALL ON public.event_photos FROM anon, authenticated;

-- Supabase Storage bucket for event photos. Public reads, server-only writes.
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
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
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
