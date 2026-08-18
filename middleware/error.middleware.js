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
  });

  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // Handle mongoose validation errors
  if (err.name === "ValidationError") {
    sendError(res, "Validation Error", 400, { message: err.message });
    return;
  }

  if (err.name === "CastError") {
    sendError(res, "Invalid resource identifier format", 400);
    return;
  }

  // Catch-all
  const message = env.NODE_ENV === "production" ? "Internal Server Error" : err.message;
  sendError(res, message, 500);
};