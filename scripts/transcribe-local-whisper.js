// src/scripts/transcribe-local-whisper.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Complaint } from '../models/Complaint.js';
import * as s3Service from '../services/s3.service.js';
import { env } from '../config/env.js';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function transcribeLocalWhisper() {
  console.log('🚀 Transcribing with local whisper-node...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const complaintId = '6a672597b3236bb35e4fb2d9';
    const complaint = await Complaint.findById(complaintId);
    
    if (!complaint) {
      console.error('❌ Complaint not found');
      return;
    }

    console.log(`📝 Complaint: ${complaint._id}`);
    console.log(`   Vehicle: ${complaint.vehicleNumber}`);

    // Download audio
    let s3Key;
    if (complaint.audioUrl.includes('cloudfront.net')) {
      s3Key = complaint.audioUrl.split('cloudfront.net/')[1];
    } else {
      const parsedUrl = new URL(complaint.audioUrl);
      s3Key = decodeURIComponent(parsedUrl.pathname.substring(1));
    }
    console.log(`   🔑 S3 Key: ${s3Key}`);

    console.log(`   📥 Downloading from S3...`);
    const audioBuffer = await s3Service.downloadFileBuffer(s3Key);
    console.log(`   ✅ Downloaded: ${audioBuffer.length} bytes`);

    // Save to temp file
    const tempFile = path.join(os.tmpdir(), `audio_${Date.now()}.ogg`);
    fs.writeFileSync(tempFile, audioBuffer);
    console.log(`   💾 Saved to: ${tempFile}`);

    // ✅ Use whisper-node for local transcription
    console.log(`   🎤 Running local whisper-node...`);
    
    // Import whisper-node
    const whisper = await import('whisper-node');
    
    // Transcribe using local model
    const result = await whisper.default.transcribe(tempFile);
    
    console.log(`   ✅ Transcription successful!`);
    console.log(`   📝 Transcript: ${result.text.substring(0, 200)}...`);
    console.log(`   📏 Length: ${result.text.length}`);

    // Update complaint
    complaint.transcript = result.text;
    complaint.language = 'en';
    complaint.status = 'TRANSCRIBED';
    complaint.updatedAt = new Date();
    await complaint.save();

    // Clean up
    fs.unlinkSync(tempFile);

    console.log(`\n✅ Complaint updated successfully!`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

transcribeLocalWhisper();