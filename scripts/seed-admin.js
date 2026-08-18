// src/scripts/seed-admin.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../models/User.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function seedAdmin() {
  console.log('🚀 Starting admin seeding...');
  console.log(`📡 Connecting to MongoDB...`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@example.com' });
    if (existingAdmin) {
      console.log('ℹ️ Admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Active: ${existingAdmin.isActive}`);
      return;
    }

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@example.com',
      password: 'Admin@123456', // Change this in production!
      role: 'ADMIN',
      isActive: true,
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully:');
    console.log(`   Email: admin@example.com`);
    console.log(`   Password: Admin@123456`);
    console.log(`   Role: ADMIN`);

    // Also create a staff user for testing
    const existingStaff = await User.findOne({ email: 'staff@example.com' });
    if (!existingStaff) {
      const staffUser = new User({
        name: 'Staff User',
        email: 'staff@example.com',
        password: 'Staff@123456',
        role: 'STAFF',
        isActive: true,
      });
      await staffUser.save();
      console.log('✅ Staff user created successfully:');
      console.log(`   Email: staff@example.com`);
      console.log(`   Password: Staff@123456`);
      console.log(`   Role: STAFF`);
    }

    console.log('🎉 Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding
seedAdmin();