// src/scripts/manual-transcribe.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Complaint } from '../models/Complaint.js';
import { transcriptionQueue } from '../jobs/queue.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function manualTranscribe() {
  console.log('🚀 Starting manual transcription...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find complaints without transcript
    const complaints = await Complaint.find({
      status: { $in: ["AUDIO_UPLOADED", "TRANSCRIBING"] },
      transcript: { $exists: false }
    });

    console.log(`📊 Found ${complaints.length} complaints to transcribe`);

    for (const complaint of complaints) {
      console.log(`\n📝 Processing complaint: ${complaint._id}`);
      console.log(`   Vehicle: ${complaint.vehicleNumber}`);
      console.log(`   Audio URL: ${complaint.audioUrl}`);

      // ✅ Extract S3 key from CloudFront or S3 URL
      let s3Key;
      if (complaint.audioUrl.includes('cloudfront.net')) {
        s3Key = complaint.audioUrl.split('cloudfront.net/')[1];
        console.log(`   🔑 S3 Key (CloudFront): ${s3Key}`);
      } else {
        try {
          const parsedUrl = new URL(complaint.audioUrl);
          s3Key = decodeURIComponent(parsedUrl.pathname.substring(1));
          console.log(`   🔑 S3 Key (S3 URL): ${s3Key}`);
        } catch (urlError) {
          console.error(`   ❌ Invalid URL: ${complaint.audioUrl}`);
          continue;
        }
      }

      // Add to queue with the extracted S3 key
      await transcriptionQueue.add("transcribe-audio", {
        complaintId: complaint._id.toString(),
        s3Key: s3Key, // Pass the S3 key explicitly
      });

      console.log(`   ✅ Added to transcription queue`);
    }

    console.log('\n🎉 All complaints added to queue!');
    console.log('📡 Check Redis for processing status');
    console.log('   redis-cli LRANGE bull:transcription:wait 0 -1');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

manualTranscribe();