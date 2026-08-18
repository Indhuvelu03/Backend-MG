// src/scripts/migrate-complaints.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Complaint } from '../models/Complaint.js';

// Get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-service';

async function migrateComplaints() {
    console.log('🚀 Starting complaint migration...');
    console.log(`📡 Connecting to MongoDB...`);

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const totalComplaints = await Complaint.countDocuments();
        console.log(`📊 Total complaints in database: ${totalComplaints}`);

        if (totalComplaints === 0) {
            console.log('ℹ️ No complaints found. Nothing to migrate.');
            return;
        }

        console.log('🔄 Adding new fields to complaints...');

        // Add new fields with default values
        const result = await Complaint.updateMany(
            {},
            {
                $set: {
                    transcriptSummary: '',
                    targetLanguage: 'en',
                    translation: '',
                    error: '',
                    updatedAt: new Date(),
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} complaints with new fields`);
        console.log(`✅ Matched ${result.matchedCount} complaints`);

        // Update timestamps for existing statuses
        const statusUpdate = await Complaint.updateMany(
            { status: { $in: ['AUDIO_UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED'] } },
            { $set: { updatedAt: new Date() } }
        );

        console.log(`✅ Updated timestamps for ${statusUpdate.modifiedCount} complaints`);

        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run the migration
migrateComplaints();