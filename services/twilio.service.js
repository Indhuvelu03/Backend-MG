// services/twilio.service.js — Smart Twilio Provider (Real API + Mock Sandbox Mode)
import twilio from "twilio";
import { logger } from "../utils/logger.js";

const accountSid     = process.env.TWILIO_ACCOUNT_SID || "";
const authToken      = process.env.TWILIO_AUTH_TOKEN || "";
const smsNumber      = process.env.TWILIO_SMS_NUMBER || "+15005550006";
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || "+14155238886";

// Determine if real Twilio credentials are provided
const isRealTwilioConfigured = () => {
  if (!accountSid || !authToken) return false;
  if (accountSid.startsWith("dummy_") || authToken.startsWith("dummy_")) return false;
  if (!accountSid.startsWith("AC")) return false;
  return true;
};

let client = null;
if (isRealTwilioConfigured()) {
  try {
    client = twilio(accountSid, authToken);
    logger.info("📱 Twilio Client initialized in LIVE production mode");
  } catch (err) {
    logger.warn(`⚠️ Twilio Client init failed (${err.message}). Defaulting to MOCK mode.`);
    client = null;
  }
} else {
  logger.info("📱 Twilio running in MOCK/SANDBOX Mode (No real API key needed — SMS/WhatsApp dispatches will be simulated)");
}

/**
 * Dispatch SMS message (Real Twilio API if keys present, else Mock Sandbox)
 */
export const sendSMS = async ({ to, body }) => {
  const recipient = to.startsWith("+") ? to : `+${to}`;

  if (client) {
    try {
      const message = await client.messages.create({
        body,
        from: smsNumber,
        to: recipient,
      });
      logger.info(`✅ [LIVE TWILIO SMS] Dispatched to ${recipient} | SID: ${message.sid}`);
      return { success: true, sid: message.sid, live: true };
    } catch (error) {
      logger.error(`❌ [LIVE TWILIO SMS FAILED] to ${recipient}: ${error.message}`);
      throw error;
    }
  } else {
    // ── MOCK SANDBOX MODE ───────────────────────────────────────────────────
    const mockSid = `SM_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    logger.info(`📱 [MOCK TWILIO SMS] To: ${recipient}`);
    logger.info(`   └── Body: "${body.substring(0, 100)}${body.length > 100 ? "..." : ""}"`);
    logger.info(`   └── Status: Simulated Success | Mock SID: ${mockSid}`);
    return { success: true, sid: mockSid, live: false, mock: true };
  }
};

/**
 * Dispatch WhatsApp message (Real Twilio API if keys present, else Mock Sandbox)
 */
export const sendWhatsApp = async ({ to, body, contentSid, contentVariables }) => {
  const cleanNumber = to.replace(/[^0-9]/g, "");
  const recipient   = `whatsapp:+${cleanNumber}`;
  const sender      = whatsappNumber.startsWith("whatsapp:") ? whatsappNumber : `whatsapp:${whatsappNumber}`;

  if (client) {
    try {
      const payload = { from: sender, to: recipient };
      if (contentSid) {
        payload.contentSid       = contentSid;
        payload.contentVariables = typeof contentVariables === "string" ? contentVariables : JSON.stringify(contentVariables || {});
      } else {
        payload.body = body;
      }

      const message = await client.messages.create(payload);
      logger.info(`✅ [LIVE TWILIO WHATSAPP] Dispatched to ${recipient} | SID: ${message.sid}`);
      return { success: true, sid: message.sid, live: true };
    } catch (error) {
      logger.error(`❌ [LIVE TWILIO WHATSAPP FAILED] to ${recipient}: ${error.message}`);
      throw error;
    }
  } else {
    // ── MOCK SANDBOX MODE ───────────────────────────────────────────────────
    const mockSid = `WA_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    logger.info(`💬 [MOCK TWILIO WHATSAPP] To: ${recipient}`);
    logger.info(`   └── Body: "${(body || "WhatsApp Template Payload").substring(0, 100)}"`);
    logger.info(`   └── Status: Simulated Success | Mock SID: ${mockSid}`);
    return { success: true, sid: mockSid, live: false, mock: true };
  }
};

/**
 * Check mode helper
 */
export const isLive = () => isRealTwilioConfigured();
