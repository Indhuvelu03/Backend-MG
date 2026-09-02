-- AutoAudit AI: authentication, privacy, and private-storage hardening
-- Run after supabase_multitenant_security_migration.sql.
-- Re-runnable. Existing users will be signed out after the backend is deployed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS voice_consent_at TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS privacy_notice_version TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;

UPDATE complaints SET retention_until = COALESCE(created_at, NOW()) + INTERVAL '365 days' WHERE retention_until IS NULL;
UPDATE invoices SET retention_until = COALESCE(created_at, NOW()) + INTERVAL '2555 days' WHERE retention_until IS NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dealership_id UUID REFERENCES dealerships(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_active ON password_reset_tokens(token_hash, expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_dealership_created ON security_events(dealership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_retention ON complaints(retention_until) WHERE audio_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_retention ON invoices(retention_until) WHERE file_url IS NOT NULL;

-- The backend exclusively uses the service-role key. Browser clients must use
-- token-protected API routes and must never query customer tables directly.
DROP POLICY IF EXISTS "anon_read_links" ON feedback_links;
DROP POLICY IF EXISTS "anon_read_customers" ON customers;
DROP POLICY IF EXISTS "anon_insert_complaints" ON complaints;
DROP POLICY IF EXISTS "anon_update_links" ON feedback_links;

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_auth_sessions" ON auth_sessions;
DROP POLICY IF EXISTS "service_role_all_password_reset_tokens" ON password_reset_tokens;
DROP POLICY IF EXISTS "service_role_all_security_events" ON security_events;
CREATE POLICY "service_role_all_auth_sessions" ON auth_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_password_reset_tokens" ON password_reset_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_security_events" ON security_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Private buckets: old public URLs stop working. The backend creates short-lived
-- signed URLs only after staff authentication; customer reports use tracking tokens.
UPDATE storage.buckets
SET public = false
WHERE id IN ('audio-complaints', 'invoice-pdfs');

-- Remove any object policies that explicitly granted access to these two app
-- buckets. Service-role backend access is unaffected by RLS.
DO $$
DECLARE policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%audio-complaints%'
        OR COALESCE(qual, '') ILIKE '%invoice-pdfs%'
        OR COALESCE(with_check, '') ILIKE '%audio-complaints%'
        OR COALESCE(with_check, '') ILIKE '%invoice-pdfs%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
  END LOOP;
END $$;

-- Purge expired reset tokens and sessions without touching business records.
CREATE OR REPLACE FUNCTION cleanup_expired_security_tokens()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day' OR used_at IS NOT NULL;
  DELETE FROM auth_sessions WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Verification
-- SELECT id, public FROM storage.buckets WHERE id IN ('audio-complaints','invoice-pdfs');
-- SELECT COUNT(*) FROM auth_sessions;
