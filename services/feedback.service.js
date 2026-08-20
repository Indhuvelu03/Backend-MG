import { FeedbackLink } from "../models/FeedbackLink.js";
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/AppError.js";
import { generateSecureToken } from "../utils/tokenGenerator.js";
import { notificationsQueue } from "../jobs/queue.js";
import { logger } from "../utils/logger.js";

const EXPIRY_HOURS = 72;

export const createFeedbackLink = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new AppError("Customer not found", 404);

  return FeedbackLink.create({
    customerId,
    token: generateSecureToken(20),
    expiresAt: new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString(),
  });
};

// A single durable queue job is the source of truth for invite delivery.
// Sending directly here previously created duplicates and hid delivery errors.
export const autoCreateAndSendLink = async (customerId) => {
  const link = await createFeedbackLink(customerId);
  const job = await notificationsQueue.add("dispatch-invite", {
    feedbackLinkId: link.id,
  }, { jobId: `invite-${link.id}` });
  logger.info(`Queued feedback invite job ${job.id} for link ${link.id}`);
  return link;
};

export const verifyFeedbackToken = async (token) => {
  const link = await FeedbackLink.findByToken(token);
  if (!link) throw new AppError("Feedback link is invalid or does not exist", 404);
  if (link.status === "SUBMITTED") {
    throw new AppError("This feedback link has already been used to submit response and is now disabled.", 400);
  }
  if (link.isExpired()) {
    if (link.status !== "EXPIRED") await FeedbackLink.updateById(link.id, { status: "EXPIRED" });
    throw new AppError("This feedback link has expired. Please contact the service center.", 410);
  }
  return link;
};

export const enqueueNotificationInvite = async (feedbackLinkId) => {
  const link = await FeedbackLink.findById(feedbackLinkId);
  if (!link) throw new AppError("Feedback link not found", 404);
  return notificationsQueue.add("dispatch-invite", {
    feedbackLinkId: link.id,
  }, { jobId: `invite-${link.id}` });
};
