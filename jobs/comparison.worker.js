// jobs/comparison.worker.js — Supabase + Groq Llama + Customer Notifications
import { Worker } from "bullmq";
import { redisConnectionOptions }  from "../config/redis.js";
import { Complaint }               from "../models/Complaint.js";
import { Invoice }                 from "../models/Invoice.js";
import { Comparison }              from "../models/Comparison.js";
import * as aiComparisonService    from "../services/aiComparison.service.js";
import { Customer }                from "../models/Customer.js";
import { notificationsQueue }      from "./queue.js";
import { logger }                  from "../utils/logger.js";
import * as storageService         from "../services/storage.service.js";
import { generateAuditReportPdf }  from "../services/auditReport.service.js";

// Fraud escalation threshold
const FRAUD_SCORE_THRESHOLD = 60;
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;

// Helper — fire-and-forget notification (never blocks the worker)
const notify = (name, data) =>
  notificationsQueue.add(name, data, { attempts: 3, removeOnComplete: true })
    .catch(err => logger.warn(`⚠️ Could not queue notification [${name}]: ${err.message}`));

export const comparisonWorker = new Worker(
  "ai-comparison",
  async (job) => {
    const { complaintId, invoiceId } = job.data;
    logger.info(`🤖 AI comparison started: complaint ${complaintId} (Job: ${job.id})`);

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) { logger.error(`Complaint ${complaintId} not found`); return; }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice)  { logger.error(`Invoice ${invoiceId} not found`); return; }

    if (!complaint.transcript)    { logger.error(`No transcript for ${complaintId}`); return; }
    if (!invoice.extractedText)   { logger.error(`No extracted text for ${invoiceId}`); return; }

    try {
      const results = await aiComparisonService.compareTranscriptAndInvoice(
        complaint.transcript,
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
      );
      await Comparison.create({
        complaintId,
        invoiceId,
        matchedIssues:     results.matchedIssues,
        missingIssues:     results.missingIssues,
        extraInvoiceItems: results.extraInvoiceItems,
        score:             results.score,
        status:            results.status,
        summary:           results.summary,
        reportUrl,
      });

      await Complaint.updateById(complaintId, { status: "COMPARED" });
      logger.info(`✅ Comparison done: ${results.status} (${results.score}%)`);

      // ── Notify customer: AI audit complete ──────────────────────────────────
      await notify("audit-complete", {
        complaintId,
        score:   results.score,
        summary: results.summary,
        reportUrl,
      });

      // ── Fraud escalation if score < threshold ───────────────────────────────
      if (results.score < FRAUD_SCORE_THRESHOLD) {
        logger.warn(`⚠️ FRAUD FLAG: score ${results.score}% for complaint ${complaintId}`);
        if (customer) {
          const branchManagerEmail = customer.serviceCenterManagerEmail || customer.managerEmail || customer.service_center_manager_email || MANAGER_EMAIL;
          await notify("fraud-escalation", {
            managerEmail:  branchManagerEmail,
            customerName:  customer.name,
            vehicleNumber: complaint.vehicleNumber,
            score:         results.score,
            summary:       results.summary,
            missingIssues: results.missingIssues,
            matchedIssues: results.matchedIssues,
          });
          logger.warn(`📧 Fraud escalation queued → ${branchManagerEmail} (Branch: ${customer.serviceCenter || customer.service_center || 'Main'})`);
        }
      }

    } catch (error) {
      logger.error(`❌ AI comparison failed: ${error.message}`);
      // ── Notify customer: processing failed ─────────────────────────────────
      await notify("processing-failed", { complaintId });
      throw error;
    }
  },
  {
    connection:      redisConnectionOptions,
    stalledInterval: 15000,
    drainDelay:      5,
  }
);

comparisonWorker.on("completed", (job) => logger.info(`✅ Comparison job ${job.id} done`));
comparisonWorker.on("failed",    (job, err) => logger.error(`❌ Comparison job ${job?.id} failed: ${err.message}`));
comparisonWorker.on("error",     (err) => {
  if (err.message?.includes("ECONNRESET") || err.message?.includes("ETIMEDOUT")) {
    logger.warn(`⚠️ Comparison worker Redis reconnecting: ${err.message}`);
  } else {
    logger.error(`❌ Comparison worker error: ${err.message}`);
  }
});
logger.info("✅ AI comparison worker ready (Groq + audit-complete + fraud-escalation notifications)");
