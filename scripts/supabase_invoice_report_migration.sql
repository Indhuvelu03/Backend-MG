-- Run once in Supabase SQL Editor for existing projects.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extracted_items JSONB DEFAULT '[]';
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS report_url TEXT;
