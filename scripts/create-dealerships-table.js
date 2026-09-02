// scripts/create-dealerships-table.js
// Creates the dealerships table in Supabase if it doesn't exist
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTable() {
  console.log('🚀 Creating dealerships table in Supabase...');

  const sql = `
    CREATE TABLE IF NOT EXISTS public.dealerships (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      code          TEXT NOT NULL UNIQUE,
      city          TEXT NOT NULL,
      manager_email TEXT,
      phone         TEXT,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Index for fast lookups by code
    CREATE INDEX IF NOT EXISTS idx_dealerships_code ON public.dealerships(code);

    -- Auto-update updated_at on row changes
    CREATE OR REPLACE FUNCTION update_dealerships_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_dealerships_updated_at ON public.dealerships;
    CREATE TRIGGER trg_dealerships_updated_at
      BEFORE UPDATE ON public.dealerships
      FOR EACH ROW EXECUTE FUNCTION update_dealerships_updated_at();
  `;

  const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: { message: 'rpc not available' } }));

  if (error) {
    // Fallback: try direct insert to confirm table state
    const { error: selectErr } = await supabase.from('dealerships').select('id').limit(1);
    if (selectErr?.code === 'PGRST205') {
      console.error('❌ Table does not exist. Please run the following SQL in your Supabase SQL Editor:');
      console.log('\n--- COPY & PASTE THIS INTO SUPABASE SQL EDITOR ---\n');
      console.log(`CREATE TABLE IF NOT EXISTS public.dealerships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  city          TEXT NOT NULL,
  manager_email TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dealerships_code ON public.dealerships(code);`);
      console.log('\n---------------------------------------------------\n');
      process.exit(1);
    } else {
      console.log('✅ dealerships table already exists!');
      process.exit(0);
    }
  } else {
    console.log('✅ dealerships table created successfully!');
    process.exit(0);
  }
}

createTable().catch(e => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
