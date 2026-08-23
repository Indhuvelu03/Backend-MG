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
