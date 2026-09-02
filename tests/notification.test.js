import test from "node:test";
import assert from "node:assert/strict";
import { deliverAcrossChannels, runWithRetry } from "../services/notificationDelivery.service.js";
import { normalizeE164 } from "../services/twilio.service.js";

test("Indian local and international phone values normalize to E.164", () => {
  assert.equal(normalizeE164("09092373329"), "+919092373329");
  assert.equal(normalizeE164("919092373329"), "+919092373329");
  assert.equal(normalizeE164("+91 90923 73329"), "+919092373329");
});

test("WhatsApp, SMS and email are all attempted independently", async () => {
  const calls = [];
  const error = new Error("recipient has not joined the sandbox");
  error.code = 63015;
  const delivery = await deliverAcrossChannels({
    customer: { id: "customer-1", mobile: "+919092373329", email: "customer@example.com" },
    channels: ["whatsapp", "sms", "email"],
    isProviderReady: () => true,
    tasks: {
      whatsapp: async () => { calls.push("whatsapp"); throw error; },
      sms: async () => { calls.push("sms"); return { success: true, sid: "SM123", status: "queued" }; },
      email: async () => { calls.push("email"); return { success: true }; },
    },
  });
  assert.deepEqual(new Set(calls), new Set(["whatsapp", "sms", "email"]));
  assert.deepEqual(new Set(delivery.successfulChannels), new Set(["sms", "email"]));
  assert.equal(delivery.failures[0].channel, "whatsapp");
});

test("transient provider failures are retried up to the configured limit", async () => {
  let calls = 0;
  const result = await runWithRetry(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("temporary provider outage");
      error.status = 503;
      throw error;
    }
    return { success: true, sid: "SM456" };
  }, { attempts: 3, baseDelayMs: 1 });
  assert.equal(calls, 3);
  assert.equal(result.attempts, 3);
});

test("a mock result is a failed attempt and cannot hide real channel delivery", async () => {
  const calls = [];
  const delivery = await deliverAcrossChannels({
    customer: { mobile: "+919092373329", email: "customer@example.com" },
    channels: ["whatsapp", "email"],
    isProviderReady: () => true,
    tasks: {
      whatsapp: async () => { calls.push("whatsapp"); return { success: true, mock: true }; },
      email: async () => { calls.push("email"); return { success: true, messageId: "email-1" }; },
    },
  });
  assert.deepEqual(new Set(calls), new Set(["whatsapp", "email"]));
  assert.deepEqual(delivery.successfulChannels, ["email"]);
  assert.equal(delivery.failures[0].channel, "whatsapp");
});
