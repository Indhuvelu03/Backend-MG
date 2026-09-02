-- AutoAudit AI: tenancy and role hardening
-- Run once in Supabase SQL Editor before deploying the matching backend code.
-- This script is safe to re-run and preserves existing data.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure the tenancy root exists. Existing one-dealer demo data is assigned
-- to this branch; create real dealership branches through the application after.
CREATE TABLE IF NOT EXISTS dealerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL,
  manager_email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO dealerships (name, code, city)
SELECT 'Default Dealership', 'DEFAULT', 'Unassigned'
WHERE NOT EXISTS (SELECT 1 FROM dealerships);

-- Older installations may not have run the original email activity migration.
CREATE TABLE IF NOT EXISTS email_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL DEFAULT 'Customer',
  vehicle_number TEXT NOT NULL DEFAULT '—',
  recipient TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Every business record carries the dealership that owns it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE feedback_links ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE email_activities ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE service_centers ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE RESTRICT;

-- ADD COLUMN IF NOT EXISTS does not add a foreign key when an older table
-- already has the column, so repair those constraints explicitly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_activities'::regclass
      AND conname = 'email_activities_customer_id_fkey'
  ) THEN
    ALTER TABLE email_activities
      ADD CONSTRAINT email_activities_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_activities'::regclass
      AND conname = 'email_activities_dealership_id_fkey'
  ) THEN
    ALTER TABLE email_activities
      ADD CONSTRAINT email_activities_dealership_id_fkey
      FOREIGN KEY (dealership_id) REFERENCES dealerships(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE default_dealership UUID;
BEGIN
  SELECT id INTO default_dealership FROM dealerships ORDER BY created_at ASC LIMIT 1;

  UPDATE customers SET dealership_id = default_dealership WHERE dealership_id IS NULL;
  UPDATE feedback_links fl
    SET dealership_id = c.dealership_id
    FROM customers c
    WHERE fl.customer_id = c.id AND fl.dealership_id IS NULL;
  UPDATE complaints co
    SET dealership_id = c.dealership_id
    FROM customers c
    WHERE co.customer_id = c.id AND co.dealership_id IS NULL;
  UPDATE invoices i
    SET dealership_id = co.dealership_id
    FROM complaints co
    WHERE i.complaint_id = co.id AND i.dealership_id IS NULL;
  UPDATE comparisons cp
    SET dealership_id = co.dealership_id
    FROM complaints co
    WHERE cp.complaint_id = co.id AND cp.dealership_id IS NULL;
  UPDATE email_activities ea
    SET dealership_id = c.dealership_id
    FROM customers c
    WHERE ea.customer_id = c.id AND ea.dealership_id IS NULL;
  -- Older system/email-test records may not be linked to a customer. Keep the
  -- historical log while assigning it to the safe default tenancy bucket.
  UPDATE email_activities
    SET dealership_id = default_dealership
    WHERE dealership_id IS NULL;
  UPDATE service_centers SET dealership_id = default_dealership WHERE dealership_id IS NULL;
END $$;

-- 3. Dealership manager is an explicit role; it is never inferred from email.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'DEALER', 'STAFF'));

-- 4. A vehicle number can repeat in different dealerships, but never within one.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_vehicle_number_key;
DROP INDEX IF EXISTS customers_vehicle_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_dealership_vehicle_unique
  ON customers (dealership_id, upper(vehicle_number));

-- 5. Query paths used by the API and automation workers.
CREATE INDEX IF NOT EXISTS idx_users_dealership ON users(dealership_id);
CREATE INDEX IF NOT EXISTS idx_customers_dealership ON customers(dealership_id);
CREATE INDEX IF NOT EXISTS idx_feedback_links_dealership ON feedback_links(dealership_id);
CREATE INDEX IF NOT EXISTS idx_complaints_dealership ON complaints(dealership_id);
CREATE INDEX IF NOT EXISTS idx_invoices_dealership ON invoices(dealership_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_dealership ON comparisons(dealership_id);
CREATE INDEX IF NOT EXISTS idx_email_activities_dealership_sent_at
  ON email_activities(dealership_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_centers_dealership ON service_centers(dealership_id);

-- 6. Prevent future tenantless operational data. User dealership remains
-- nullable because platform admins are intentionally global.
ALTER TABLE customers ALTER COLUMN dealership_id SET NOT NULL;
ALTER TABLE feedback_links ALTER COLUMN dealership_id SET NOT NULL;
ALTER TABLE complaints ALTER COLUMN dealership_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN dealership_id SET NOT NULL;
ALTER TABLE comparisons ALTER COLUMN dealership_id SET NOT NULL;
ALTER TABLE email_activities ALTER COLUMN dealership_id SET NOT NULL;

-- Check after running:
-- SELECT dealership_id, COUNT(*) FROM customers GROUP BY dealership_id;
-- SELECT dealership_id, COUNT(*) FROM complaints GROUP BY dealership_id;
