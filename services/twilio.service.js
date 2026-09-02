import twilio from "twilio";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const accountSid = (env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = (env.TWILIO_AUTH_TOKEN || "").trim();
const smsNumber = (env.TWILIO_SMS_NUMBER || "").trim();
const whatsappNumber = (env.TWILIO_WHATSAPP_NUMBER || "").trim();

const hasLiveCredentials = () => Boolean(
  accountSid.startsWith("AC")
  && authToken
  && !accountSid.toLowerCase().includes("dummy")
  && !authToken.toLowerCase().includes("dummy"),
);

let client = null;
if (hasLiveCredentials()) {
  try {
    client = twilio(accountSid, authToken);
    logger.info("Twilio client initialized with live credentials");
  } catch (error) {
    logger.error(`Twilio client initialization failed: ${error.message}`);
  }
} else {
  logger.info("Twilio is not configured; WhatsApp/SMS will be skipped while email delivery remains available");
}

export const normalizeE164 = (value, defaultCountryCode = env.DEFAULT_PHONE_COUNTRY_CODE) => {
  const raw = String(value || "").trim().replace(/^whatsapp:/i, "");
  if (!raw) throw new Error("Recipient phone number is missing");

  let digits;
  if (raw.startsWith("+")) {
    digits = raw.slice(1).replace(/\D/g, "");
  } else if (raw.startsWith("00")) {
    digits = raw.slice(2).replace(/\D/g, "");
  } else {
    const localDigits = raw.replace(/\D/g, "").replace(/^0+/, "");
    const countryDigits = String(defaultCountryCode || "").replace(/\D/g, "");
    if (!countryDigits) throw new Error("DEFAULT_PHONE_COUNTRY_CODE is invalid");
    digits = localDigits.startsWith(countryDigits) && localDigits.length > 10
      ? localDigits
      : `${countryDigits}${localDigits}`;
  }

  if (!/^\d{8,15}$/.test(digits)) throw new Error(`Invalid E.164 phone number: ${value}`);
  return `+${digits}`;
};

const callbackUrl = () => env.PUBLIC_API_BASE_URL
  ? `${env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}/api/webhooks/twilio/status`
  : undefined;

const requireChannel = (channel) => {
  if (!client) throw new Error("Twilio live credentials are not configured");
  if (channel === "sms" && !smsNumber) throw new Error("TWILIO_SMS_NUMBER is not configured");
  if (channel === "whatsapp" && !whatsappNumber) throw new Error("TWILIO_WHATSAPP_NUMBER is not configured");
};

export const isChannelLive = (channel) => {
  if (!client) return false;
  if (channel === "sms") return Boolean(smsNumber);
  if (channel === "whatsapp") return Boolean(whatsappNumber);
  return false;
};

export const sendSMS = async ({ to, body, contentSid, contentVariables }) => {
  requireChannel("sms");
  const recipient = normalizeE164(to);
  const payload = {
    from: normalizeE164(smsNumber, "+1"),
    to: recipient,
    ...(callbackUrl() ? { statusCallback: callbackUrl() } : {}),
  };
  if (contentSid) {
    payload.contentSid = contentSid;
    payload.contentVariables = typeof contentVariables === "string"
      ? contentVariables
      : JSON.stringify(contentVariables || {});
  } else {
    payload.body = body;
  }

  try {
    const message = await client.messages.create(payload);
    logger.info(`Twilio SMS accepted for ${recipient} (SID: ${message.sid}, status: ${message.status})`);
    return { success: true, sid: message.sid, status: message.status || "queued", live: true, channel: "sms" };
  } catch (error) {
    logger.error(`Twilio SMS request failed for ${recipient}: ${error.message}`);
    throw error;
  }
};

export const sendWhatsApp = async ({ to, body, contentSid, contentVariables }) => {
  requireChannel("whatsapp");
  const recipientNumber = normalizeE164(to);
  const senderNumber = normalizeE164(whatsappNumber, "+1");
  const payload = {
    from: `whatsapp:${senderNumber}`,
    to: `whatsapp:${recipientNumber}`,
    ...(callbackUrl() ? { statusCallback: callbackUrl() } : {}),
  };
  if (contentSid) {
    payload.contentSid = contentSid;
    payload.contentVariables = typeof contentVariables === "string"
      ? contentVariables
      : JSON.stringify(contentVariables || {});
  } else {
    payload.body = body;
  }

  try {
    const message = await client.messages.create(payload);
    logger.info(`Twilio WhatsApp accepted for ${recipientNumber} (SID: ${message.sid}, status: ${message.status})`);
    return { success: true, sid: message.sid, status: message.status || "queued", live: true, channel: "whatsapp" };
  } catch (error) {
    logger.error(`Twilio WhatsApp request failed for ${recipientNumber}: ${error.message}`);
    throw error;
  }
};

export const isLive = () => hasLiveCredentials();

export const validateWebhookSignature = ({ signature, url, params }) => Boolean(
  signature
  && authToken
  && twilio.validateRequest(authToken, signature, url, params),
);
