// Dedicated background-process entry point. Keep this separate from the HTTP
// service so deployments can run a continuously available worker instance.
import { connectDatabase } from "./config/database.js";
import { logger } from "./utils/logger.js";
import { startWorkerHeartbeat } from "./jobs/workerHeartbeat.js";

let stopHeartbeat;

const startWorker = async () => {
  try {
    await connectDatabase();
    await Promise.all([
      import("./jobs/transcription.worker.js"),
      import("./jobs/invoiceExtraction.worker.js"),
      import("./jobs/comparison.worker.js"),
      import("./jobs/notification.worker.js"),
      import("./jobs/linkExpiry.worker.js"),
    ]);
    stopHeartbeat = startWorkerHeartbeat();
    logger.info("Background workers are online and waiting for jobs");
  } catch (error) {
    logger.error(`Worker startup failed: ${error.stack || error.message}`);
    process.exit(1);
  }
};

process.on("unhandledRejection", (error) => {
  logger.error(`Unhandled worker rejection: ${error?.stack || error}`);
});

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught worker exception: ${error.stack || error.message}`);
  process.exit(1);
});

const stop = async (signal) => {
  logger.info(`Worker received ${signal}; stopping cleanly`);
  await stopHeartbeat?.();
  process.exit(0);
};

process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));

startWorker();
