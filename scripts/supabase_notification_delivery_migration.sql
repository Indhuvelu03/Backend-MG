-- AutoAudit AI multi-channel notification delivery tracking.
-- Safe to run repeatedly. It creates email_activities when an older database
-- does not yet contain the original email activity migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS email_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  dealership_id UUID,
  customer_name TEXT NOT NULL DEFAULT 'Customer',
  vehicle_number TEXT NOT NULL DEFAULT '—',
  recipient TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Also repairs partially-created legacy versions of the table.
ALTER TABLE email_activities
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS dealership_id UUID,
  ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT 'Customer',
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT NOT NULL DEFAULT '—',
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS detail TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_error_code TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS job_name TEXT,
  ADD COLUMN IF NOT EXISTS job_data JSONB;

-- Add foreign keys only when the referenced tables exist. This keeps the
-- migration usable on both older demo databases and the hardened schema.
DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.email_activities'::regclass
         AND conname = 'email_activities_customer_id_fkey'
     ) THEN
    ALTER TABLE email_activities
      ADD CONSTRAINT email_activities_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.dealerships') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.email_activities'::regclass
         AND conname = 'email_activities_dealership_id_fkey'
     ) THEN
    ALTER TABLE email_activities
      ADD CONSTRAINT email_activities_dealership_id_fkey
      FOREIGN KEY (dealership_id) REFERENCES dealerships(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_activities_sent_at_idx
  ON email_activities(sent_at DESC);
CREATE INDEX IF NOT EXISTS email_activities_customer_id_idx
  ON email_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_activities_dealership_sent_at
  ON email_activities(dealership_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_activities_provider_message_id
  ON email_activities(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_activities_delivery_status
  ON email_activities(dealership_id, provider_status, sent_at DESC);

ALTER TABLE email_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_email_activities ON email_activities;
CREATE POLICY service_role_all_email_activities
  ON email_activities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON COLUMN email_activities.provider_status IS
  'Latest provider lifecycle state: queued, sent, delivered, read, failed, or undelivered.';
