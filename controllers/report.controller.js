import { supabase } from "../config/supabase.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { getEffectiveTenantId } from "../middleware/tenant.middleware.js";

const SLA_MINUTES = 30;
const RESOLVED = new Set(["RESOLVED", "CLOSED", "COMPLETED"]);
const FAILED = new Set(["FAILED", "UNDELIVERED", "BOUNCED", "REJECTED"]);
const DELIVERED = new Set(["DELIVERED", "READ"]);
const SUMMARY_LINE = /\b(sub\s*total|grand\s*total|total\s*amount|gst|tax|cgst|sgst|igst|discount|round\s*off)\b/i;
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, places = 2) => Number(num(value).toFixed(places));
const upper = value => String(value || "").trim().toUpperCase();
const time = value => value ? new Date(value).getTime() : NaN;
const pct = (part, total) => total ? round((part / total) * 100) : 0;
const id = row => row?.id || row?._id;
const tenant = row => row?.dealership_id || row?.dealershipId || null;
const inRange = (value, from, to) => Number.isFinite(time(value)) && (!from || time(value) >= from.getTime()) && (!to || time(value) <= to.getTime());

const parseRange = query => {
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new AppError("Report dates must use YYYY-MM-DD format", 400);
  if (from && to && from > to) throw new AppError("Report start date cannot be after end date", 400);
  return { from, to };
};

const rows = async (table, dealershipId, tenantColumn = "dealership_id", optional = false) => {
  let query = supabase.from(table).select("*");
  if (dealershipId && tenantColumn) query = query.eq(tenantColumn, dealershipId);
  const { data, error } = await query;
  if (error) {
    if (optional) return [];
    throw new Error(`Unable to build analytics from ${table}: ${error.message}`);
  }
  return data || [];
};

const invoiceValue = invoice => (invoice?.extracted_items || [])
  .filter(item => !SUMMARY_LINE.test(String(item.description || item.name || item.item || "")))
  .reduce((sum, item) => sum + num(item.amount ?? item.total ?? item.price), 0);
const dateKey = value => new Date(value).toISOString().slice(0, 10);
const trend = ({ from, to, customers, complaints, comparisons, invoices }) => {
  const end = to || new Date();
  const requested = from || new Date(end.getTime() - 29 * 86400000);
  const start = end.getTime() - requested.getTime() > 89 * 86400000 ? new Date(end.getTime() - 89 * 86400000) : requested;
  const map = new Map();
  for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    map.set(dateKey(cursor), { date: dateKey(cursor), customers: 0, complaints: 0, audits: 0, invoices: 0 });
  }
  const add = (list, field) => list.forEach(row => { const point = map.get(dateKey(row.created_at)); if (point) point[field] += 1; });
  add(customers, "customers"); add(complaints, "complaints"); add(comparisons, "audits"); add(invoices, "invoices");
  return [...map.values()];
};

