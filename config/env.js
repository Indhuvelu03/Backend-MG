import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CLIENT_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  PUBLIC_FEEDBACK_BASE_URL: z.string().url(),
  PUBLIC_API_BASE_URL: z.string().url().optional(),

  // Supabase
  SUPABASE_URL: z
    .string()
    .url()
    .refine(
      (url) => !url.includes("your-project.supabase.co"),
      "SUPABASE_URL contains placeholder 'your-project.supabase.co'. Please set your actual Supabase URL in your environment variables."
    ),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .refine(
      (k) => k !== "your_supabase_anon_key",
      "SUPABASE_ANON_KEY is set to placeholder 'your_supabase_anon_key'. Set your actual key in environment variables."
    ),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1)
    .refine(
      (k) => k !== "your_supabase_service_role_key",
      "SUPABASE_SERVICE_ROLE_KEY is set to placeholder 'your_supabase_service_role_key'. Set your actual key in environment variables."
    ),

  // Auth
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("24h"),
  PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(60).default(20),
  MFA_ISSUER: z.string().default("AutoAudit AI"),
  AUDIO_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),
  INVOICE_RETENTION_DAYS: z.coerce.number().int().min(365).default(2555),

  // Groq (Whisper + Llama)
  GROQ_API_KEY: z.string().min(1),

  // Resend (Email)
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  // Every available listed channel is attempted independently. Missing
  // Twilio configuration is skipped safely while email is still attempted.
  NOTIFICATION_CHANNELS: z.string().default("whatsapp,sms,email"),
  NOTIFICATION_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  NOTIFICATION_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(10000).default(1000),
  DEFAULT_PHONE_COUNTRY_CODE: z.string().regex(/^\+\d{1,3}$/).default("+91"),

  // Twilio is optional. When absent, the dispatcher proceeds directly to email.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_NUMBER: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Redis / BullMQ (Upstash)
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Environment validation failed:");
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
