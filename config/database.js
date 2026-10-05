import dns from "node:dns";
import { supabase } from "./supabase.js";
import { logger } from "../utils/logger.js";
import { env } from "./env.js";

// Ensure Node.js prefers IPv4 resolution to prevent IPv6 timeouts on cloud platforms like Render
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

export const connectDatabase = async () => {
  try {
    // Verify Supabase credentials are valid by checking auth
    const { error } = await supabase.from("customers").select("id").limit(1);

    if (error) {
      const code = error.code || "";
      // Table missing = migration not run yet, but connection works
      if (code === "42P01" || error.message?.includes("does not exist") || error.message?.includes("schema cache")) {
        logger.warn("⚠️ Supabase connected but tables not found — run scripts/supabase_migration.sql in Supabase SQL Editor");
        return;
      }
      const details = error.details ? ` (${error.details})` : "";
      const hint = error.hint ? ` Hint: ${error.hint}` : "";
      throw new Error(`Supabase connection error: ${error.message}${details}${hint}`);
    }

    logger.info("✅ Supabase (PostgreSQL) connected and tables verified");
  } catch (error) {
    const targetHost = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).host : "unknown";
    logger.error(`❌ Failed to connect to Supabase [${targetHost}]: ${error.message}`);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  // Supabase HTTP client — no persistent connection to close
  logger.info("Supabase client released");
};