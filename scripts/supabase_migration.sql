-- ═══════════════════════════════════════════════════════════════════════════════
-- AutoAudit AI — Supabase PostgreSQL Migration
-- Run this entire script in: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TABLES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password      TEXT NOT NULL,
  role          TEXT CHECK (role IN ('ADMIN', 'STAFF')) DEFAULT 'STAFF',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  mobile         TEXT NOT NULL,
  email          TEXT,
  vehicle_number TEXT UNIQUE NOT NULL,
  vehicle_model  TEXT NOT NULL,
  service_center TEXT NOT NULL,
  service_date   TIMESTAMPTZ NOT NULL,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback_links (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token            TEXT UNIQUE NOT NULL,
  status           TEXT CHECK (status IN ('PENDING', 'SUBMITTED', 'EXPIRED')) DEFAULT 'PENDING',
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  sent_via_email   BOOLEAN DEFAULT false,
  sent_via_sms     BOOLEAN DEFAULT false,
  sent_via_whatsapp BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complaints (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  feedback_link_id   UUID REFERENCES feedback_links(id),
  vehicle_number     TEXT NOT NULL,
  audio_url          TEXT,
  transcript         TEXT,
  language           TEXT,
  confidence_score   NUMERIC(5,2),
  transcript_flagged BOOLEAN DEFAULT false,
  status             TEXT CHECK (status IN (
    'AUDIO_UPLOADED','TRANSCRIBING','TRANSCRIBED','NEEDS_REVIEW','COMPARED','FAILED'
  )) DEFAULT 'AUDIO_UPLOADED',
  error              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id      UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  file_url          TEXT NOT NULL,
  extracted_text    TEXT,
  extracted_items   JSONB DEFAULT '[]',
  extraction_method TEXT CHECK (extraction_method IN ('DIGITAL','OCR')) DEFAULT 'DIGITAL',
  uploaded_by       UUID REFERENCES users(id),
  status            TEXT CHECK (status IN ('UPLOADED','EXTRACTING','EXTRACTED','FAILED')) DEFAULT 'UPLOADED',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comparisons (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id        UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES invoices(id),
  matched_issues      JSONB DEFAULT '[]',
  missing_issues      JSONB DEFAULT '[]',
  extra_invoice_items JSONB DEFAULT '[]',
  score               NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  status              TEXT CHECK (status IN ('FULL_MATCH','PARTIAL_MATCH','MISMATCH')) NOT NULL,
  summary             TEXT NOT NULL,
  report_url          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  record_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  changed_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_customers_vehicle   ON customers(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_customers_mobile    ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_created   ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_token         ON feedback_links(token);
CREATE INDEX IF NOT EXISTS idx_links_customer      ON feedback_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_links_status        ON feedback_links(status);
CREATE INDEX IF NOT EXISTS idx_links_expires       ON feedback_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_complaints_customer ON complaints(customer_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status   ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created  ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_complaint  ON invoices(complaint_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_comparisons_complaint ON comparisons(complaint_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_action  ON audit_logs(table_name, action);

-- ─── AUDIT TRIGGER (Step 8 — auto-log every INSERT/UPDATE/DELETE) ─────────────

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, action, record_id, new_values)
    VALUES (TG_TABLE_NAME, 'INSERT', (NEW.id)::UUID, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, action, record_id, old_values, new_values)
    VALUES (TG_TABLE_NAME, 'UPDATE', (NEW.id)::UUID, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, action, record_id, old_values)
    VALUES (TG_TABLE_NAME, 'DELETE', (OLD.id)::UUID, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_customers ON customers;
CREATE TRIGGER audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_feedback_links ON feedback_links;
CREATE TRIGGER audit_feedback_links
  AFTER INSERT OR UPDATE OR DELETE ON feedback_links
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_complaints ON complaints;
CREATE TRIGGER audit_complaints
  AFTER INSERT OR UPDATE OR DELETE ON complaints
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_invoices ON invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_comparisons ON comparisons;
CREATE TRIGGER audit_comparisons
  AFTER INSERT OR UPDATE OR DELETE ON comparisons
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ─── TOKEN EXPIRY FUNCTION (Step 7 — run via pg_cron every hour) ─────────────

CREATE OR REPLACE FUNCTION expire_feedback_links()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE feedback_links
  SET status = 'EXPIRED'
  WHERE status = 'PENDING' AND expires_at < NOW();
END;
$$;

-- ─── updated_at AUTO-UPDATE TRIGGER ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_complaints_updated_at ON complaints;
CREATE TRIGGER set_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist so this script is 100% re-runnable
DROP POLICY IF EXISTS "service_role_all_users"          ON users;
DROP POLICY IF EXISTS "service_role_all_customers"      ON customers;
DROP POLICY IF EXISTS "service_role_all_links"          ON feedback_links;
DROP POLICY IF EXISTS "service_role_all_complaints"     ON complaints;
DROP POLICY IF EXISTS "service_role_all_invoices"       ON invoices;
DROP POLICY IF EXISTS "service_role_all_comparisons"    ON comparisons;
DROP POLICY IF EXISTS "service_role_all_audit"          ON audit_logs;
DROP POLICY IF EXISTS "anon_read_links"                 ON feedback_links;
DROP POLICY IF EXISTS "anon_read_customers"             ON customers;
DROP POLICY IF EXISTS "anon_insert_complaints"          ON complaints;
DROP POLICY IF EXISTS "anon_update_links"               ON feedback_links;

-- Service role has full access (backend uses service_role key)
CREATE POLICY "service_role_all_users"          ON users          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_customers"      ON customers      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_links"          ON feedback_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_complaints"     ON complaints     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_invoices"       ON invoices       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_comparisons"    ON comparisons    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_audit"          ON audit_logs     FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon can read feedback_links + customers (for public feedback page)
CREATE POLICY "anon_read_links"     ON feedback_links FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_customers" ON customers      FOR SELECT TO anon USING (true);
-- Anon can submit complaints (customer submits voice feedback)
CREATE POLICY "anon_insert_complaints" ON complaints FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_links"   ON feedback_links FOR UPDATE TO anon USING (true) WITH CHECK (true);
