import { EmailActivity } from "../models/EmailActivity.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { getEffectiveTenantId } from "../middleware/tenant.middleware.js";
import { maskEmail, maskMobile } from "../utils/privacy.js";

export const listEmailActivities = async (req, res, next) => {
  try {
    const dealershipId = getEffectiveTenantId(req, req.query.dealershipId);
    const activities = await EmailActivity.list({ limit: req.query.limit || 200, dealershipId });

    const protectedActivities = req.user?.role === "STAFF"
      ? activities.map(activity => ({
          ...activity,
          recipient: activity.channel === "email"
            ? maskEmail(activity.recipient)
            : maskMobile(activity.recipient),
        }))
      : activities;
    sendSuccess(res, "Email activity retrieved successfully", protectedActivities, 200);
  } catch (error) {
    next(error);
  }
};
