// src/scripts/transcribe-python.js
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

async function transcribePython() {
    console.log('🚀 Transcribing with Python faster-whisper...');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const complaintId = '6a69a1eb6e72fe33c776f5be';
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

        // Run Python script
        const pythonScript = path.join(__dirname, 'whisper_local.py');
        console.log(`   🐍 Running Python: ${pythonScript}`);

        const pythonProcess = spawn('python', [pythonScript, tempFile]);

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log(data.toString().trim()); // Show progress
        });

        const result = await new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
                } else {
                    try {
                        // Find JSON in output
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
        console.log(`   📝 Transcript: ${result.text.substring(0, 200)}...`);
        console.log(`   📏 Length: ${result.length}`);

        // Update complaint
        complaint.transcript = result.text;
        complaint.language = result.language || 'en';
        complaint.status = 'TRANSCRIBED';
        complaint.updatedAt = new Date();
        await complaint.save();

        // Clean up
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

transcribePython();