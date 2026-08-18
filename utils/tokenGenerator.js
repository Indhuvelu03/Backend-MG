// utils/tokenGenerator.js
import crypto from "crypto";

export const generateSecureToken = (length = 16) => {
  return crypto.randomBytes(length).toString("hex");
};