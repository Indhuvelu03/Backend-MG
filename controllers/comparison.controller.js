// controllers/comparison.controller.js — Supabase-based
import { Complaint } from "../models/Complaint.js";
import { Invoice } from "../models/Invoice.js";
import { Comparison } from "../models/Comparison.js";
import { runComparison } from "../services/directProcessor.service.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { verifyTenantOwnership } from "../middleware/tenant.middleware.js";
import * as storageService from "../services/storage.service.js";

const withSecureReportUrl = async (comparison) => {
  if (!comparison?.reportUrl) return comparison;
  return { ...comparison, reportUrl: await storageService.createSignedUrl(comparison.reportUrl) };
};

export const analyzeComparison = async (req, res, next) => {
  try {
    const { complaintId } = req.params;

    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(complaint, req.user, "Complaint");

    const invoice = await Invoice.findOne({ complaintId });
    if (!invoice) throw new AppError("No invoice uploaded for this complaint", 400);

    const existing = await Comparison.findOne({ complaintId });
    if (existing) return sendSuccess(res, "Comparison already completed", await withSecureReportUrl(existing), 200);

    if (!complaint.transcript || !invoice.extractedText) {
      throw new AppError("AI inputs not ready — transcription or OCR still in progress", 400);
    }

    setImmediate(() => runComparison(complaint.id, invoice.id).catch(err =>
      console.warn(`⚠️ Background comparison error: ${err.message}`)
    ));

    sendSuccess(res, "AI comparison started", { complaintId, invoiceId: invoice.id }, 202);
  } catch (error) { next(error); }
};

export const getComparison = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.complaintId);
    if (!complaint) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(complaint, req.user, "Complaint");

    const comparison = await Comparison.findOne({ complaintId: req.params.complaintId });
    if (!comparison) throw new AppError("Comparison report not found", 404);
    sendSuccess(res, "Comparison retrieved successfully", await withSecureReportUrl(comparison), 200);
  } catch (error) { next(error); }
};

export const getAuditReport = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.complaintId);
    if (!complaint) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(complaint, req.user, "Complaint");

    const comparison = await Comparison.findOne({ complaintId: req.params.complaintId });
    if (!comparison?.reportUrl) throw new AppError("Audit report is not ready yet", 404);
    sendSuccess(res, "Audit report is ready", { reportUrl: await storageService.createSignedUrl(comparison.reportUrl) }, 200);
  } catch (error) { next(error); }
};
