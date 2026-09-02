import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import { env } from "../config/env.js";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

export const generateOpaqueToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const encryptionKey = crypto.createHash("sha256").update(env.JWT_SECRET).digest();

export const encryptSecret = value => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
};

export const decryptSecret = value => {
  const [iv, tag, encrypted] = String(value || "").split(".").map(part => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

export const generateMfaSecret = (bytes = 20) => {
  const buffer = crypto.randomBytes(bytes);
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
};

const decodeBase32 = value => {
  const clean = value.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid MFA secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
};

const totpAt = (secret, counter) => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
  return code;
};

export const verifyMfaCode = (secret, code, now = Date.now()) => {
  const normalized = String(code || "").replace(/\s/g, "");
  const counter = Math.floor(now / 30000);
  return [-1, 0, 1].some(window => {
    const expected = totpAt(secret, counter + window);
    return normalized.length === expected.length && crypto.timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
  });
};

export const buildOtpAuthUri = ({ secret, email }) =>
  `otpauth://totp/${encodeURIComponent(env.MFA_ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(env.MFA_ISSUER)}&algorithm=SHA1&digits=6&period=30`;

export const recordSecurityEvent = async ({ userId = null, dealershipId = null, eventType, success = true, ip = null, userAgent = null, metadata = {} }) => {
  await supabase.from("security_events").insert({
    user_id: userId,
    dealership_id: dealershipId,
    event_type: eventType,
    success,
    ip_address: ip,
    user_agent: userAgent,
    metadata,
  });
};

export const createSession = async ({ id, userId, expiresAt, ip, userAgent }) => {
  const { error } = await supabase.from("auth_sessions").insert({
    id,
    user_id: userId,
    expires_at: expiresAt,
    ip_address: ip,
    user_agent: userAgent,
  });
  if (error) throw new Error(`Could not create secure session: ${error.message}`);
};

export const getActiveSession = async (id, userId) => {
  const { data } = await supabase.from("auth_sessions").select("id,expires_at,revoked_at").eq("id", id).eq("user_id", userId).maybeSingle();
  return data && !data.revoked_at && new Date(data.expires_at) > new Date() ? data : null;
};

export const revokeSession = async id => {
  if (!id) return;
  await supabase.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
};

export const revokeAllSessions = async userId => {
  await supabase.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
};
