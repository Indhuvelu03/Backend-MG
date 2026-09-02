-- Run this in Supabase SQL Editor to add missing columns to service_centers table:
ALTER TABLE service_centers ADD COLUMN IF NOT EXISTS dealership_id UUID;
ALTER TABLE service_centers ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE service_centers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE service_centers ADD COLUMN IF NOT EXISTS manager_email TEXT;
