import test from "node:test";
import assert from "node:assert/strict";
import { __reportInternals } from "../controllers/report.controller.js";

test("invoice analytics sum charge lines without double-counting subtotal, GST and total", () => {
  const value = __reportInternals.invoiceValue({ extracted_items: [
    { description: "Front brake pad set", amount: 3200 },
    { description: "Replacement labour", amount: 800 },
    { description: "GST", amount: 720 },
    { description: "Grand Total", amount: 4720 },
  ] });
  assert.equal(value, 4000);
});

test("report percentages use the correct denominator and protect zero totals", () => {
  assert.equal(__reportInternals.pct(3, 4), 75);
  assert.equal(__reportInternals.pct(1, 0), 0);
});

test("report date filters reject reversed periods", () => {
  assert.throws(() => __reportInternals.parseRange({ from: "2026-08-31", to: "2026-08-01" }), /start date/i);
});
