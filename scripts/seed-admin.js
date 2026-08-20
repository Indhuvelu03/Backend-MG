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
  console.log('🚀 Starting admin seeding...');
  console.log(`📡 Connecting to Supabase: ${process.env.SUPABASE_URL}`);

  // ── Check if admin already exists ──────────────────────────────────────────
  const { data: existing } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('email', 'admin@autoaudit.in')
    .maybeSingle();

  if (existing) {
    console.log('ℹ️  Admin user already exists:');
    console.log(`   Email : ${existing.email}`);
    console.log(`   Role  : ${existing.role}`);
    console.log('✅ Nothing to do.');
    process.exit(0);
  }

  // ── Hash password ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@123456', 10);

  // ── Insert admin ────────────────────────────────────────────────────────────
  const { data: admin, error: adminErr } = await supabase
    .from('users')
    .insert({
      name: 'System Administrator',
      email: 'admin@autoaudit.in',
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
  console.log(`   Email    : admin@autoaudit.in`);
  console.log(`   Password : Admin@123456`);
  console.log(`   Role     : ADMIN`);

  // ── Insert staff ────────────────────────────────────────────────────────────
  const { data: existingStaff } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'staff@autoaudit.in')
    .maybeSingle();

  if (!existingStaff) {
    const staffHash = await bcrypt.hash('Staff@123456', 10);
    const { error: staffErr } = await supabase
      .from('users')
      .insert({
        name: 'Service Advisor',
        email: 'staff@autoaudit.in',
        password: staffHash,
        role: 'STAFF',
        is_active: true,
      });

    if (staffErr) {
      console.warn('⚠️  Staff user not created:', staffErr.message);
    } else {
      console.log('✅ Staff user created:');
      console.log(`   Email    : staff@autoaudit.in`);
      console.log(`   Password : Staff@123456`);
      console.log(`   Role     : STAFF`);
    }
  }

  console.log('\n🎉 Seeding complete! You can now log in at your Vercel URL.');
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});