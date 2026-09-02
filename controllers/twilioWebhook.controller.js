import { env } from "../config/env.js";
import { EmailActivity } from "../models/EmailActivity.js";
import { validateWebhookSignature } from "../services/twilio.service.js";

const signedUrl = (req) => env.PUBLIC_API_BASE_URL
  ? `${env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}${req.originalUrl}`
  : `${req.protocol}://${req.get("host")}${req.originalUrl}`;

export const handleTwilioStatus = async (req, res, next) => {
  try {
    const signature = req.get("x-twilio-signature");
    if (!validateWebhookSignature({ signature, url: signedUrl(req), params: req.body })) {
      return res.status(403).json({ success: false, message: "Invalid Twilio webhook signature" });
    }

    const providerMessageId = req.body.MessageSid || req.body.SmsSid;
    const status = String(req.body.MessageStatus || req.body.SmsStatus || "unknown").toLowerCase();
    if (!providerMessageId) return res.status(204).send();

    await EmailActivity.updateProviderStatus({
      providerMessageId,
      status,
      errorCode: req.body.ErrorCode,
      errorMessage: req.body.ErrorMessage || req.body.ChannelStatusMessage,
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};
