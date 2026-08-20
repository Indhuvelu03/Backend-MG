// services/feedback.service.js — Supabase-based
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/AppError.js";
import { generateSecureToken } from "../utils/tokenGenerator.js";
import { notificationsQueue } from "../jobs/queue.js";

// 72-hour expiry
const EXPIRY_HOURS = 72;

export const createFeedbackLink = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new AppError("Customer not found", 404);

  const token     = generateSecureToken(20);
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const link = await FeedbackLink.create({ customerId, token, expiresAt });
  return link;
};

// Auto-create link and immediately queue email invite
export const autoCreateAndSendLink = async (customerId) => {
  const link = await createFeedbackLink(customerId);

  // 1. Attempt direct email dispatch immediately with loud diagnostic logs
  try {
    const { sendFeedbackInvite } = await import("./email.service.js");
    const customer = await Customer.findById(customerId);
    if (customer?.email) {
      console.log(`\n🚀 [AUTO DISPATCHING EMAIL FOR NEW CUSTOMER: ${customer.name} (${customer.email})]`);
      await sendFeedbackInvite(customer, link);
    } else {
      console.warn(`⚠️ [AUTO DISPATCH SKIPPED] No email address found for customer ID ${customerId}`);
    }
  } catch (err) {
    console.error(`❌ [DIRECT AUTO-EMAIL DISPATCH ERROR]:`, err.message || err);
  }

  // 2. Also add to notificationsQueue for worker retries
  try {
    await notificationsQueue.add("dispatch-invite", {
      feedbackLinkId: link.id,
    });
  } catch (queueErr) {
    console.warn(`⚠️ [QUEUE ADD SKIPPED]: ${queueErr.message}`);
  }

  return link;
};

export const verifyFeedbackToken = async (token) => {
  const link = await FeedbackLink.findByToken(token);
  if (!link) throw new AppError("Feedback link is invalid or does not exist", 404);

  if (link.status === "SUBMITTED") {
    throw new AppError("This feedback link has already been used to submit response and is now disabled.", 400);
  }

  if (link.isExpired()) {
    if (link.status !== "EXPIRED") {
      await FeedbackLink.updateById(link.id, { status: "EXPIRED" });
    }
    throw new AppError("This feedback link has expired. Please contact the service center.", 410);
  }

  return link;
};

export const enqueueNotificationInvite = async (feedbackLinkId) => {
  const link = await FeedbackLink.findById(feedbackLinkId);
  if (!link) throw new AppError("Feedback link not found", 404);

  await notificationsQueue.add("dispatch-invite", {
    feedbackLinkId: link.id,
  });
};