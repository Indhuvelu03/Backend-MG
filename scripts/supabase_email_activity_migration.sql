CREATE TABLE IF NOT EXISTS email_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  recipient TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_activities_sent_at_idx ON email_activities (sent_at DESC);
CREATE INDEX IF NOT EXISTS email_activities_customer_id_idx ON email_activities (customer_id);
