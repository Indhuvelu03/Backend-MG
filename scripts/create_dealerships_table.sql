-- Supabase SQL Migration: Create Dealerships Table & Multi-Tenant FKs

CREATE TABLE IF NOT EXISTS dealerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL,
  manager_email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add dealership_id foreign keys to existing system tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE;
ALTER TABLE feedback_links ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE;
ALTER TABLE service_centers ADD COLUMN IF NOT EXISTS dealership_id UUID REFERENCES dealerships(id) ON DELETE CASCADE;
