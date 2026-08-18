// services/whatsapp.service.js — High-level WhatsApp notifications via Twilio Service
import * as twilioService from "./twilio.service.js";

const APP = "AutoAudit AI";

/**
 * Send feedback invite via WhatsApp
 */
export const sendFeedbackInvite = async (customer, link) => {
  if (!customer?.mobile) return;
  const vNum = customer.vehicleNumber || customer.vehicle_number || "vehicle";
  const url  = `${process.env.PUBLIC_FEEDBACK_BASE_URL || "http://localhost:3000/feedback"}/${link.token}`;
  
  const body = `*${APP} Service Feedback*\n\nHello ${customer.name}, thank you for choosing ${customer.serviceCenter || customer.service_center || "our workshop"} for *${vNum}*.\n\nPlease record your voice feedback here (no login required):\n👉 ${url}`;
  return twilioService.sendWhatsApp({ to: customer.mobile, body });
};

/**
 * Send complaint received WhatsApp
 */
export const sendComplaintReceived = async (customer, complaint) => {
  if (!customer?.mobile) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const body = `*${APP} Status Update*\n\nHello ${customer.name}, we have received your voice complaint for vehicle *${vNum}*. Our service team is reviewing it now.`;
  return twilioService.sendWhatsApp({ to: customer.mobile, body });
};

/**
 * Send invoice uploaded WhatsApp
 */
export const sendInvoiceUploaded = async (customer, complaint) => {
  if (!customer?.mobile) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const body = `*${APP} Status Update*\n\nService invoice for *${vNum}* has been received and is undergoing automated AI audit verification.`;
  return twilioService.sendWhatsApp({ to: customer.mobile, body });
};

/**
 * Send audit complete WhatsApp
 */
export const sendAuditComplete = async (customer, complaint, score) => {
  if (!customer?.mobile) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const isMatch = score >= 80;
  
  const body = isMatch
    ? `*${APP} Vehicle Ready!* 🚗\n\nGreat news ${customer.name}! All reported issues for vehicle *${vNum}* have been serviced & verified.\n\nYour vehicle is ready for pickup!`
    : `*${APP} Quality Assurance Review*\n\nHello ${customer.name}, vehicle *${vNum}* service is undergoing final Quality Assurance inspection by our Senior Manager. We will notify you once ready.`;

  return twilioService.sendWhatsApp({ to: customer.mobile, body });
};