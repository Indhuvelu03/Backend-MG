import test from "node:test";
import assert from "node:assert/strict";

process.env.CLIENT_URL ||= "https://frontend.example.com";
process.env.PUBLIC_FEEDBACK_BASE_URL ||= "https://frontend.example.com/feedback";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ||= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.JWT_SECRET ||= "test-jwt-secret-with-sufficient-length";
process.env.GROQ_API_KEY ||= "test-groq";
process.env.RESEND_API_KEY ||= "dummy-test";
process.env.RESEND_FROM_EMAIL ||= "test@example.com";

const { maskEmail, maskMobile, protectCustomerContact } = await import("../utils/privacy.js");
const { verifyTenantOwnership } = await import("../middleware/tenant.middleware.js");
const security = await import("../services/security.service.js");
const storage = await import("../services/storage.service.js");

test("staff contact responses are masked while dealer responses remain complete", () => {
  assert.equal(maskEmail("customer@example.com"), "cu******@example.com");
  assert.equal(maskMobile("+91 9876543210"), "********3210");
  assert.equal(protectCustomerContact({ email: "a@b.com" }, { role: "DEALER" }).email, "a@b.com");
  assert.notEqual(protectCustomerContact({ email: "a@b.com" }, { role: "STAFF" }).email, "a@b.com");
});

test("tenant ownership denies unscoped and cross-dealership records", () => {
  const user = { role: "STAFF", dealershipId: "dealer-a" };
  assert.throws(() => verifyTenantOwnership({ id: "legacy" }, user, "Customer"), /not assigned/);
  assert.throws(() => verifyTenantOwnership({ dealershipId: "dealer-b" }, user, "Customer"), /another dealership/);
  assert.equal(verifyTenantOwnership({ dealershipId: "dealer-a" }, user, "Customer"), true);
});

test("MFA secrets are encrypted at rest and opaque tokens are hashed", () => {
  const secret = security.generateMfaSecret();
  const encrypted = security.encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(security.decryptSecret(encrypted), secret);
  const token = security.generateOpaqueToken();
  assert.equal(security.hashToken(token).length, 64);
});

test("private and legacy storage references resolve to the same bucket/path shape", () => {
  assert.deepEqual(storage.parseStorageUrl("storage://audio-complaints/audio/test.webm"), { bucket: "audio-complaints", path: "audio/test.webm" });
  assert.deepEqual(storage.parseStorageUrl("https://example.supabase.co/storage/v1/object/public/invoice-pdfs/invoices/test.pdf"), { bucket: "invoice-pdfs", path: "invoices/test.pdf" });
});
