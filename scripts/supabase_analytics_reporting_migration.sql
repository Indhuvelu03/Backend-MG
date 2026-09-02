-- AutoAudit AI management analytics lifecycle timestamps.
-- Run after supabase_operations_migration.sql. Safe to run repeatedly.

BEGIN;

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rating INTEGER,
  ADD COLUMN IF NOT EXISTS service_status TEXT NOT NULL DEFAULT 'COMPLAINT_RECEIVED';

-- Keep ratings suitable for reporting and customer satisfaction metrics.
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_rating_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_rating_check
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- Normalize any legacy lifecycle values before applying the new constraint.
UPDATE complaints
SET service_status = CASE
  WHEN upper(service_status) IN (
    'COMPLAINT_RECEIVED',
    'UNDER_REVIEW',
    'SERVICE_STARTED',
    'INVOICE_UPLOADED',
    'AUDIT_COMPLETE',
    'RESOLVED'
  ) THEN upper(service_status)
  WHEN upper(service_status) IN ('PENDING', 'OPEN', 'NEW') THEN 'COMPLAINT_RECEIVED'
  WHEN upper(service_status) IN ('IN_PROGRESS', 'PROCESSING') THEN 'UNDER_REVIEW'
  WHEN upper(service_status) IN ('COMPLETED', 'CLOSED') THEN 'RESOLVED'
  ELSE 'COMPLAINT_RECEIVED'
END;

ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_service_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_service_status_check
  CHECK (service_status IN (
    'COMPLAINT_RECEIVED',
    'UNDER_REVIEW',
    'SERVICE_STARTED',
    'INVOICE_UPLOADED',
    'AUDIT_COMPLETE',
    'RESOLVED'
  ));

-- Backfill analytics timestamps for records created before this migration.
UPDATE complaints
SET resolved_at = COALESCE(updated_at, created_at)
WHERE service_status = 'RESOLVED'
  AND resolved_at IS NULL;

UPDATE complaints
SET rated_at = COALESCE(updated_at, created_at)
WHERE rating IS NOT NULL
  AND rated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_dealership_service_status
  ON complaints(dealership_id, service_status);

CREATE INDEX IF NOT EXISTS idx_complaints_dealership_resolved
  ON complaints(dealership_id, resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_dealership_rated
  ON complaints(dealership_id, rated_at DESC)
  WHERE rated_at IS NOT NULL;

COMMIT;
