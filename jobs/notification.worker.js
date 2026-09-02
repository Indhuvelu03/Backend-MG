import { Worker } from "bullmq";
import { redisConnectionOptions, handleWorkerError } from "../config/redis.js";
import { processNotificationDirectly } from "../services/directNotification.service.js";
import { logger } from "../utils/logger.js";

export const notificationWorker = new Worker("notifications", async (job) => {
  logger.info(`Notification job started: ${job.name} (${job.id})`);
  return processNotificationDirectly(job.name, job.data, { throwOnFailure: true });
}, {
  connection: redisConnectionOptions,
  stalledInterval: 15_000,
  drainDelay: 5,
  concurrency: 3,
});

notificationWorker.on("completed", (job) => logger.info(`Notification job completed: ${job.name} (${job.id})`));
notificationWorker.on("failed", (job, error) => logger.error(`Notification job failed: ${job?.name} (${job?.id}): ${error.message}`));
notificationWorker.on("error", (error) => handleWorkerError("Notification", error));
