// server.js — AutoAudit AI (Supabase + Groq + Resend + BullMQ)
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

// Start all BullMQ workers
import "./jobs/transcription.worker.js";
import "./jobs/invoiceExtraction.worker.js";
import "./jobs/comparison.worker.js";
import "./jobs/notification.worker.js";

const startServer = async () => {
  try {
    // Verify Supabase connection
    await connectDatabase();

    app.listen(env.PORT, () => {
      logger.info(`🚀 AutoAudit AI running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`📖 API docs: http://localhost:${env.PORT}/api-docs`);
      logger.info(`🔗 Stack: Supabase (PostgreSQL + Storage) | Groq Whisper + LLM | Resend Email | Upstash Redis`);
    });
  } catch (error) {
    logger.error(`❌ Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();