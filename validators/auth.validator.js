import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(10, "Password must be at least 10 characters").regex(/[A-Z]/, "Add an uppercase letter").regex(/[a-z]/, "Add a lowercase letter").regex(/[0-9]/, "Add a number"),
  role: z.enum(["ADMIN", "DEALER", "STAFF"]).optional(),
  phone: z.string().optional().nullable(),
  dealershipId: z.string().optional().nullable(),
  dealership_id: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});


export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit authentication code"),
});

export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit authentication code") });
export const forgotPasswordSchema = z.object({ email: z.string().email("Invalid email format") });
export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(10, "Password must be at least 10 characters").regex(/[A-Z]/, "Add an uppercase letter").regex(/[a-z]/, "Add a lowercase letter").regex(/[0-9]/, "Add a number"),
});
