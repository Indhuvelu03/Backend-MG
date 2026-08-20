import Redis from "ioredis";
import { redisConnectionOptions } from "../config/redis.js";

export const WORKER_HEARTBEAT_KEY = "autoaudit:worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = 60;

export const startWorkerHeartbeat = () => {
  const redis = new Redis(redisConnectionOptions);

  const publish = async () => {
    await redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", HEARTBEAT_TTL_SECONDS);
  };

  // Publish immediately, then refresh before the TTL can expire.
  publish().catch(() => {});
  const timer = setInterval(() => publish().catch(() => {}), 20_000);

  return async () => {
    clearInterval(timer);
    await redis.del(WORKER_HEARTBEAT_KEY).catch(() => {});
    await redis.quit().catch(() => {});
  };
};

export const getWorkerHeartbeat = async () => {
  const redis = new Redis(redisConnectionOptions);
  try {
    return await redis.get(WORKER_HEARTBEAT_KEY);
  } finally {
    await redis.quit().catch(() => {});
  }
};
