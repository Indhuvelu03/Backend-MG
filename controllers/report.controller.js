import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import { Comparison } from "../models/Comparison.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { sendSuccess } from "../utils/responseHandler.js";

export const getDashboardMetrics = async (req, res, next) => {
  try {
    const rows = await Promise.all((await Complaint.findAll()).map(async (complaint) => ({ complaint, customer: await Customer.findById(complaint.customerId), comparison: await Comparison.findOne({ complaintId: complaint.id }) })));
    const filtered = rows.filter(row => !req.query.serviceCenter || (row.customer?.serviceCenter || row.customer?.service_center) === req.query.serviceCenter);
    const audits = filtered.filter(row => row.comparison);
    const averageScore = audits.length ? audits.reduce((sum, row) => sum + Number(row.comparison.score || 0), 0) / audits.length : 0;
    const groups = new Map();
    for (const row of audits) {
      const name = row.customer?.serviceCenter || row.customer?.service_center || "Unassigned";
      const group = groups.get(name) || { _id: name, auditVolume: 0, scoreTotal: 0, fullMatches: 0, ratingTotal: 0, ratingCount: 0 };
      group.auditVolume += 1; group.scoreTotal += Number(row.comparison.score || 0); if (row.comparison.status === "FULL_MATCH") group.fullMatches += 1; groups.set(name, group);
      if (Number.isFinite(Number(row.complaint.rating))) { group.ratingTotal += Number(row.complaint.rating); group.ratingCount += 1; }
    }
    const generatedCount = await FeedbackLink.countDocuments();
    const submittedCount = await FeedbackLink.countDocuments({ status: "SUBMITTED" });
    sendSuccess(res, "Dashboard metrics fetched successfully", {
      linkMetrics: { generatedCount, submittedCount, responseRate: generatedCount ? Number(((submittedCount / generatedCount) * 100).toFixed(2)) : 0 },
      auditSummary: { totalAudited: audits.length, averageScore: Number(averageScore.toFixed(2)), fullMatches: audits.filter(row => row.comparison.status === "FULL_MATCH").length, partialMatches: audits.filter(row => row.comparison.status === "PARTIAL_MATCH").length, mismatches: audits.filter(row => row.comparison.status === "MISMATCH").length },
      serviceCenterPerformance: [...groups.values()].map(group => ({ _id: group._id, avgScore: Number((group.scoreTotal / group.auditVolume).toFixed(2)), avgRating: group.ratingCount ? Number((group.ratingTotal / group.ratingCount).toFixed(1)) : null, auditVolume: group.auditVolume, fullMatches: group.fullMatches })),
    });
  } catch (error) { next(error); }
};
