// jobs/queue.js
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000, // Retry after 5s, 10s, 20s
  },
  removeOnComplete: true,
  removeOnFail: false,
};

export const transcriptionQueue = new Queue("transcription", {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

export const invoiceExtractionQueue = new Queue("invoice-extraction", {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

export const aiComparisonQueue = new Queue("ai-comparison", {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

export const notificationsQueue = new Queue("notifications", {
  connection: redisConnectionOptions,
  defaultJobOptions,
});