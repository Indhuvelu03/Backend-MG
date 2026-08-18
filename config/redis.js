// config/redis.js — Upstash Redis + BullMQ compatible connection options
import { env } from "./env.js";

// BullMQ requires maxRetriesPerRequest: null
// Upstash rediss:// needs TLS + keepAlive to prevent ECONNRESET
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    const isTLS = parsed.protocol === "rediss:";
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || (isTLS ? 6380 : 6379),
      username: parsed.username || "default",
      password: decodeURIComponent(parsed.password || ""),

      // BullMQ required
      maxRetriesPerRequest: null,
      enableReadyCheck: false,

      // Prevent Upstash idle disconnects
      keepAlive: 10000,        // Send TCP keepalive every 10s
      connectTimeout: 20000,   // 20s connection timeout
      commandTimeout: 15000,   // 15s per command

      // TLS for rediss:// (Upstash always uses TLS)
      ...(isTLS && {
        tls: {
          rejectUnauthorized: false,   // Allow Upstash self-signed certs
          servername: parsed.hostname,
        },
      }),

      // Reconnect on ECONNRESET (which Upstash triggers after idle)
      reconnectOnError: (err) => {
        const shouldReconnect = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "read ECONNRESET"].some(
          (e) => err.message.includes(e) || err.code === e
        );
        return shouldReconnect ? 1 : false;
      },

      // Exponential backoff — up to 5s, max 10 retries
      retryStrategy: (times) => {
        if (times > 10) {
          return null; // Give up after 10 retries
        }
        return Math.min(times * 300, 5000);
      },
    };
  } catch (e) {
    // Fallback: pass the raw URL (ioredis can handle this format too)
    return {
      url: env.REDIS_URL,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

export const redisConnectionOptions = parseRedisUrl(env.REDIS_URL);