CREATE TABLE IF NOT EXISTS service_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  location TEXT NOT NULL,
  manager_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE service_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_service_centers" ON service_centers;
CREATE POLICY "service_role_all_service_centers" ON service_centers FOR ALL TO service_role USING (true) WITH CHECK (true);
