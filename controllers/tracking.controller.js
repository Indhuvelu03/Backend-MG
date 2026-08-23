import { FeedbackLink } from "../models/FeedbackLink.js";
import { Complaint } from "../models/Complaint.js";
import { Invoice } from "../models/Invoice.js";
import { Comparison } from "../models/Comparison.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";

export const getPublicTracking = async (req, res, next) => {
  try {
    const link = await FeedbackLink.findByToken(req.params.token);
    if (!link) throw new AppError("Tracking link is invalid", 404);
    const customer = link.customerId || link.customer;
    const complaint = await Complaint.findByFeedbackLinkId(link.id);
    const invoice = complaint ? await Invoice.findOne({ complaintId: complaint.id }) : null;
    const comparison = complaint ? await Comparison.findOne({ complaintId: complaint.id }) : null;
    sendSuccess(res, "Tracking status retrieved", {
      vehicleNumber: customer?.vehicleNumber || customer?.vehicle_number,
      customerName: customer?.name,
      serviceCenter: customer?.serviceCenter || customer?.service_center,
      feedbackStatus: link.status,
      complaint: complaint && { status: complaint.status, createdAt: complaint.createdAt || complaint.created_at, hasAudio: Boolean(complaint.audioUrl), hasText: Boolean(complaint.transcript), rating: complaint.rating },
      invoice: invoice && { status: invoice.status, createdAt: invoice.createdAt || invoice.created_at },
      comparison: comparison && { status: comparison.status, score: comparison.score, summary: comparison.summary, reportUrl: comparison.reportUrl },
    });
  } catch (error) { next(error); }
};

export const submitServiceRating = async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError("Rating must be between 1 and 5", 400);
    const link = await FeedbackLink.findByToken(req.params.token);
    if (!link || link.status !== "SUBMITTED") throw new AppError("A completed feedback link is required", 400);
    const complaint = await Complaint.findByFeedbackLinkId(link.id);
    if (!complaint) throw new AppError("Complaint not found", 404);
    const comparison = await Comparison.findOne({ complaintId: complaint.id });
    if (!comparison) throw new AppError("Rating is available after the service audit is complete", 400);
    await Complaint.updateById(complaint.id, { rating });
    sendSuccess(res, "Thank you for rating your service experience", { rating }, 200);
  } catch (error) { next(error); }
};
