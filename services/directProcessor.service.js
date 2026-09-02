// services/directProcessor.service.js
// Runs transcription and AI comparison synchronously in-process (no Redis needed).
// Called directly from controllers when BullMQ queue is disabled.

import path from "path";
import fs   from "fs";
import os   from "os";

import { Complaint }               from "../models/Complaint.js";
import { Invoice }                 from "../models/Invoice.js";
import { Comparison }              from "../models/Comparison.js";
import { Customer }                from "../models/Customer.js";
import { ServiceCenter }           from "../models/ServiceCenter.js";
import * as storageService         from "../services/storage.service.js";
import * as pdfService             from "../services/pdf.service.js";
import * as ocrService             from "../services/ocr.service.js";
import { parseInvoiceLineItems }   from "../services/invoiceParser.service.js";
import whisperService              from "../services/whisper.service.js";
import * as aiComparisonService    from "../services/aiComparison.service.js";
import { generateAuditReportPdf }  from "../services/auditReport.service.js";
import { logger }                  from "../utils/logger.js";

const CONFIDENCE_HIGH   = 95;
const CONFIDENCE_MEDIUM = 85;
import { processNotificationDirectly } from "./directNotification.service.js";

const FRAUD_SCORE_THRESHOLD = 60;
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;

// ── Helper: fire-and-forget multi-channel notification (non-blocking) ─────────
const tryNotify = (label, complaintId, extra = {}) => {
  logger.info(`📢 Notification trigger: ${label} for complaint ${complaintId}`);
  if (complaintId) {
    setImmediate(() => processNotificationDirectly(label, { complaintId, ...extra }));
  }
};

// ── TRANSCRIPTION ─────────────────────────────────────────────────────────────
export async function runTranscription(complaintId) {
  logger.info(`🎙️ [Direct] Transcription started: ${complaintId}`);

  const complaint = await Complaint.findById(complaintId);
  if (!complaint) { logger.error(`Complaint ${complaintId} not found`); return; }

  tryNotify("complaint-received", complaintId);

  let tempFile = null;
  try {
    await Complaint.updateById(complaintId, { status: "TRANSCRIBING" });

    // Download audio from Supabase Storage
    const { bucket, path: storagePath } = storageService.parseStorageUrl(complaint.audioUrl);
    logger.info(`📥 Downloading audio from ${bucket}/${storagePath}`);
    const audioBuffer = await storageService.downloadFileBuffer(storagePath, bucket);
    logger.info(`✅ Audio downloaded: ${audioBuffer.length} bytes`);

    // Write to temp file for Groq API
    const ext = path.extname(storagePath) || ".mp3";
    tempFile  = path.join(os.tmpdir(), `audio_${Date.now()}${ext}`);
    fs.writeFileSync(tempFile, audioBuffer);

    // Transcribe with Groq Whisper (multilingual)
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
      englishTranscript: result.englishTranscript || result.text,
      language:          result.language,
      confidenceScore:   result.confidence,
      transcriptFlagged: result.confidence < CONFIDENCE_HIGH,
    });

    logger.info(`📝 Transcript saved: ${result.text?.length || 0} chars (lang: ${result.language})`);

    if (newStatus === "NEEDS_REVIEW") {
      tryNotify("needs-review", complaintId);
    } else {
      // Auto-trigger AI comparison if invoice already extracted
      const invoice = await Invoice.findOne({ complaintId, status: "EXTRACTED" });
      if (invoice) {
        logger.info(`📊 Invoice ready — running AI comparison directly`);
        await runComparison(complaintId, invoice.id);
      }
    }

  } catch (error) {
    logger.error(`❌ Transcription failed: ${error.message}`);
    await Complaint.updateById(complaintId, { status: "FAILED" });
    tryNotify("processing-failed", complaintId);
  } finally {
    if (tempFile) try { fs.unlinkSync(tempFile); } catch {}
  }
}

// Typed feedback is already a transcript. It must still follow the exact same
// lifecycle notifications and automatic comparison path as an audio response.
export async function processTypedFeedback(complaintId) {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint?.transcript) return;

  tryNotify("complaint-received", complaintId);
  const invoice = await Invoice.findOne({ complaintId, status: "EXTRACTED" });
  if (invoice) {
    await runComparison(complaintId, invoice.id);
  }
}

