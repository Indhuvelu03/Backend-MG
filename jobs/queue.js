// jobs/queue.js — Redis/BullMQ DISABLED (Upstash free-tier quota exceeded)
// All processing now runs synchronously via directProcessor.service.js
// To re-enable: restore BullMQ imports and uncomment original code below
import { logger } from "../utils/logger.js";

import { processNotificationDirectly } from "../services/directNotification.service.js";

// ── No-op queue stub ──────────────────────────────────────────────────────────
// Provides the same .add() interface so all callers continue to work without
// any code changes. Jobs are processed immediately in-process instead of via Redis.
const makeNoopQueue = (name) => ({
  name,
  add: async (jobName, data, _opts) => {
    logger.debug(`[Queue:${name}] Job "${jobName}" bypassed (Redis disabled) — running directly`);
    if (name === "notifications") {
      // Do not detach delivery from the request. A development restart (or a
      // short-lived web process) could otherwise terminate the callback before
      // any provider receives the invite.
      await processNotificationDirectly(jobName, data);
    }
    return { id: `direct-${Date.now()}` };
  },
  getJob: async () => null,
  close: async () => {},
});

export const transcriptionQueue    = makeNoopQueue("transcription");
export const invoiceExtractionQueue = makeNoopQueue("invoice-extraction");
export const aiComparisonQueue     = makeNoopQueue("ai-comparison");
export const notificationsQueue    = makeNoopQueue("notifications");

/* ─────────────────────────────────────────────────────────────────────────────
   ORIGINAL BullMQ CODE (uncomment when Redis quota is available)
─────────────────────────────────────────────────────────────────────────────
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false,
};

export const transcriptionQueue     = new Queue("transcription",       { connection: redisConnectionOptions, defaultJobOptions });
export const invoiceExtractionQueue  = new Queue("invoice-extraction",  { connection: redisConnectionOptions, defaultJobOptions });
export const aiComparisonQueue      = new Queue("ai-comparison",       { connection: redisConnectionOptions, defaultJobOptions });
export const notificationsQueue     = new Queue("notifications",       { connection: redisConnectionOptions, defaultJobOptions });
─────────────────────────────────────────────────────────────────────────────*/