export const buildDashboardAnalytics = async req => {
  const dealershipId = getEffectiveTenantId(req, req.query.dealershipId);
  const { from, to } = parseRange(req.query);
  const [dealerships, users, customers, complaints, invoices, comparisons, links, communications, centers, sessions] = await Promise.all([
    rows("dealerships", dealershipId, "id"), rows("users", dealershipId), rows("customers", dealershipId), rows("complaints", dealershipId),
    rows("invoices", dealershipId), rows("comparisons", dealershipId), rows("feedback_links", dealershipId), rows("email_activities", dealershipId),
    rows("service_centers", dealershipId), rows("auth_sessions", null, null, true),
  ]);
  const periodCustomers = customers.filter(row => inRange(row.created_at || row.service_date, from, to));
  const periodComplaints = complaints.filter(row => inRange(row.created_at, from, to));
  const periodInvoices = invoices.filter(row => inRange(row.created_at, from, to));
  const periodComparisons = comparisons.filter(row => inRange(row.created_at, from, to));
  const periodLinks = links.filter(row => inRange(row.created_at, from, to));
  const periodComms = communications.filter(row => inRange(row.sent_at || row.created_at, from, to));
  const userIds = new Set(users.map(id));
  const activeUsers = new Set(sessions.filter(row => userIds.has(row.user_id) && !row.revoked_at && time(row.expires_at) > Date.now()).map(row => row.user_id));
  const isResolved = row => RESOLVED.has(upper(row.service_status || row.status));
  const openCases = complaints.filter(row => !isResolved(row));
  const resolved = complaints.filter(row => isResolved(row) && inRange(row.resolved_at || row.updated_at || row.created_at, from, to));
  const resolutionHours = resolved.map(row => (time(row.resolved_at || row.updated_at) - time(row.created_at)) / 3600000).filter(value => Number.isFinite(value) && value >= 0);
  const slaBreaches = openCases.filter(row => (Date.now() - time(row.created_at)) / 60000 >= SLA_MINUTES);
  const highRisk = periodComparisons.filter(row => upper(row.status) === "MISMATCH" || num(row.score) < 60);
  const flaggedIds = new Set(highRisk.map(row => row.complaint_id));
  const ratedInPeriod = complaints.filter(row => row.rating != null && inRange(row.rated_at || row.updated_at || row.created_at, from, to));
  const ratings = ratedInPeriod.map(row => num(row.rating)).filter(value => value >= 1 && value <= 5);
  const scores = periodComparisons.map(row => num(row.score)).filter(value => value >= 0 && value <= 100);
  const delivered = periodComms.filter(row => DELIVERED.has(upper(row.provider_status || row.status))).length;
  const failed = periodComms.filter(row => FAILED.has(upper(row.provider_status || row.status))).length;
  const submitted = periodLinks.filter(row => upper(row.status) === "SUBMITTED").length;
  const managerPending = comparisons.filter(row => upper(row.review_status || "UNREVIEWED") === "UNREVIEWED" && (upper(row.status) === "MISMATCH" || num(row.score) < 60)).length;
  const serviceCenterPerformance = centers.map(center => {
    const centerCustomers = periodCustomers.filter(row => row.service_center === center.name);
    const customerIds = new Set(centerCustomers.map(id));
    const centerComplaints = periodComplaints.filter(row => customerIds.has(row.customer_id));
    const complaintIds = new Set(centerComplaints.map(id));
    const audits = periodComparisons.filter(row => complaintIds.has(row.complaint_id));
    const centerRatings = ratedInPeriod.filter(row => customerIds.has(row.customer_id)).map(row => num(row.rating)).filter(value => value >= 1 && value <= 5);
    const flags = audits.filter(row => upper(row.status) === "MISMATCH" || num(row.score) < 60).length;
    return { id: id(center), dealershipId: tenant(center), name: center.name, location: center.location || center.branch || "—", customers: centerCustomers.length, complaints: centerComplaints.length, audits: audits.length, averageScore: audits.length ? round(audits.reduce((sum, row) => sum + num(row.score), 0) / audits.length) : null, averageRating: centerRatings.length ? round(centerRatings.reduce((sum, value) => sum + value, 0) / centerRatings.length, 1) : null, flags, completionRate: pct(audits.length, centerComplaints.length) };
  });

  const dealerRanking = dealerships.map(dealer => {
    const dealerId = id(dealer);
    const dUsers = users.filter(row => tenant(row) === dealerId);
    const dCustomers = periodCustomers.filter(row => tenant(row) === dealerId);
    const dComplaints = periodComplaints.filter(row => tenant(row) === dealerId);
    const dAudits = periodComparisons.filter(row => tenant(row) === dealerId);
    const dInvoices = periodInvoices.filter(row => tenant(row) === dealerId);
    const dRatings = ratedInPeriod.filter(row => tenant(row) === dealerId).map(row => num(row.rating)).filter(value => value >= 1 && value <= 5);
    return { dealershipId: dealerId, name: dealer.name, code: dealer.code, city: dealer.city, isActive: dealer.is_active !== false, advisors: dUsers.filter(row => upper(row.role) === "STAFF" && row.is_active !== false).length, customers: dCustomers.length, complaints: dComplaints.length, audits: dAudits.length, openCases: dComplaints.filter(row => !isResolved(row)).length, averageScore: dAudits.length ? round(dAudits.reduce((sum, row) => sum + num(row.score), 0) / dAudits.length) : null, averageRating: dRatings.length ? round(dRatings.reduce((sum, value) => sum + value, 0) / dRatings.length, 1) : null, flags: dAudits.filter(row => upper(row.status) === "MISMATCH" || num(row.score) < 60).length, invoiceValue: round(dInvoices.reduce((sum, row) => sum + invoiceValue(row), 0)), completionRate: pct(dAudits.length, dComplaints.length) };
  }).sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));

  const channelBreakdown = ["whatsapp", "sms", "email"].map(channel => {
    const list = periodComms.filter(row => String(row.channel || "").toLowerCase() === channel);
    const ok = list.filter(row => DELIVERED.has(upper(row.provider_status || row.status))).length;
    const bad = list.filter(row => FAILED.has(upper(row.provider_status || row.status))).length;
    return { channel, attempts: list.length, delivered: ok, failed: bad, deliveryRate: pct(ok, list.length) };
  });
  const auditedComplaintIds = new Set(periodComparisons.map(row => row.complaint_id));
  const totalInvoiceValue = periodInvoices.reduce((sum, row) => sum + invoiceValue(row), 0);
  return {
    generatedAt: new Date().toISOString(), filters: { from: from?.toISOString().slice(0, 10) || null, to: to?.toISOString().slice(0, 10) || null, dealershipId: dealershipId || null, slaMinutes: SLA_MINUTES },
    overview: { activeDealers: dealerships.filter(row => row.is_active !== false).length, enabledAdvisors: users.filter(row => upper(row.role) === "STAFF" && row.is_active !== false).length, enabledDealerAccounts: users.filter(row => upper(row.role) === "DEALER" && row.is_active !== false).length, activeSignedInUsers: activeUsers.size, totalCustomers: customers.length, newCustomers: periodCustomers.length, complaints: periodComplaints.length, resolvedCases: resolved.length, openCases: openCases.length, slaBreaches: slaBreaches.length, completedAudits: periodComparisons.length, auditCompletionRate: pct(auditedComplaintIds.size, periodComplaints.length), averageMatchScore: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null, fraudFlags: highRisk.length, managerReviewPending: managerPending, averageResolutionHours: resolutionHours.length ? round(resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length, 1) : null, averageRating: ratings.length ? round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length, 1) : null, ratingCount: ratings.length },
    invoices: { uploaded: periodInvoices.length, parsed: periodInvoices.filter(row => (row.extracted_items || []).length > 0).length, totalValue: round(totalInvoiceValue), flaggedInvoiceValue: round(periodInvoices.filter(row => flaggedIds.has(row.complaint_id)).reduce((sum, row) => sum + invoiceValue(row), 0)) },
    feedback: { generated: periodLinks.length, submitted, responseRate: pct(submitted, periodLinks.length) },
    communications: { attempts: periodComms.length, delivered, failed, pending: Math.max(0, periodComms.length - delivered - failed), deliveryRate: pct(delivered, periodComms.length), channels: channelBreakdown },
    auditSummary: { totalAudited: periodComparisons.length, averageScore: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0, fullMatches: periodComparisons.filter(row => upper(row.status) === "FULL_MATCH").length, partialMatches: periodComparisons.filter(row => upper(row.status) === "PARTIAL_MATCH").length, mismatches: periodComparisons.filter(row => upper(row.status) === "MISMATCH").length },
    serviceCenterPerformance, dealerRanking,
    trends: trend({ from, to, customers: periodCustomers, complaints: periodComplaints, comparisons: periodComparisons, invoices: periodInvoices }),
  };
};

