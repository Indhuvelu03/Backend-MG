// Unified notification processor used by both direct mode and BullMQ workers.
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import { ServiceCenter } from "../models/ServiceCenter.js";
import { EmailActivity } from "../models/EmailActivity.js";
import * as email from "./email.service.js";
import * as sms from "./sms.service.js";
import * as whatsapp from "./whatsapp.service.js";
import { deliverAcrossChannels } from "./notificationDelivery.service.js";
import { logger } from "../utils/logger.js";

const stageLabels = {
  "dispatch-invite": "Feedback invite",
  "complaint-received": "Complaint received",
  "voice-processing": "Voice note processing",
  "invoice-uploaded": "Invoice uploaded",
  "audit-complete": "Audit complete",
  "needs-review": "Manual review",
  "processing-failed": "Processing issue",
  "status-update": "Service status update",
  "fraud-escalation": "Fraud escalation",
};

const detailFor = (jobName, data) => {
  if (jobName === "dispatch-invite") return "Secure feedback link notification";
  if (jobName === "audit-complete") return `Score: ${data.score}%`;
  if (jobName === "status-update") return data.status || null;
  return null;
};

const providerMessageId = (result) => result?.sid || result?.messageId || null;

const recordAttempt = async ({ customer, jobName, data, channel, success, result, error }) => {
  const status = success
    ? (channel === "email" ? "SENT" : String(result?.status || "QUEUED").toUpperCase())
    : "FAILED";
  const recipient = channel === "email" ? customer.email : customer.mobile;
  return EmailActivity.record({
    customer,
    stage: stageLabels[jobName] || jobName,
    channel,
    recipient,
    status,
    detail: error?.message || detailFor(jobName, data),
    providerMessageId: providerMessageId(result),
    providerStatus: result?.status || status,
    jobName,
    jobData: data,
  }).catch((activityError) => {
    logger.warn(`Notification activity log failed: ${activityError.message}`);
    return null;
  });
};

const loadComplaintContext = async (complaintId) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new Error(`Complaint ${complaintId} was not found`);
  const customer = await Customer.findById(complaint.customerId);
  if (!customer) throw new Error(`Customer for complaint ${complaintId} was not found`);
  return { complaint, customer };
};

const dispatch = async ({ customer, jobName, data, tasks }) => {
  const stage = stageLabels[jobName] || jobName;
  const customerId = customer?.id || customer?._id;
  return deliverAcrossChannels({
    customer,
    tasks,
    // Retrying processing must never resend a notification already accepted by
    // a provider for this exact lifecycle stage and channel.
    shouldDeliver: (channel) => EmailActivity.wasSent({ customerId, stage, channel }).then(sent => !sent),
    onAttempt: (attempt) => recordAttempt({ customer, jobName, data, ...attempt }),
  });
};

const processInvite = async (data) => {
  const link = await FeedbackLink.findByIdWithCustomer(data.feedbackLinkId);
  if (!link) throw new Error(`Feedback link ${data.feedbackLinkId} was not found`);
  let customer = typeof link.customerId === "object" ? link.customerId : link.customer;
  if (!customer && link.customer_id) customer = await Customer.findById(link.customer_id);
  if (!customer) throw new Error(`Customer for feedback link ${link.id} was not found`);

  const delivery = await dispatch({
    customer,
    jobName: "dispatch-invite",
    data,
    tasks: {
      whatsapp: () => whatsapp.sendFeedbackInvite(customer, link),
      sms: () => sms.sendFeedbackInvite(customer, link),
      email: () => email.sendFeedbackInvite(customer, link),
    },
  });
  const sentVia = { ...link.sentVia };
  delivery.successfulChannels.forEach((channel) => { sentVia[channel] = true; });
  await FeedbackLink.updateById(link.id, { sentVia });
  return delivery;
};

const processFraudEscalation = async (data) => {
  let complaint = null;
  let customer = null;
  if (data.complaintId) ({ complaint, customer } = await loadComplaintContext(data.complaintId));
  const manager = {
    ...(customer || {}),
    name: data.managerName || "Regional service manager",
    email: data.managerEmail,
    mobile: data.managerPhone || process.env.MANAGER_PHONE,
    vehicleNumber: data.vehicleNumber || complaint?.vehicleNumber,
  };
  const details = {
    ...data,
    customerName: data.customerName || customer?.name,
    vehicleNumber: data.vehicleNumber || complaint?.vehicleNumber,
  };
  return dispatch({
    customer: manager,
    jobName: "fraud-escalation",
    data,
    tasks: {
      whatsapp: () => whatsapp.sendFraudEscalation(manager, details),
      sms: () => sms.sendFraudEscalation(manager, details),
      email: () => email.sendFraudEscalation(details),
    },
  });
};

