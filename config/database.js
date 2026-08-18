// config/database.js
import { supabase } from "./supabase.js";
import { logger } from "../utils/logger.js";

export const connectDatabase = async () => {
  try {
    // Verify Supabase credentials are valid by checking auth
    const { error } = await supabase.from("customers").select("id").limit(1);

    if (error) {
      const code = error.code || "";
      // Table missing = migration not run yet, but connection works
      if (code === "42P01" || error.message.includes("does not exist") || error.message.includes("schema cache")) {
        logger.warn("⚠️ Supabase connected but tables not found — run scripts/supabase_migration.sql in Supabase SQL Editor");
        return;
      }
      throw new Error(`Supabase connection error: ${error.message}`);
    }

    logger.info("✅ Supabase (PostgreSQL) connected and tables verified");
  } catch (error) {
    logger.error(`❌ Failed to connect to Supabase: ${error.message}`);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  // Supabase HTTP client — no persistent connection to close
  logger.info("Supabase client released");
};