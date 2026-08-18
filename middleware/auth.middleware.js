// middleware/auth.middleware.js — Supabase-based
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { User } from "../models/User.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next(new AppError("Authentication token is missing", 401));
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) return next(new AppError("User no longer exists", 401));
    if (!user.isActive && !user.is_active) return next(new AppError("Account is suspended", 403));

    req.user = user;
    next();
  } catch {
    return next(new AppError("Invalid or expired authentication token", 401));
  }
};