export const getDashboardMetrics = async (req, res, next) => { try { sendSuccess(res, "Management analytics fetched successfully", await buildDashboardAnalytics(req)); } catch (error) { next(error); } };
const csvCell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
export const exportDashboardCsv = async (req, res, next) => {
  try {
    const report = await buildDashboardAnalytics(req);
    const content = [["Metric", "Value"], ...Object.entries(report.overview), ["Invoice value", report.invoices.totalValue], ["Flagged invoice value", report.invoices.flaggedInvoiceValue], ["Feedback response rate", `${report.feedback.responseRate}%`], ["Communication delivery rate", `${report.communications.deliveryRate}%`], [], ["Dealer", "City", "Customers", "Complaints", "Audits", "Completion %", "Avg score", "Flags", "Invoice value"], ...report.dealerRanking.map(row => [row.name, row.city, row.customers, row.complaints, row.audits, row.completionRate, row.averageScore ?? "", row.flags, row.invoiceValue])].map(row => row.map(csvCell).join(",")).join("\n");
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="executive-report-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" }); return res.status(200).send(content);
  } catch (error) { next(error); }
};
const pdfEscape = value => String(value ?? "").replace(/\\/g, "\\\\").replace(/[()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
const makePdf = lines => { const stream = ["BT", "/F1 10 Tf", "44 790 Td", "14 TL", ...lines.flatMap(line => [`(${pdfEscape(line)}) Tj`, "T*"]), "ET"].join("\n"); const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]; let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; }); pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(pdf); };
export const exportDashboardPdf = async (req, res, next) => {
  try { const report = await buildDashboardAnalytics(req); const o = report.overview; const lines = ["AUTOAUDIT AI - EXECUTIVE MANAGEMENT REPORT", `Generated: ${report.generatedAt}`, `Period: ${report.filters.from || "All time"} to ${report.filters.to || "Now"}`, "", `Active dealers: ${o.activeDealers} | Enabled advisors: ${o.enabledAdvisors} | Signed-in users: ${o.activeSignedInUsers}`, `Customers: ${o.totalCustomers} total / ${o.newCustomers} in period`, `Complaints: ${o.complaints} | Open: ${o.openCases} | Resolved: ${o.resolvedCases} | SLA breaches: ${o.slaBreaches}`, `Audits: ${o.completedAudits} | Completion: ${o.auditCompletionRate}% | Avg match: ${o.averageMatchScore ?? "-"}%`, `Fraud flags: ${o.fraudFlags} | Manager review: ${o.managerReviewPending}`, `Invoices: ${report.invoices.uploaded} | Parsed: ${report.invoices.parsed} | Value: INR ${report.invoices.totalValue}`, `Flagged invoice value: INR ${report.invoices.flaggedInvoiceValue}`, `Feedback response: ${report.feedback.submitted}/${report.feedback.generated} (${report.feedback.responseRate}%)`, `Communication delivery: ${report.communications.delivered}/${report.communications.attempts} (${report.communications.deliveryRate}%)`, `Customer rating: ${o.averageRating ?? "No ratings"}${o.averageRating ? `/5 (${o.ratingCount})` : ""}`, "", "DEALER RANKING", ...report.dealerRanking.slice(0, 12).map((row, index) => `${index + 1}. ${row.name} | audits ${row.audits} | complete ${row.completionRate}% | score ${row.averageScore ?? "-"}% | flags ${row.flags}`)]; const pdf = makePdf(lines.slice(0, 48)); res.set({ "Content-Type": "application/pdf", "Content-Length": pdf.length, "Content-Disposition": `attachment; filename="executive-report-${new Date().toISOString().slice(0, 10)}.pdf"`, "Cache-Control": "private, no-store" }); return res.status(200).send(pdf); } catch (error) { next(error); }
};

export const __reportInternals = { invoiceValue, pct, parseRange };
