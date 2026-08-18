// jobs/notification.worker.js — Full multi-channel lifecycle notifications (Email + Twilio SMS/WhatsApp)
import { Worker } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Complaint }    from "../models/Complaint.js";
import { Customer }     from "../models/Customer.js";
import * as email       from "../services/email.service.js";
import * as sms         from "../services/sms.service.js";
import * as whatsapp    from "../services/whatsapp.service.js";
import { logger }       from "../utils/logger.js";

export const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    logger.info(`📨 Notification job: ${job.name} (${job.id})`);

    // ── Helper: load complaint + customer together ──────────────────────────
    const loadCtx = async (complaintId) => {
      const complaint = await Complaint.findById(complaintId);
      if (!complaint) { logger.warn(`Complaint ${complaintId} not found — skipping notification`); return null; }
      const customer  = await Customer.findById(complaint.customerId);
      if (!customer)  { logger.warn(`Customer for complaint ${complaintId} not found — skipping notification`); return null; }
      return { complaint, customer };
    };

    // ────────────────────────────────────────────────────────────────────────
    // 1. Feedback link invite
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "dispatch-invite") {
      const { feedbackLinkId } = job.data;
      const link     = await FeedbackLink.findByIdWithCustomer(feedbackLinkId);
      if (!link)     { logger.error(`FeedbackLink ${feedbackLinkId} not found`); return; }

      const customer = link.customerId || link.customer;
      if (!customer) { logger.error(`Customer not found for FeedbackLink ${feedbackLinkId}`); return; }

      if (link.sentVia?.email) {
        logger.info(`Email already sent for link ${feedbackLinkId} — skipping`);
        return;
      }

      await email.sendFeedbackInvite(customer, link).catch(err => logger.error(`Email error: ${err.message}`));
      await sms.sendFeedbackInvite(customer, link).catch(err => logger.warn(`SMS error: ${err.message}`));
      await whatsapp.sendFeedbackInvite(customer, link).catch(err => logger.warn(`WhatsApp error: ${err.message}`));

      await FeedbackLink.updateById(link.id, { sentVia: { ...link.sentVia, email: true, sms: true, whatsapp: true } });
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2. Complaint received (voice note submitted by customer)
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "complaint-received") {
      const ctx = await loadCtx(job.data.complaintId);
      if (ctx) {
        await email.sendComplaintReceived(ctx.customer, ctx.complaint).catch(err => logger.error(`Email error: ${err.message}`));
        await sms.sendComplaintReceived(ctx.customer, ctx.complaint).catch(err => logger.warn(`SMS error: ${err.message}`));
        await whatsapp.sendComplaintReceived(ctx.customer, ctx.complaint).catch(err => logger.warn(`WhatsApp error: ${err.message}`));
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. Voice note is being transcribed
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "voice-processing") {
      const ctx = await loadCtx(job.data.complaintId);
      if (ctx) {
        await email.sendVoiceNoteProcessing(ctx.customer, ctx.complaint).catch(err => logger.error(`Email error: ${err.message}`));
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. Invoice uploaded by service center
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "invoice-uploaded") {
      const ctx = await loadCtx(job.data.complaintId);
      if (ctx) {
        await email.sendInvoiceUploaded(ctx.customer, ctx.complaint).catch(err => logger.error(`Email error: ${err.message}`));
        await sms.sendInvoiceUploaded(ctx.customer, ctx.complaint).catch(err => logger.warn(`SMS error: ${err.message}`));
        await whatsapp.sendInvoiceUploaded(ctx.customer, ctx.complaint).catch(err => logger.warn(`WhatsApp error: ${err.message}`));
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 5. AI audit complete
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "audit-complete") {
      const { complaintId, score, summary } = job.data;
      const ctx = await loadCtx(complaintId);
      if (ctx) {
        await email.sendAuditComplete(ctx.customer, ctx.complaint, score, summary).catch(err => logger.error(`Email error: ${err.message}`));
        await sms.sendAuditComplete(ctx.customer, ctx.complaint, score).catch(err => logger.warn(`SMS error: ${err.message}`));
        await whatsapp.sendAuditComplete(ctx.customer, ctx.complaint, score).catch(err => logger.warn(`WhatsApp error: ${err.message}`));
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 6. Needs manual review (low confidence)
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "needs-review") {
      const ctx = await loadCtx(job.data.complaintId);
      if (ctx) {
        await email.sendNeedsReview(ctx.customer, ctx.complaint).catch(err => logger.error(`Email error: ${err.message}`));
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 7. Processing failed
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "processing-failed") {
      const ctx = await loadCtx(job.data.complaintId);
      if (ctx) {
        await email.sendProcessingFailed(ctx.customer, ctx.complaint).catch(err => logger.error(`Email error: ${err.message}`));
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 8. Fraud escalation (manager alert)
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "fraud-escalation") {
      const { managerEmail, customerName, vehicleNumber, score, summary, matchedIssues, missingIssues } = job.data;
      await email.sendFraudEscalation({ managerEmail, customerName, vehicleNumber, score, summary, matchedIssues, missingIssues })
        .catch(err => logger.error(`Fraud escalation email error: ${err.message}`));
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 9. Legacy generic status update (backward compat)
    // ────────────────────────────────────────────────────────────────────────
    if (job.name === "status-update") {
      const { complaintId, status } = job.data;
      const complaint = await Complaint.findById(complaintId);
      if (!complaint) return;
      const customer = await Customer.findById(complaint.customerId);
      if (!customer?.email) return;
      await email.sendStatusUpdate(customer, status, complaint.vehicleNumber)
        .catch(err => logger.error(`Status-update email error: ${err.message}`));
      return;
    }

    logger.warn(`⚠️ Unknown notification job type: ${job.name}`);
  },
  {
    connection:      redisConnectionOptions,
    stalledInterval: 15000,
    drainDelay:      5,
    concurrency:     3,   // Process up to 3 emails concurrently
  }
);

notificationWorker.on("completed", (job) => logger.info(`✅ Notification job [${job.name}] ${job.id} done`));
notificationWorker.on("failed",    (job, err) => logger.error(`❌ Notification job [${job?.name}] ${job?.id} failed: ${err.message}`));
notificationWorker.on("error",     (err) => {
  if (err.message?.includes("ECONNRESET") || err.message?.includes("ETIMEDOUT")) {
    logger.warn(`⚠️ Notification worker Redis reconnecting: ${err.message}`);
  } else {
    logger.error(`❌ Notification worker error: ${err.message}`);
  }
});
logger.info("✅ Notification worker ready (9 email types: full customer lifecycle)");