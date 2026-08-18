// src/scripts/manual-queue.js
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

async function manualQueue() {
    console.log('🚀 Manual queue test...');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find complaints without transcript
        const complaints = await Complaint.find({
            status: 'AUDIO_UPLOADED',
            transcript: { $exists: false }
        });

        console.log(`📊 Found ${complaints.length} complaints`);

        for (const complaint of complaints) {
            console.log(`\n📝 Queuing: ${complaint._id}`);
            console.log(`   Vehicle: ${complaint.vehicleNumber}`);

            const job = await transcriptionQueue.add('transcribe-audio', {
                complaintId: complaint._id.toString(),
            });

            console.log(`   ✅ Job queued: ${job.id}`);
        }

        console.log('\n🎉 Done! Check Redis queue:');
        console.log('   redis-cli LRANGE bull:transcription:wait 0 -1');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

manualQueue();