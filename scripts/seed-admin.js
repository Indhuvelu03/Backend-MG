// scripts/seed-admin.js — Supabase version
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seedAdmin() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running this script.');
    process.exit(1);
  }
  console.log('🚀 Starting admin seeding...');
  console.log(`📡 Connecting to Supabase: ${process.env.SUPABASE_URL}`);

  // ── Check if admin already exists ──────────────────────────────────────────
  const { data: existing } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('email', adminEmail.toLowerCase())
    .maybeSingle();

  if (existing) {
    console.log('ℹ️  Admin user already exists:');
    console.log(`   Email : ${existing.email}`);
    console.log(`   Role  : ${existing.role}`);
    console.log('✅ Nothing to do.');
    return;
  }

  // ── Hash password ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // ── Insert admin ────────────────────────────────────────────────────────────
  const { data: admin, error: adminErr } = await supabase
    .from('users')
    .insert({
      name: 'System Administrator',
      email: adminEmail.toLowerCase(),
      password: passwordHash,
      role: 'ADMIN',
      is_active: true,
    })
    .select('id, name, email, role')
    .single();

  if (adminErr) {
    console.error('❌ Failed to create admin:', adminErr.message);
    process.exit(1);
  }
  console.log('✅ Admin user created:');
  console.log(`   Email    : ${adminEmail}`);
  console.log('   Password : [provided securely through SEED_ADMIN_PASSWORD]');
  console.log(`   Role     : ADMIN`);

  console.log('\nAdmin seeding complete. Create staff through the authenticated admin workflow.');
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
