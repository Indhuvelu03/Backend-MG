import { Worker } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import * as email from "../services/email.service.js";
import { logger } from "../utils/logger.js";

const loadContext = async (complaintId) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new Error(`Complaint ${complaintId} was not found`);
  const customer = await Customer.findById(complaint.customerId);
  if (!customer) throw new Error(`Customer for complaint ${complaintId} was not found`);
  return { complaint, customer };
};

const deliverCustomerNotification = async (customer, emailTask) => {
  if (!customer.email) throw new Error(`Customer ${customer.id} has no email address`);
  await emailTask();
};

const deliverInvite = async (customer, link) => {
  if (link.sentVia?.email) return;
  if (!customer.email) throw new Error(`Customer ${customer.id} has no email address`);
  await email.sendFeedbackInvite(customer, link);
  await FeedbackLink.updateById(link.id, { sentVia: { ...link.sentVia, email: true } });
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
      return deliverCustomerNotification(customer, () => email.sendComplaintReceived(customer, complaint));
    case "voice-processing":
      return deliverCustomerNotification(customer, () => email.sendVoiceNoteProcessing(customer, complaint));
    case "invoice-uploaded":
      return deliverCustomerNotification(customer, () => email.sendInvoiceUploaded(customer, complaint));
    case "audit-complete":
      return deliverCustomerNotification(customer, () => email.sendAuditComplete(customer, complaint, job.data.score, job.data.summary));
    case "needs-review":
      return deliverCustomerNotification(customer, () => email.sendNeedsReview(customer, complaint));
    case "processing-failed":
      return deliverCustomerNotification(customer, () => email.sendProcessingFailed(customer, complaint));
    case "status-update":
      return deliverCustomerNotification(customer, () => email.sendStatusUpdate(customer, job.data.status, complaint.vehicleNumber));
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
