ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5);
CREATE INDEX IF NOT EXISTS comparisons_review_status_idx ON comparisons (review_status);

CREATE TABLE IF NOT EXISTS sla_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (complaint_id, stage)
);
