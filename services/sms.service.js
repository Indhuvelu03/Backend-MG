// services/sms.service.js — High-level SMS notifications via Twilio Service
import * as twilioService from "./twilio.service.js";
import { logger }          from "../utils/logger.js";

const APP = "AutoAudit AI";

/**
 * Send feedback invite link via SMS
 */
export const sendFeedbackInvite = async (customer, link) => {
  if (!customer?.mobile) return;
  const vNum = customer.vehicleNumber || customer.vehicle_number || "vehicle";
  const url  = `${process.env.PUBLIC_FEEDBACK_BASE_URL || "http://localhost:3000/feedback"}/${link.token}`;
  
  const body = `Hello ${customer.name}, thank you for choosing ${customer.serviceCenter || customer.service_center || "our workshop"} for ${vNum}. Please share your service feedback (no login required): ${url}`;
  return twilioService.sendSMS({ to: customer.mobile, body });
};

/**
 * Send complaint received SMS
 */
export const sendComplaintReceived = async (customer, complaint) => {
  if (!customer?.mobile) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const body = `[${APP}] Hello ${customer.name}, we have received your voice complaint for vehicle ${vNum}. Our team is reviewing it now.`;
  return twilioService.sendSMS({ to: customer.mobile, body });
};

/**
 * Send invoice uploaded SMS
 */
export const sendInvoiceUploaded = async (customer, complaint) => {
  if (!customer?.mobile) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const body = `[${APP}] Service invoice for ${vNum} has been received and is undergoing automated verification.`;
  return twilioService.sendSMS({ to: customer.mobile, body });
};

/**
 * Send audit complete SMS
 */
export const sendAuditComplete = async (customer, complaint, score) => {
  if (!customer?.mobile) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const isMatch = score >= 80;
  
  const body = isMatch
    ? `[${APP}] Great news ${customer.name}! All reported issues for vehicle ${vNum} have been serviced & verified. Your vehicle is ready for pickup!`
    : `[${APP}] Hello ${customer.name}, vehicle ${vNum} service is undergoing final Quality Assurance inspection by our Senior Manager. We will notify you once ready.`;

  return twilioService.sendSMS({ to: customer.mobile, body });
};