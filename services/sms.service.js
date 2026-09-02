import * as twilioService from "./twilio.service.js";

const APP = "AutoAudit AI";
const vehicle = (complaintOrCustomer) => complaintOrCustomer?.vehicleNumber || complaintOrCustomer?.vehicle_number || "vehicle";

const template = (stage, values) => {
  const contentSid = process.env[`TWILIO_SMS_CONTENT_SID_${stage}`];
  return contentSid ? { contentSid, contentVariables: values } : {};
};

const send = (customer, stage, body, values) => twilioService.sendSMS({
  to: customer.mobile,
  body,
  ...template(stage, values),
});

export const sendFeedbackInvite = async (customer, link) => {
  const vNum = vehicle(customer);
  const url = `${process.env.PUBLIC_FEEDBACK_BASE_URL || "http://localhost:3000/feedback"}/${link.token}`;
  return send(customer, "FEEDBACK_INVITE", `Hello ${customer.name}, please share your service feedback for ${vNum}: ${url}`, { "1": customer.name, "2": vNum, "3": url });
};

export const sendComplaintReceived = async (customer, complaint) => {
  const vNum = vehicle(complaint);
  return send(customer, "COMPLAINT_RECEIVED", `[${APP}] We received your complaint for ${vNum}. Our team is reviewing it.`, { "1": customer.name, "2": vNum, "3": "Complaint received" });
};

export const sendVoiceNoteProcessing = async (customer, complaint) => {
  const vNum = vehicle(complaint);
  return send(customer, "VOICE_PROCESSING", `[${APP}] Your feedback for ${vNum} is being securely transcribed and reviewed.`, { "1": customer.name, "2": vNum, "3": "Feedback processing" });
};

export const sendInvoiceUploaded = async (customer, complaint) => {
  const vNum = vehicle(complaint);
  return send(customer, "INVOICE_UPLOADED", `[${APP}] The service invoice for ${vNum} was received and is being verified.`, { "1": customer.name, "2": vNum, "3": "Invoice uploaded" });
};

export const sendAuditComplete = async (customer, complaint, score) => {
  const vNum = vehicle(complaint);
  const result = Number(score) >= 80 ? "Service verified" : "Sent for quality review";
  return send(customer, "AUDIT_COMPLETE", `[${APP}] Audit completed for ${vNum}. Result: ${result}.`, { "1": customer.name, "2": vNum, "3": result });
};

export const sendNeedsReview = async (customer, complaint) => {
  const vNum = vehicle(complaint);
  return send(customer, "NEEDS_REVIEW", `[${APP}] Your feedback for ${vNum} needs a quick manual quality review. No action is required from you.`, { "1": customer.name, "2": vNum, "3": "Manual review" });
};

export const sendProcessingFailed = async (customer, complaint) => {
  const vNum = vehicle(complaint);
  return send(customer, "PROCESSING_FAILED", `[${APP}] Automated processing for ${vNum} needs staff attention. Your submission is safe.`, { "1": customer.name, "2": vNum, "3": "Staff attention required" });
};

export const sendStatusUpdate = async (customer, status, vehicleNumber) => send(
  customer,
  "STATUS_UPDATE",
  `[${APP}] Service update for ${vehicleNumber}: ${status}.`,
  { "1": customer.name, "2": vehicleNumber, "3": status },
);

export const sendFraudEscalation = async (manager, details) => send(
  manager,
  "FRAUD_ESCALATION",
  `[${APP}] High-severity discrepancy for ${details.vehicleNumber}. Audit score: ${details.score}%. Review immediately.`,
  { "1": details.customerName || "Customer", "2": details.vehicleNumber, "3": `${details.score}%` },
);
