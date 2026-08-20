import { FeedbackLink } from "../models/FeedbackLink.js";
import { logger } from "../utils/logger.js";

const expireLinks = async () => {
  try {
    await FeedbackLink.expirePendingLinks();
    logger.info("Expired feedback links sweep completed");
  } catch (error) {
    logger.error(`Feedback link expiry sweep failed: ${error.message}`);
  }
};

// Run at worker startup and hourly thereafter. Token validation independently
// enforces expiry, so a link cannot be used between scheduled sweeps.
expireLinks();
setInterval(expireLinks, 60 * 60 * 1000).unref();
