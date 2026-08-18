// src/scripts/transcribe-local.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Complaint } from '../models/Complaint.js';
import * as s3Service from '../services/s3.service.js';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function transcribeLocal() {
  console.log('🚀 Transcribing with local Python Whisper...');
  
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

    // Download audio from S3
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

    // ✅ FIX: Use raw string and proper path formatting
    const projectRoot = path.dirname(__dirname);
    const projectRootNormalized = projectRoot.replace(/\\/g, '\\\\');
    const tempFileNormalized = tempFile.replace(/\\/g, '\\\\');

    // Python script with properly escaped paths
    const pythonCode = `
import sys
import json
import os

# Add project root to path
sys.path.append(r'${projectRoot}')

# Change working directory to project root
os.chdir(r'${projectRoot}')

from Dude import UnifiedMediaAnalyzer

try:
    analyzer = UnifiedMediaAnalyzer(target_language="en")
    result = analyzer.process_video(r'${tempFileNormalized}', transcription_language='auto', target_language_short='en')
    
    # Extract transcription
    transcript = result.get('transcription', {}).get('text', '')
    language = result.get('transcription', {}).get('language', 'auto')
    
    print(json.dumps({
        'transcript': transcript,
        'language': language,
        'length': len(transcript)
    }))
except Exception as e:
    print(json.dumps({
        'error': str(e)
    }))
    sys.exit(1)
`;

    console.log(`   🐍 Running Python Whisper...`);
    console.log(`   📁 Project root: ${projectRoot}`);
    
    const pythonProcess = spawn('python', ['-c', pythonCode]);
    
    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    const result = await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
        } else {
          try {
            // Find JSON in the output
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              resolve(JSON.parse(jsonMatch[0]));
            } else {
              reject(new Error(`No JSON found in output: ${output}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${output}`));
          }
        }
      });
    });

    if (result.error) {
      console.error(`   ❌ Python error: ${result.error}`);
      return;
    }

    console.log(`   ✅ Transcription successful!`);
    console.log(`   📊 Language: ${result.language}`);
    console.log(`   📝 Transcript: ${result.transcript.substring(0, 200)}...`);
    console.log(`   📏 Length: ${result.length} characters`);

    // Update complaint
    complaint.transcript = result.transcript;
    complaint.language = result.language || 'en';
    complaint.status = 'TRANSCRIBED';
    complaint.updatedAt = new Date();
    await complaint.save();

    // Clean up temp file
    fs.unlinkSync(tempFile);

    console.log(`\n✅ Complaint updated successfully!`);
    console.log(`   Status: ${complaint.status}`);
    console.log(`   Transcript length: ${complaint.transcript.length} characters`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

transcribeLocal();