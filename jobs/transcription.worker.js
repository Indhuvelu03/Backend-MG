// jobs/transcription.worker.js — Supabase + Groq Whisper + Customer Notifications
import { Worker } from "bullmq";
import path from "path";
import fs   from "fs";
import os   from "os";
import { redisConnectionOptions }               from "../config/redis.js";
import { Complaint }                            from "../models/Complaint.js";
import { Invoice }                              from "../models/Invoice.js";
import * as storageService                      from "../services/storage.service.js";
import { aiComparisonQueue, notificationsQueue } from "./queue.js";
import { logger }                               from "../utils/logger.js";
import whisperService                           from "../services/whisper.service.js";

const CONFIDENCE_HIGH   = 95;
const CONFIDENCE_MEDIUM = 85;

// Helper — fire-and-forget notification (never blocks the worker)
const notify = (name, data) =>
  notificationsQueue.add(name, data, { attempts: 2, removeOnComplete: true })
    .catch(err => logger.warn(`⚠️ Could not queue notification [${name}]: ${err.message}`));

export const transcriptionWorker = new Worker(
  "transcription",
  async (job) => {
    const { complaintId } = job.data;
    logger.info(`🎙️ Transcription started: ${complaintId} (Job: ${job.id})`);

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) { logger.error(`Complaint ${complaintId} not found`); return; }

    // ── Stage 1: Complaint received ──────────────────────────────────────────
    // Fire immediately so customer knows their voice note was received
    await notify("complaint-received", { complaintId });

    let tempFile = null;
    try {
      await Complaint.updateById(complaintId, { status: "TRANSCRIBING" });

      // ── Stage 2: Voice note processing ──────────────────────────────────────
      await notify("voice-processing", { complaintId });

      // Download audio from Supabase Storage
      const { bucket, path: storagePath } = storageService.parseStorageUrl(complaint.audioUrl);
      logger.info(`📥 Downloading audio from ${bucket}/${storagePath}`);
      const audioBuffer = await storageService.downloadFileBuffer(storagePath, bucket);
      logger.info(`✅ Audio downloaded: ${audioBuffer.length} bytes`);

      // Write to temp file for Groq API
      const ext = path.extname(storagePath) || ".mp3";
      tempFile  = path.join(os.tmpdir(), `audio_${Date.now()}${ext}`);
      fs.writeFileSync(tempFile, audioBuffer);

      // Transcribe with Groq Whisper
      const result = await whisperService.transcribe(tempFile);

      // Confidence routing
      let newStatus;
      if (result.confidence >= CONFIDENCE_HIGH) {
        newStatus = "TRANSCRIBED";
        logger.info(`✅ High confidence (${result.confidence}%) — auto-accepted`);
      } else if (result.confidence >= CONFIDENCE_MEDIUM) {
        newStatus = "TRANSCRIBED";
        logger.warn(`⚠️ Medium confidence (${result.confidence}%) — flagged`);
      } else {
        newStatus = "NEEDS_REVIEW";
        logger.warn(`🔴 Low confidence (${result.confidence}%) — human review`);
      }

      await Complaint.updateById(complaintId, {
        status:            newStatus,
        transcript:        [complaint.transcript, result.text].filter(Boolean).join("\n\nVoice recording transcript:\n"),
        language:          result.language,
        confidenceScore:   result.confidence,
        transcriptFlagged: result.confidence < CONFIDENCE_HIGH,
      });

      logger.info(`📝 Transcript saved: ${result.text?.length || 0} chars`);

      if (newStatus === "NEEDS_REVIEW") {
        // ── Stage 3a: Needs manual review ─────────────────────────────────────
        await notify("needs-review", { complaintId });
      } else {
        // ── Stage 3b: Auto-trigger AI comparison if invoice already extracted ─
        const invoice = await Invoice.findOne({ complaintId, status: "EXTRACTED" });
        if (invoice) {
          logger.info(`📊 Invoice ready — queuing AI comparison`);
          await aiComparisonQueue.add("compare-docs", { complaintId, invoiceId: invoice.id });
        }
      }

    } catch (error) {
      logger.error(`❌ Transcription failed: ${error.message}`);
      await Complaint.updateById(complaintId, { status: "FAILED", error: error.message });
      // ── Stage: Processing failed ───────────────────────────────────────────
      await notify("processing-failed", { complaintId });
      throw error;
    } finally {
      if (tempFile) try { fs.unlinkSync(tempFile); } catch {}
    }
  },
  {
    connection:      redisConnectionOptions,
    stalledInterval: 15000,
    drainDelay:      5,
  }
);

transcriptionWorker.on("completed", (job) => logger.info(`✅ Transcription job ${job.id} done`));
transcriptionWorker.on("failed",    (job, err) => logger.error(`❌ Transcription job ${job?.id} failed: ${err.message}`));
transcriptionWorker.on("error",     (err) => {
  if (err.message?.includes("ECONNRESET") || err.message?.includes("ETIMEDOUT")) {
    logger.warn(`⚠️ Transcription worker Redis reconnecting: ${err.message}`);
  } else {
    logger.error(`❌ Transcription worker error: ${err.message}`);
  }
});
logger.info("✅ Transcription worker ready (Groq Whisper Large-v3 + customer notifications)");
