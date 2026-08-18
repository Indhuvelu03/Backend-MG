import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { sendError } from "../utils/responseHandler.js";

export const standardLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    sendError(res, "Too many requests, please try again later.", 429);
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Strict limit for auth paths
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    sendError(res, "Too many authentication attempts, please try again later.", 429);
  },
});

export const publicFeedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Very strict limit for public media file uploads
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    sendError(res, "Too many feedback submissions, please try again later.", 429);
  },
});
