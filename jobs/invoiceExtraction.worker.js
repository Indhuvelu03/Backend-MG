// jobs/invoiceExtraction.worker.js — Supabase-based + Customer Notifications
import { Worker } from "bullmq";
import { redisConnectionOptions }               from "../config/redis.js";
import { Invoice }                              from "../models/Invoice.js";
import { Complaint }                            from "../models/Complaint.js";
import * as storageService                      from "../services/storage.service.js";
import * as pdfService                          from "../services/pdf.service.js";
import * as ocrService                          from "../services/ocr.service.js";
import { parseInvoiceLineItems }                from "../services/invoiceParser.service.js";
import { aiComparisonQueue, notificationsQueue } from "./queue.js";
import { logger }                               from "../utils/logger.js";

// Helper — fire-and-forget notification (never blocks the worker)
const notify = (name, data) =>
  notificationsQueue.add(name, data, { attempts: 3, removeOnComplete: true })
    .catch(err => logger.warn(`⚠️ Could not queue notification [${name}]: ${err.message}`));

export const invoiceExtractionWorker = new Worker(
  "invoice-extraction",
  async (job) => {
    const { invoiceId } = job.data;
    logger.info(`📄 Invoice extraction started: ${invoiceId} (Job: ${job.id})`);

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

      // ── Notify customer: invoice uploaded ──────────────────────────────────
      await notify("invoice-uploaded", { complaintId: invoice.complaintId });

      // Auto-trigger comparison if transcript already ready
      const complaint = await Complaint.findById(invoice.complaintId);
      if (complaint?.status === "TRANSCRIBED") {
        logger.info(`📊 Transcript ready — queuing AI comparison`);
        await aiComparisonQueue.add("compare-docs", {
          complaintId: complaint.id,
          invoiceId,
        });
      }

    } catch (error) {
      logger.error(`❌ Invoice extraction failed: ${error.message}`);
      await Invoice.updateById(invoiceId, { status: "FAILED" });
      // ── Notify customer: processing failed ─────────────────────────────────
      await notify("processing-failed", { complaintId: invoice.complaintId });
      throw error;
    }
  },
  {
    connection:      redisConnectionOptions,
    stalledInterval: 15000,
    drainDelay:      5,
  }
);

invoiceExtractionWorker.on("completed", (job) => logger.info(`✅ Extraction job ${job.id} done`));
invoiceExtractionWorker.on("failed",    (job, err) => logger.error(`❌ Extraction job ${job?.id} failed: ${err.message}`));
invoiceExtractionWorker.on("error",     (err) => {
  if (err.message?.includes("ECONNRESET") || err.message?.includes("ETIMEDOUT")) {
    logger.warn(`⚠️ Extraction worker Redis reconnecting: ${err.message}`);
  } else {
    logger.error(`❌ Extraction worker error: ${err.message}`);
  }
});
logger.info("✅ Invoice extraction worker ready (+ invoice-uploaded notification)");