// A processing failure is an internal action item. Notify the branch manager,
// not the customer, so the customer message sequence stays concise.
const processFailureEscalation = async (data) => {
  const { complaint, customer } = await loadComplaintContext(data.complaintId);
  const serviceCenter = await ServiceCenter.findByName(customer.serviceCenter || customer.service_center).catch(() => null);
  const manager = {
    ...customer,
    name: serviceCenter?.name ? `${serviceCenter.name} manager` : "Service manager",
    email: serviceCenter?.managerEmail || process.env.MANAGER_EMAIL,
    mobile: serviceCenter?.phone || process.env.MANAGER_PHONE,
  };
  if (!manager.email && !manager.mobile) throw new Error("No branch manager contact is configured");

  return dispatch({
    customer: manager,
    jobName: "processing-failed",
    data,
    tasks: {
      whatsapp: () => whatsapp.sendProcessingFailed(manager, complaint),
      sms: () => sms.sendProcessingFailed(manager, complaint),
      email: () => email.sendProcessingFailed(manager, complaint),
    },
  });
};

const processComplaintStage = async (jobName, data) => {
  const { complaint, customer } = await loadComplaintContext(data.complaintId);
  const tasksByStage = {
    "complaint-received": {
      whatsapp: () => whatsapp.sendComplaintReceived(customer, complaint),
      sms: () => sms.sendComplaintReceived(customer, complaint),
      email: () => email.sendComplaintReceived(customer, complaint),
    },
    "voice-processing": {
      whatsapp: () => whatsapp.sendVoiceNoteProcessing(customer, complaint),
      sms: () => sms.sendVoiceNoteProcessing(customer, complaint),
      email: () => email.sendVoiceNoteProcessing(customer, complaint),
    },
    "invoice-uploaded": {
      whatsapp: () => whatsapp.sendInvoiceUploaded(customer, complaint),
      sms: () => sms.sendInvoiceUploaded(customer, complaint),
      email: () => email.sendInvoiceUploaded(customer, complaint),
    },
    "audit-complete": {
      whatsapp: () => whatsapp.sendAuditComplete(customer, complaint, data.score),
      sms: () => sms.sendAuditComplete(customer, complaint, data.score),
      email: () => email.sendAuditComplete(customer, complaint, data.score, data.summary, data.reportUrl),
    },
    "needs-review": {
      whatsapp: () => whatsapp.sendNeedsReview(customer, complaint),
      sms: () => sms.sendNeedsReview(customer, complaint),
      email: () => email.sendNeedsReview(customer, complaint),
    },
    "processing-failed": {
      whatsapp: () => whatsapp.sendProcessingFailed(customer, complaint),
      sms: () => sms.sendProcessingFailed(customer, complaint),
      email: () => email.sendProcessingFailed(customer, complaint),
    },
    "status-update": {
      whatsapp: () => whatsapp.sendStatusUpdate(customer, data.status, complaint.vehicleNumber),
      sms: () => sms.sendStatusUpdate(customer, data.status, complaint.vehicleNumber),
      email: () => email.sendStatusUpdate(customer, data.status, complaint.vehicleNumber),
    },
  };
  const tasks = tasksByStage[jobName];
  if (!tasks) throw new Error(`Unknown notification job type: ${jobName}`);
  return dispatch({ customer, jobName, data, tasks });
};

export async function processNotificationDirectly(jobName, data, options = {}) {
  try {
    let delivery;
    if (jobName === "dispatch-invite") delivery = await processInvite(data);
    else if (jobName === "fraud-escalation") delivery = await processFraudEscalation(data);
    else if (jobName === "processing-failed") delivery = await processFailureEscalation(data);
    else delivery = await processComplaintStage(jobName, data);
    logger.info(`Notification ${jobName} completed through: ${delivery.successfulChannels.join(", ")}`);
    return { success: true, ...delivery };
  } catch (error) {
    logger.error(`Notification failed [${jobName}]: ${error.message}`);
    if (options.throwOnFailure) throw error;
    return { success: false, error: error.message };
  }
}
