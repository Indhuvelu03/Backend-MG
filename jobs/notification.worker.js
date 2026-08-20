import { Worker } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import * as email from "../services/email.service.js";
import * as sms from "../services/sms.service.js";
import * as whatsapp from "../services/whatsapp.service.js";
import { isLive as isTwilioLive } from "../services/twilio.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const loadContext = async (complaintId) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new Error(`Complaint ${complaintId} was not found`);
  const customer = await Customer.findById(complaint.customerId);
  if (!customer) throw new Error(`Customer for complaint ${complaintId} was not found`);
  return { complaint, customer };
};

const channelPriority = env.NOTIFICATION_CHANNELS.split(",").map((channel) => channel.trim().toLowerCase());

// Future-ready fallback chain. With the default "email" setting this only
// calls Resend. When Twilio is live, set whatsapp,sms,email to use the exact
// WhatsApp -> SMS -> email order requested by the product workflow.
const deliverCustomerNotification = async (customer, tasks) => {
  const failures = [];
  for (const channel of channelPriority) {
    const task = tasks[channel];
    const canUse = channel === "email" ? Boolean(customer.email) : Boolean(customer.mobile && isTwilioLive());
    if (!task || !canUse) continue;
    try {
      await task();
      logger.info(`Notification delivered via ${channel} to customer ${customer.id}`);
      return channel;
    } catch (error) {
      failures.push(`${channel}: ${error.message}`);
      logger.warn(`Notification ${channel} failed for customer ${customer.id}; trying fallback`);
    }
  }
  throw new Error(`No notification channel delivered: ${failures.join("; ") || "no configured recipient/channel"}`);
};

const deliverInvite = async (customer, link) => {
  const tasks = {
    email: () => email.sendFeedbackInvite(customer, link),
    sms: () => sms.sendFeedbackInvite(customer, link),
    whatsapp: () => whatsapp.sendFeedbackInvite(customer, link),
  };
  const channel = await deliverCustomerNotification(customer, tasks);
  await FeedbackLink.updateById(link.id, { sentVia: { ...link.sentVia, [channel]: true } });
};

export const notificationWorker = new Worker("notifications", async (job) => {
  logger.info(`Notification job started: ${job.name} (${job.id})`);

  if (job.name === "dispatch-invite") {
    const link = await FeedbackLink.findByIdWithCustomer(job.data.feedbackLinkId);
    if (!link?.customerId && !link?.customer) throw new Error(`Feedback link ${job.data.feedbackLinkId} was not found`);
    await deliverInvite(link.customerId || link.customer, link);
    return;
  }

  if (job.name === "fraud-escalation") {
    const { managerEmail, ...details } = job.data;
    if (!managerEmail) throw new Error("Fraud escalation has no manager email");
    await email.sendFraudEscalation({ managerEmail, ...details });
    return;
  }

  const { complaint, customer } = await loadContext(job.data.complaintId);
  switch (job.name) {
    case "complaint-received":
      return deliverCustomerNotification(customer, { email: () => email.sendComplaintReceived(customer, complaint), sms: () => sms.sendComplaintReceived(customer, complaint), whatsapp: () => whatsapp.sendComplaintReceived(customer, complaint) });
    case "voice-processing":
      return deliverCustomerNotification(customer, { email: () => email.sendVoiceNoteProcessing(customer, complaint) });
    case "invoice-uploaded":
      return deliverCustomerNotification(customer, { email: () => email.sendInvoiceUploaded(customer, complaint), sms: () => sms.sendInvoiceUploaded(customer, complaint), whatsapp: () => whatsapp.sendInvoiceUploaded(customer, complaint) });
    case "audit-complete":
      return deliverCustomerNotification(customer, { email: () => email.sendAuditComplete(customer, complaint, job.data.score, job.data.summary, job.data.reportUrl), sms: () => sms.sendAuditComplete(customer, complaint, job.data.score), whatsapp: () => whatsapp.sendAuditComplete(customer, complaint, job.data.score) });
    case "needs-review":
      return deliverCustomerNotification(customer, { email: () => email.sendNeedsReview(customer, complaint) });
    case "processing-failed":
      return deliverCustomerNotification(customer, { email: () => email.sendProcessingFailed(customer, complaint) });
    case "status-update":
      return deliverCustomerNotification(customer, { email: () => email.sendStatusUpdate(customer, job.data.status, complaint.vehicleNumber) });
    default:
      throw new Error(`Unknown notification job type: ${job.name}`);
  }
}, {
  connection: redisConnectionOptions,
  stalledInterval: 15_000,
  drainDelay: 5,
  concurrency: 3,
});

notificationWorker.on("completed", (job) => logger.info(`Notification job completed: ${job.name} (${job.id})`));
notificationWorker.on("failed", (job, error) => logger.error(`Notification job failed: ${job?.name} (${job?.id}): ${error.message}`));
notificationWorker.on("error", (error) => logger.error(`Notification worker error: ${error.message}`));
