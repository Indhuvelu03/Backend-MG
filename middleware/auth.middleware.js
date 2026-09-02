// middleware/auth.middleware.js — Supabase-based
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { User } from "../models/User.js";
import { getActiveSession } from "../services/security.service.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next(new AppError("Authentication token is missing", 401));
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.purpose || !decoded.jti) return next(new AppError("Invalid authentication token", 401));
    const user = await User.findById(decoded.id);

    if (!user) return next(new AppError("User no longer exists", 401));
    if (!user.isActive && !user.is_active) return next(new AppError("Account is suspended", 403));
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) return next(new AppError("Session has been revoked", 401));
    const session = await getActiveSession(decoded.jti, user.id);
    if (!session) return next(new AppError("Session has expired or been revoked", 401));

    req.user = user;
    req.authSessionId = decoded.jti;
    next();
  } catch {
    return next(new AppError("Invalid or expired authentication token", 401));
  }
};
