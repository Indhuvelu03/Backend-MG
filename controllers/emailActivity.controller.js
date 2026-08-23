import { EmailActivity } from "../models/EmailActivity.js";
import { sendSuccess } from "../utils/responseHandler.js";

export const listEmailActivities = async (req, res, next) => {
  try {
    const activities = await EmailActivity.list({ limit: req.query.limit });
    sendSuccess(res, "Email activity retrieved successfully", activities, 200);
  } catch (error) {
    next(error);
  }
};
