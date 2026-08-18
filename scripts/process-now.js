// src/scripts/process-now.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Complaint } from '../models/Complaint.js';
import * as s3Service from '../services/s3.service.js';
import * as whisperService from '../services/whisper.service.js';
import huggingfaceService from '../services/huggingface.service.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function processNow() {
  console.log('🚀 Processing complaint immediately...');
  
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
    console.log(`   Audio URL: ${complaint.audioUrl}`);

    // Update status
    complaint.status = "TRANSCRIBING";
    await complaint.save();

    // Extract S3 key
    let s3Key;
    if (complaint.audioUrl.includes('cloudfront.net')) {
      s3Key = complaint.audioUrl.split('cloudfront.net/')[1];
    } else {
      const parsedUrl = new URL(complaint.audioUrl);
      s3Key = decodeURIComponent(parsedUrl.pathname.substring(1));
    }
    console.log(`   🔑 S3 Key: ${s3Key}`);

    // Download audio
    console.log(`   📥 Downloading from S3...`);
    const audioBuffer = await s3Service.downloadFileBuffer(s3Key);
    console.log(`   ✅ Downloaded: ${audioBuffer.length} bytes`);

    // Transcribe
    console.log(`   🎤 Transcribing with Hugging Face...`);
    const filename = path.basename(s3Key);
    const result = await whisperService.transcribeAudio(audioBuffer, filename);
    
    console.log(`   ✅ Transcription: ${result.text.substring(0, 100)}...`);
    console.log(`   📊 Language: ${result.language}`);

    // Update complaint
    complaint.transcript = result.text;
    complaint.language = result.language || 'unknown';
    complaint.status = 'TRANSCRIBED';
    complaint.updatedAt = new Date();
    await complaint.save();

    console.log(`\n✅ Complaint updated successfully!`);
    console.log(`   Status: ${complaint.status}`);
    console.log(`   Transcript length: ${complaint.transcript.length} characters`);

    // Generate summary if needed
    if (result.text && result.text.length > 200) {
      console.log(`   📝 Generating summary...`);
      const summary = await huggingfaceService.summarizeText(result.text, 100, 30);
      complaint.transcriptSummary = summary;
      await complaint.save();
      console.log(`   ✅ Summary: ${summary}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

processNow();