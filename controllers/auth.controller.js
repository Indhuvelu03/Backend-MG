// controllers/auth.controller.js — Supabase-based
import * as authService from "../services/auth.service.js";
import { User } from "../models/User.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";

export const register = async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      if (!req.user || req.user.role !== "ADMIN") {
        throw new AppError("Only administrators can register new accounts.", 403);
      }
    }
    const user = await authService.registerUser(req.body);
    sendSuccess(res, "User registered successfully", user, 201);
  } catch (error) { next(error); }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const payload = await authService.loginUser(email, password);
    sendSuccess(res, "Login successful", payload, 200);
  } catch (error) { next(error); }
};

export const getProfile = async (req, res, next) => {
  try {
    if (!req.user) throw new AppError("No authenticated user context", 404);
    sendSuccess(res, "Profile fetched successfully", req.user, 200);
  } catch (error) { next(error); }
};