// ── INVOICE EXTRACTION ────────────────────────────────────────────────────────
export async function runInvoiceExtraction(invoiceId) {
  logger.info(`📄 [Direct] Invoice extraction started: ${invoiceId}`);

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) { logger.error(`Invoice ${invoiceId} not found`); return; }

  try {
    await Invoice.updateById(invoiceId, { status: "EXTRACTING" });

    // Download PDF from Supabase Storage
    const { bucket, path: storagePath } = storageService.parseStorageUrl(invoice.fileUrl);
    const fileBuffer = await storageService.downloadFileBuffer(storagePath, bucket);
    logger.info(`✅ PDF downloaded: ${fileBuffer.length} bytes`);

    // 1. Try digital text extraction first
    let extractedText    = await pdfService.extractTextFromPdf(fileBuffer);
    let extractionMethod = "DIGITAL";

    // 2. Fallback to OCR if text too short
    if (!extractedText || extractedText.length < 50) {
      logger.info(`OCR fallback triggered (${extractedText?.length || 0} chars from digital)`);
      extractedText    = await ocrService.extractTextFromScannedPdf(fileBuffer);
      extractionMethod = "OCR";
    }

    await Invoice.updateById(invoiceId, {
      status: "EXTRACTED",
      extractedText,
      extractionMethod,
      extractedItems: parseInvoiceLineItems(extractedText),
    });

    logger.info(`✅ Invoice text extracted via ${extractionMethod}: ${extractedText.length} chars`);

    tryNotify("invoice-uploaded", invoice.complaintId);

    // Auto-trigger comparison if transcript already ready
    const complaint = await Complaint.findById(invoice.complaintId);
    if (complaint?.status === "TRANSCRIBED") {
      logger.info(`📊 Transcript ready — running AI comparison directly`);
      await runComparison(invoice.complaintId, invoiceId);
    }

  } catch (error) {
    logger.error(`❌ Invoice extraction failed: ${error.message}`);
    await Invoice.updateById(invoiceId, { status: "FAILED" });
    tryNotify("processing-failed", invoice.complaintId);
  }
}

// ── AI COMPARISON ─────────────────────────────────────────────────────────────
export async function runComparison(complaintId, invoiceId) {
  logger.info(`🤖 [Direct] AI comparison started: complaint ${complaintId}`);

  const complaint = await Complaint.findById(complaintId);
  if (!complaint) { logger.error(`Complaint ${complaintId} not found`); return; }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice)  { logger.error(`Invoice ${invoiceId} not found`); return; }

  if (!complaint.transcript)  { logger.error(`No transcript for ${complaintId}`); return; }
  if (!invoice.extractedText) { logger.error(`No extracted text for ${invoiceId}`); return; }

  try {
    const transcriptToCompare = complaint.englishTranscript || complaint.english_transcript || complaint.transcript;
    const results = await aiComparisonService.compareTranscriptAndInvoice(
      transcriptToCompare,
      invoice.extractedText,
    );

    // Remove old comparisons, create fresh one
    await Comparison.deleteMany({ complaintId });

    const customer = await Customer.findById(complaint.customerId);
    const reportUrl = await storageService.uploadInvoice(
      generateAuditReportPdf({
        customer: customer || { name: "Customer" },
        complaint,
        invoice,
        comparison: results,
      }),
      `reports/audit_${complaintId}_${Date.now()}.pdf`,
      "application/pdf",
    ).catch(() => null); // PDF upload failure is non-critical

    await Comparison.create({
      complaintId,
      dealershipId: complaint.dealershipId || complaint.dealership_id,
      invoiceId,
      matchedIssues:     results.matchedIssues,
      missingIssues:     results.missingIssues,
      extraInvoiceItems: results.extraInvoiceItems,
      score:             results.score,
      status:            results.status,
      summary:           results.summary,
      reportUrl,
    });
    await Complaint.updateById(complaintId, { serviceStatus: "AUDIT_COMPLETE" }).catch(() => null);

    await Complaint.updateById(complaintId, { status: "COMPARED" });
    logger.info(`✅ Comparison done: ${results.status} (${results.score}%)`);

    tryNotify("audit-complete", complaintId, { score: results.score, summary: results.summary, reportUrl });

    // Fraud / Discrepancy escalation to Service Center Branch Manager
    if (results.score < FRAUD_SCORE_THRESHOLD) {
      logger.warn(`⚠️ DISCREPANCY FLAG: score ${results.score}% for complaint ${complaintId}`);
      if (customer) {
        const serviceCenter = await ServiceCenter.findByName(customer.serviceCenter || customer.service_center).catch(() => null);
        const branchManagerEmail = serviceCenter?.managerEmail || customer.serviceCenterManagerEmail || MANAGER_EMAIL;
        if (branchManagerEmail) {
          logger.info(`Dispatching discrepancy escalation alert to Branch Manager: ${branchManagerEmail}`);
          setImmediate(() => processNotificationDirectly("fraud-escalation", {
            complaintId,
            managerEmail: branchManagerEmail,
            managerPhone: process.env.MANAGER_PHONE,
            customerName: customer.name,
            vehicleNumber: complaint.vehicleNumber || complaint.vehicle_number,
            score: results.score,
            summary: results.summary,
            matchedIssues: results.matchedIssues,
            missingIssues: results.missingIssues,
          }).catch(err => logger.error(`Escalation dispatch error: ${err.message}`)));
        }
      }
    }

  } catch (error) {
    logger.error(`❌ AI comparison failed: ${error.message}`);
    tryNotify("processing-failed", complaintId);
  }
}
