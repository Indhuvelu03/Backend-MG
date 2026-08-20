// src/middleware/error.middleware.js
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { sendError } from "../utils/responseHandler.js";
import { env } from "../config/env.js";

// Express error handling middleware must have 4 parameters
export const errorHandler = (err, req, res, next) => {
  logger.error(`Request Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, { ...err.errors, requestId: req.requestId });
    return;
  }

  // Handle mongoose validation errors
  if (err.name === "ValidationError") {
    sendError(res, "Validation Error", 400, { message: err.message, requestId: req.requestId });
    return;
  }

  if (err.name === "CastError") {
    sendError(res, "Invalid resource identifier format", 400, { requestId: req.requestId });
    return;
  }

  // Catch-all
  const message = env.NODE_ENV === "production"
    ? `Internal Server Error. Reference: ${req.requestId}`
    : err.message;
  sendError(res, message, 500, { requestId: req.requestId });
};
