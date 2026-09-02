import { env } from "../config/env.js";
import { isChannelLive } from "./twilio.service.js";
import { logger } from "../utils/logger.js";

const ALLOWED_CHANNELS = new Set(["whatsapp", "sms", "email"]);

export const configuredChannels = () => {
  const channels = env.NOTIFICATION_CHANNELS
    .split(",")
    .map((channel) => channel.trim().toLowerCase())
    .filter((channel) => ALLOWED_CHANNELS.has(channel));
  return channels.length ? [...new Set(channels)] : ["email"];
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRetryable = (error) => {
  if (error?.retryable === false) return false;
  const status = Number(error?.status || error?.statusCode || 0);
  const code = Number(error?.code || 0);
  if (status === 429 || status >= 500) return true;
  if ([20429, 30001, 30002, 30003, 30005, 30006, 30008].includes(code)) return true;
  if ([20003, 21211, 21212, 21606, 21608, 63015, 63016].includes(code)) return false;
  return !status && !code;
};

export const runWithRetry = async (
  task,
  {
    attempts = env.NOTIFICATION_RETRY_ATTEMPTS,
    baseDelayMs = env.NOTIFICATION_RETRY_DELAY_MS,
    onRetry,
  } = {},
) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await task();
      if (result?.success === false || result?.mock === true) {
        const error = new Error(result?.message || "Provider did not accept the notification");
        error.code = result?.code;
        error.retryable = false;
        throw error;
      }
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryable(error)) break;
      const delay = Math.min(baseDelayMs * (2 ** (attempt - 1)), 10_000);
      onRetry?.({ error, attempt, delay });
      await sleep(delay);
    }
  }
  throw lastError;
};

// Broadcast mode: every configured and available channel is attempted
// independently. A failure in one provider never prevents the other channels.
export const deliverAcrossChannels = async ({
  customer,
  tasks,
  channels = configuredChannels(),
  onAttempt,
  shouldDeliver = async () => true,
  isProviderReady = (channel) => channel === "email" || isChannelLive(channel),
}) => {
  const eligibleChannels = [];
  for (const channel of channels) {
    const hasRecipient = channel === "email" ? Boolean(customer?.email) : Boolean(customer?.mobile);
    if (tasks[channel] && hasRecipient && isProviderReady(channel) && await shouldDeliver(channel)) {
      eligibleChannels.push(channel);
    }
  }

  if (!eligibleChannels.length) {
    // A repeated processor run can legitimately have nothing left to send
    // because every configured channel already accepted this stage.
    return { deliveries: [], failures: [], successfulChannels: [], skipped: true };
  }

  const settled = await Promise.all(eligibleChannels.map(async (channel) => {
    try {
      const { result, attempts } = await runWithRetry(tasks[channel], {
        onRetry: ({ error, attempt, delay }) => logger.warn(
          `Notification ${channel} attempt ${attempt} failed (${error.message}); retrying in ${delay}ms`,
        ),
      });
      await onAttempt?.({ channel, success: true, result, attempts });
      logger.info(`Notification accepted via ${channel} for customer ${customer?.id || customer?._id || "unknown"}`);
      return { channel, success: true, result, attempts };
    } catch (error) {
      await onAttempt?.({ channel, success: false, error });
      logger.warn(`Notification ${channel} failed independently: ${error.message}`);
      return { channel, success: false, error };
    }
  }));

  const deliveries = settled.filter((item) => item.success);
  const failures = settled.filter((item) => !item.success);
  if (!deliveries.length) {
    throw new Error(`All notification channels failed: ${failures.map(({ channel, error }) => `${channel}: ${error.message}`).join("; ")}`);
  }
  return {
    deliveries,
    failures,
    successfulChannels: deliveries.map(({ channel }) => channel),
  };
};
