// src/scripts/test-s3-download.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Complaint } from '../models/Complaint.js';
import * as s3Service from '../services/s3.service.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function testS3Download() {
  console.log('🧪 Testing S3 download...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const complaint = await Complaint.findById('6a672597b3236bb35e4fb2d9');
    if (!complaint) {
      console.error('❌ Complaint not found');
      return;
    }

    console.log(`📝 Complaint: ${complaint._id}`);
    console.log(`   Audio URL: ${complaint.audioUrl}`);

    // Extract S3 key
    let s3Key;
    if (complaint.audioUrl.includes('cloudfront.net')) {
      s3Key = complaint.audioUrl.split('cloudfront.net/')[1];
    } else {
      const parsedUrl = new URL(complaint.audioUrl);
      s3Key = decodeURIComponent(parsedUrl.pathname.substring(1));
    }

    console.log(`   🔑 S3 Key: ${s3Key}`);

    // Test download
    console.log(`   📥 Downloading from S3...`);
    const audioBuffer = await s3Service.downloadFileBuffer(s3Key);
    console.log(`   ✅ Downloaded: ${audioBuffer.length} bytes`);
    console.log(`   ✅ First 100 bytes: ${audioBuffer.slice(0, 100).toString('hex')}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testS3Download();