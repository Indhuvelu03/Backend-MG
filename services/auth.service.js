// services/auth.service.js — Supabase-based authentication
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import crypto from "crypto";
import { logger } from "../utils/logger.js";
import * as security from "./security.service.js";
import * as emailService from "./email.service.js";

export const registerUser = async (userData) => {
  const emailLower = userData.email?.toLowerCase();
  const existing   = await User.findByEmail(emailLower);
  if (existing)    throw new AppError("Email is already in use", 400);

  const user = await User.create(userData);
  return user;
};

const publicUser = user => ({
  _id: user.id,
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  dealershipId: user.dealershipId || user.dealership_id || null,
  mfaEnabled: Boolean(user.mfaEnabled || user.mfa_enabled),
});

const issueSession = async (user, context = {}) => {
  const sessionId = crypto.randomUUID();
  const token = jwt.sign(
    { id: user.id, role: user.role, dealershipId: user.dealershipId || user.dealership_id || null, jti: sessionId, tokenVersion: user.tokenVersion || user.token_version || 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
  const decoded = jwt.decode(token);
  await security.createSession({
    id: sessionId,
    userId: user.id,
    expiresAt: new Date(decoded.exp * 1000).toISOString(),
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return { token, user: publicUser(user) };
};

export const loginUser = async (email, password, context = {}) => {
  const emailLower = email.toLowerCase().trim();

  // Get user with password hash
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", emailLower)
    .maybeSingle();

  if (error || !data) {
    logger.error(`Login failed for ${emailLower}: user record not found in database`);
    await security.recordSecurityEvent({ eventType: "LOGIN_FAILED", success: false, ip: context.ip, userAgent: context.userAgent, metadata: { email: emailLower, reason: "invalid_credentials" } }).catch(() => {});
    throw new AppError("Invalid email or password", 401);
  }

  const isMatch = await User.comparePassword(data.password, password);
  if (!isMatch) {
    logger.error(`Login failed for ${emailLower}: password mismatch`);
    await security.recordSecurityEvent({ userId: data.id, dealershipId: data.dealership_id, eventType: "LOGIN_FAILED", success: false, ip: context.ip, userAgent: context.userAgent, metadata: { reason: "invalid_credentials" } }).catch(() => {});
    throw new AppError("Invalid email or password", 401);
  }

  if (!data.is_active) throw new AppError("Account is inactive. Contact administrator.", 403);

  const normalizedUser = await User.findById(data.id);
  if (normalizedUser.mfaEnabled) {
    const mfaToken = jwt.sign({ id: data.id, purpose: "mfa" }, env.JWT_SECRET, { expiresIn: "5m" });
    await security.recordSecurityEvent({ userId: data.id, dealershipId: data.dealership_id, eventType: "MFA_CHALLENGE", ip: context.ip, userAgent: context.userAgent }).catch(() => {});
    return { mfaRequired: true, mfaToken };
  }

  const session = await issueSession(normalizedUser, context);
  await security.recordSecurityEvent({ userId: data.id, dealershipId: data.dealership_id, eventType: "LOGIN_SUCCESS", ip: context.ip, userAgent: context.userAgent });
  return session;
};

export const verifyLoginMfa = async (mfaToken, code, context = {}) => {
  let decoded;
  try { decoded = jwt.verify(mfaToken, env.JWT_SECRET); } catch { throw new AppError("MFA challenge expired. Sign in again.", 401); }
  if (decoded.purpose !== "mfa") throw new AppError("Invalid MFA challenge", 401);
  const { data } = await supabase.from("users").select("*").eq("id", decoded.id).maybeSingle();
  if (!data?.mfa_enabled || !data.mfa_secret_encrypted) throw new AppError("MFA is not configured", 400);
  const valid = security.verifyMfaCode(security.decryptSecret(data.mfa_secret_encrypted), code);
  if (!valid) {
    await security.recordSecurityEvent({ userId: data.id, dealershipId: data.dealership_id, eventType: "MFA_FAILED", success: false, ip: context.ip, userAgent: context.userAgent }).catch(() => {});
    throw new AppError("Invalid authentication code", 401);
  }
  const user = await User.findById(data.id);
  const session = await issueSession(user, context);
  await security.recordSecurityEvent({ userId: data.id, dealershipId: data.dealership_id, eventType: "LOGIN_SUCCESS_MFA", ip: context.ip, userAgent: context.userAgent });
  return session;
};

export const requestPasswordReset = async (email, context = {}) => {
  const user = await User.findByEmail(email.toLowerCase().trim());
  if (!user) return;
  const token = security.generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRES_MINUTES * 60000).toISOString();
  await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("user_id", user.id).is("used_at", null);
  const { error } = await supabase.from("password_reset_tokens").insert({ user_id: user.id, token_hash: security.hashToken(token), expires_at: expiresAt, requested_ip: context.ip });
  if (error) throw new Error(error.message);
  await emailService.sendPasswordReset(user, `${env.CLIENT_URL}/reset-password/${token}`, env.PASSWORD_RESET_EXPIRES_MINUTES);
  await security.recordSecurityEvent({ userId: user.id, dealershipId: user.dealershipId, eventType: "PASSWORD_RESET_REQUESTED", ip: context.ip, userAgent: context.userAgent });
};

export const resetPassword = async (token, password, context = {}) => {
  const { data } = await supabase.from("password_reset_tokens").select("*").eq("token_hash", security.hashToken(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data) throw new AppError("Password reset link is invalid or expired", 400);
  await User.updatePassword(data.user_id, password);
  await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  await security.revokeAllSessions(data.user_id);
  await security.recordSecurityEvent({ userId: data.user_id, eventType: "PASSWORD_RESET_COMPLETED", ip: context.ip, userAgent: context.userAgent });
};

export const setupMfa = async user => {
  const secret = security.generateMfaSecret();
  await User.updateMfa(user.id, { encryptedSecret: security.encryptSecret(secret), enabled: false });
  return { secret, otpAuthUri: security.buildOtpAuthUri({ secret, email: user.email }) };
};

export const enableMfa = async (user, code) => {
  const { data } = await supabase.from("users").select("mfa_secret_encrypted").eq("id", user.id).single();
  if (!data?.mfa_secret_encrypted || !security.verifyMfaCode(security.decryptSecret(data.mfa_secret_encrypted), code)) throw new AppError("Invalid authentication code", 400);
  await User.updateMfa(user.id, { enabled: true });
  await security.recordSecurityEvent({ userId: user.id, dealershipId: user.dealershipId, eventType: "MFA_ENABLED" });
};

export const disableMfa = async (user, code) => {
  const { data } = await supabase.from("users").select("mfa_secret_encrypted").eq("id", user.id).single();
  if (!data?.mfa_secret_encrypted || !security.verifyMfaCode(security.decryptSecret(data.mfa_secret_encrypted), code)) throw new AppError("Invalid authentication code", 400);
  await User.updateMfa(user.id, { encryptedSecret: null, enabled: false });
  await security.revokeAllSessions(user.id);
  await security.recordSecurityEvent({ userId: user.id, dealershipId: user.dealershipId, eventType: "MFA_DISABLED" });
};

export const getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);
  return user;
};
