// server.js — AutoAudit AI (Supabase + Groq + Resend + BullMQ)
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { startPrivacyRetentionScheduler } from "./services/privacyRetention.service.js";

// Redis/BullMQ workers DISABLED — Upstash free quota exhausted.
// Processing runs synchronously via directProcessor.service.js
// To re-enable: uncomment this block and restore queue.js BullMQ exports.
const startEmbeddedWorkers = async () => {
  logger.info("ℹ️  Queue workers skipped (Redis disabled — direct processing mode active)");
  /* UNCOMMENT to re-enable BullMQ workers:
  try {
    await Promise.all([
      import("./jobs/transcription.worker.js"),
      import("./jobs/invoiceExtraction.worker.js"),
      import("./jobs/comparison.worker.js"),
      import("./jobs/notification.worker.js"),
      import("./jobs/linkExpiry.worker.js"),
      import("./jobs/slaMonitor.worker.js"),
    ]);
    logger.info("✅ Embedded queue workers are online (single-service mode)");
  } catch (error) {
    logger.error(`❌ Embedded worker startup failed: ${error.stack || error.message}`);
  }
  */
};

const startServer = async () => {
  try {
    // Verify Supabase connection
    await connectDatabase();

    app.listen(env.PORT, () => {
      logger.info(`🚀 AutoAudit AI running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`📖 API docs: http://localhost:${env.PORT}/api-docs`);
      logger.info(`🔗 Stack: Supabase (PostgreSQL + Storage) | Groq Whisper + LLM | Resend Email | Upstash Redis`);
    });

    // Free Render plans may only expose a Web Service. Run the job processors in
    // this service so transcription, OCR and comparison do not remain queued.
    await startEmbeddedWorkers();
    startPrivacyRetentionScheduler();
  } catch (error) {
    logger.error(`❌ Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();
