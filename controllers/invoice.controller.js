// controllers/invoice.controller.js — Supabase-based
import { Complaint } from "../models/Complaint.js";
import { Invoice } from "../models/Invoice.js";
import * as storageService from "../services/storage.service.js";
import { invoiceExtractionQueue } from "../jobs/queue.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";

export const uploadInvoice = async (req, res, next) => {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const { complaintId } = req.body;
    const file = req.file;

    if (!complaintId) throw new AppError("Complaint ID is required", 400);
    if (!file)        throw new AppError("Invoice PDF file is required", 400);

    // 1. Verify complaint exists
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new AppError("Complaint record not found", 404);

    // 2. Check for existing invoice
    const existing = await Invoice.findOne({ complaintId, status: { $ne: "FAILED" } });
    if (existing) throw new AppError("An invoice already exists for this complaint", 400);

    // 3. Upload PDF to Supabase Storage
    const filePath = `invoices/${complaintId}_${Date.now()}.pdf`;
    const fileUrl  = await storageService.uploadInvoice(file.buffer, filePath, file.mimetype);

    // 4. Create invoice record
    const invoice = await Invoice.create({
      complaintId,
      fileUrl,
      uploadedBy: req.user.id || req.user._id,
      status:     "UPLOADED",
    });

    // 5. Queue extraction job
    const job = await invoiceExtractionQueue.add("extract-invoice-text", {
      invoiceId: invoice.id,
    }, { jobId: `extract-${invoice.id}` });

    sendSuccess(res, "Invoice uploaded and text extraction queued", { invoice, jobId: job.id }, 201);
  } catch (error) { next(error); }
};

export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) throw new AppError("Invoice not found", 404);
    sendSuccess(res, "Invoice retrieved successfully", invoice, 200);
  } catch (error) { next(error); }
};
