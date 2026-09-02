// controllers/auth.controller.js — Supabase-based
import * as authService from "../services/auth.service.js";
import { User } from "../models/User.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { revokeAllSessions, revokeSession } from "../services/security.service.js";
import { getEffectiveTenantId } from "../middleware/tenant.middleware.js";

const requestContext = req => ({ ip: req.ip, userAgent: req.get("user-agent") || null });

export const register = async (req, res, next) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      if (req.user.role === "DEALER") {
        // Dealers can only create STAFF (Service Advisors), max 3 per dealership
        if (req.body.role && req.body.role !== "STAFF") {
          throw new AppError("Dealers can only create Service Advisor accounts.", 403);
        }
        if (!req.user.dealershipId) {
          throw new AppError("Dealer account has no associated dealership. Contact admin.", 403);
        }
        // Count existing staff for this dealership
        const { data: staffRows } = await (await import("../config/supabase.js")).supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("dealership_id", req.user.dealershipId)
          .eq("role", "STAFF");
        const staffCount = staffRows ?? 0;
        const { count: exactCount } = await (await import("../config/supabase.js")).supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("dealership_id", req.user.dealershipId);
        if ((exactCount ?? 0) >= 4) { // 1 dealer + 3 staff = 4 max
          throw new AppError("Maximum 3 Service Advisors allowed per dealership.", 403);
        }
        // Force role and dealership
        req.body.role = "STAFF";
        req.body.dealership_id = req.user.dealershipId;
      } else if (req.user.role !== "ADMIN") {
        throw new AppError("Only administrators can register new accounts.", 403);
      }

      if (req.user.role === "ADMIN" && req.body.role === "DEALER" && !(req.body.dealershipId || req.body.dealership_id)) {
        throw new AppError("A dealership manager must be linked to a dealership branch.", 400);
      }
    }
    const user = await authService.registerUser(req.body);
    sendSuccess(res, "User registered successfully", user, 201);
  } catch (error) { next(error); }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const payload = await authService.loginUser(email, password, requestContext(req));
    sendSuccess(res, payload.mfaRequired ? "Authentication code required" : "Login successful", payload, 200);
  } catch (error) { next(error); }
};

export const verifyMfaLogin = async (req, res, next) => {
  try {
    const payload = await authService.verifyLoginMfa(req.body.mfaToken, req.body.code, requestContext(req));
    sendSuccess(res, "Login successful", payload, 200);
  } catch (error) { next(error); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    await authService.requestPasswordReset(req.body.email, requestContext(req));
    sendSuccess(res, "If that account exists, a password reset email has been sent", null, 200);
  } catch (error) { next(error); }
};

export const resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password, requestContext(req));
    sendSuccess(res, "Password reset successful. Please sign in again", null, 200);
  } catch (error) { next(error); }
};

export const beginMfaSetup = async (req, res, next) => {
  try { sendSuccess(res, "MFA setup created", await authService.setupMfa(req.user), 200); } catch (error) { next(error); }
};

export const enableMfa = async (req, res, next) => {
  try { await authService.enableMfa(req.user, req.body.code); sendSuccess(res, "MFA enabled", null, 200); } catch (error) { next(error); }
};

export const disableMfa = async (req, res, next) => {
  try { await authService.disableMfa(req.user, req.body.code); sendSuccess(res, "MFA disabled. Sign in again", null, 200); } catch (error) { next(error); }
};

export const logout = async (req, res, next) => {
  try { await revokeSession(req.authSessionId); sendSuccess(res, "Logged out", null, 200); } catch (error) { next(error); }
};

export const logoutAll = async (req, res, next) => {
  try { await revokeAllSessions(req.user.id); sendSuccess(res, "All sessions revoked", null, 200); } catch (error) { next(error); }
};

export const getProfile = async (req, res, next) => {
  try {
    if (!req.user) throw new AppError("No authenticated user context", 404);
    sendSuccess(res, "Profile fetched successfully", req.user, 200);
  } catch (error) { next(error); }
};

export const listUsers = async (req, res, next) => {
  try {
    const allUsers = await User.findAll();
    const dealershipId = getEffectiveTenantId(req, req.query.dealershipId);
    const users = dealershipId
      ? allUsers.filter(u => (u.dealershipId || u.dealership_id) === dealershipId)
      : allUsers;
    sendSuccess(res, "Users fetched successfully", users, 200);
  } catch (error) { next(error); }
};

export const updateUser = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) throw new AppError("User not found", 404);

    // Non-admin rules
    if (req.user.role !== "ADMIN") {
      // Must be editing own profile or a staff member in the same dealership
      const userTenant = req.user.dealershipId || req.user.dealership_id;
      const targetTenant = target.dealershipId || target.dealership_id;

      if (req.params.id !== req.user.id && targetTenant !== userTenant) {
        throw new AppError("You can only update user accounts within your dealership branch.", 403);
      }

      // Prevent non-admins from changing roles or dealership affiliation
      delete req.body.role;
      delete req.body.dealership_id;
      delete req.body.dealershipId;
    }

    const updated = await User.update(req.params.id, req.body);
    sendSuccess(res, "User updated successfully", updated, 200);
  } catch (error) { next(error); }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw new AppError("You cannot delete your own account", 400);
    // Dealers can only delete staff within their dealership
    if (req.user.role === "DEALER") {
      const target = await User.findById(req.params.id);
      if (!target) throw new AppError("User not found", 404);
      if ((target.dealershipId || target.dealership_id) !== req.user.dealershipId) {
        throw new AppError("You can only delete staff in your own dealership.", 403);
      }
    }
    await User.delete(req.params.id);
    sendSuccess(res, "User deleted successfully", null);
  } catch (error) { next(error); }
};
