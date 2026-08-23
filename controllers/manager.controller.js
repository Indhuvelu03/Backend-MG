import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import { Invoice } from "../models/Invoice.js";
import { Comparison } from "../models/Comparison.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";

const enrich = async (complaint) => {
  const [customer, invoice, comparison] = await Promise.all([
    Customer.findById(complaint.customerId), Invoice.findOne({ complaintId: complaint.id }), Comparison.findOne({ complaintId: complaint.id }),
  ]);
  const ageMinutes = Math.floor((Date.now() - new Date(complaint.createdAt || complaint.created_at).getTime()) / 60000);
  const requiresReview = Boolean(comparison && (Number(comparison.score) < 60 || comparison.status === "MISMATCH" || comparison.reviewStatus === "NEEDS_DOCUMENTS"));
  return { complaint, customer, invoice, comparison, ageMinutes, requiresReview, slaDelayed: !comparison && ageMinutes >= 30 };
};

export const listManagerCases = async (req, res, next) => {
  try {
    const cases = await Promise.all((await Complaint.findAll()).map(enrich));
    sendSuccess(res, "Manager cases retrieved", cases.filter(item => item.requiresReview || item.slaDelayed));
  } catch (error) { next(error); }
};

export const reviewCase = async (req, res, next) => {
  try {
    const { reviewStatus, reviewNotes } = req.body;
    if (!['CONFIRMED_ISSUE', 'FALSE_POSITIVE', 'NEEDS_DOCUMENTS', 'RESOLVED'].includes(reviewStatus)) throw new AppError("Invalid review status", 400);
    const comparison = await Comparison.updateReviewByComplaintId(req.params.complaintId, { reviewStatus, reviewNotes, reviewedBy: req.user.id });
    sendSuccess(res, "Manager review saved", comparison);
  } catch (error) { next(error); }
};
