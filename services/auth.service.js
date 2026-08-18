// services/auth.service.js — Supabase-based with auto-seeding
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";

// Auto-seed default Super Admin and Service Advisor if missing
export const seedDefaultUsers = async () => {
  try {
    const { data: admin } = await supabase.from("users").select("id").eq("email", "admin@example.com").maybeSingle();
    if (!admin) {
      await User.create({
        name: "System Administrator",
        email: "admin@example.com",
        password: "Admin@123456",
        role: "ADMIN",
      });
      logger.info("✅ Auto-seeded default admin user: admin@example.com");
    }

    const { data: staff } = await supabase.from("users").select("id").eq("email", "staff@example.com").maybeSingle();
    if (!staff) {
      await User.create({
        name: "Service Advisor Staff",
        email: "staff@example.com",
        password: "Staff@123456",
        role: "STAFF",
      });
      logger.info("✅ Auto-seeded default staff user: staff@example.com");
    }
  } catch (err) {
    // Silent fail if tables not created yet
  }
};

export const registerUser = async (userData) => {
  const emailLower = userData.email?.toLowerCase();
  const existing   = await User.findByEmail(emailLower);
  if (existing)    throw new AppError("Email is already in use", 400);

  const count = await User.countDocuments();
  if (count === 0) userData.role = "ADMIN"; // first user = admin

  const user = await User.create(userData);
  return user;
};

export const loginUser = async (email, password) => {
  const emailLower = email.toLowerCase().trim();

  // Attempt auto-seed first if it's default accounts
  if (emailLower === "admin@example.com" || emailLower === "staff@example.com") {
    await seedDefaultUsers();
  }

  // Get user with password hash
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", emailLower)
    .maybeSingle();

  if (error || !data) {
    logger.error(`Login failed for ${emailLower}: user record not found in database`);
    throw new AppError("Invalid email or password", 401);
  }

  const isMatch = await User.comparePassword(data.password, password);
  if (!isMatch) {
    logger.error(`Login failed for ${emailLower}: password mismatch`);
    throw new AppError("Invalid email or password", 401);
  }

  if (!data.is_active) throw new AppError("Account is inactive. Contact administrator.", 403);

  const token = jwt.sign(
    { id: data.id, role: data.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );

  return {
    token,
    user: { _id: data.id, id: data.id, name: data.name, email: data.email, role: data.role },
  };
};

export const getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);
  return user;
};