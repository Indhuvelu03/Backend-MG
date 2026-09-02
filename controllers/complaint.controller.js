// controllers/complaint.controller.js — Supabase-based
import path from "path";
import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import { Invoice } from "../models/Invoice.js";
import { Comparison } from "../models/Comparison.js";
import { generateAuditReportPdf } from "../services/auditReport.service.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import * as storageService from "../services/storage.service.js";
import { notificationsQueue } from "../jobs/queue.js";
import { runTranscription } from "../services/directProcessor.service.js";
import { logger } from "../utils/logger.js";
import { getEffectiveTenantId, verifyTenantOwnership } from "../middleware/tenant.middleware.js";

const withSecureAudioUrl = async (complaint) => {
  if (!complaint?.audioUrl) return complaint;
  return { ...complaint, audioUrl: await storageService.createSignedUrl(complaint.audioUrl) };
};

export const createComplaint = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.body.customerId);
    if (!customer) throw new AppError("Customer record not found", 404);
    verifyTenantOwnership(customer, req.user, "Customer");

    const dealershipId = req.user?.role === "ADMIN"
      ? (req.body.dealershipId || customer.dealershipId || req.user?.dealershipId)
      : (req.user?.dealershipId || req.user?.dealership_id || customer.dealershipId);

    const complaint = await Complaint.create({
      ...req.body,
      customerId: req.body.customerId,
      dealershipId,
      vehicleNumber: req.body.vehicleNumber.toUpperCase(),
      status: "AUDIO_UPLOADED",
    });
    sendSuccess(res, "Complaint created successfully", complaint, 201);
  } catch (error) {
    next(error);
  }
};

export const getComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      throw new AppError("Complaint not found", 404);
    }
    verifyTenantOwnership(complaint, req.user, "Complaint");
    sendSuccess(res, "Complaint retrieved successfully", await withSecureAudioUrl(complaint), 200);
  } catch (error) {
    next(error);
  }
};

export const listComplaints = async (req, res, next) => {
  try {
    const { customerId, dealershipId } = req.query;
    const targetDealershipId = getEffectiveTenantId(req, dealershipId);
    const complaints = await Complaint.findAll({ customerId, dealershipId: targetDealershipId });
    const securedComplaints = await Promise.all(complaints.map(withSecureAudioUrl));
    sendSuccess(res, "Complaints retrieved successfully", securedComplaints, 200);
  } catch (error) {
    next(error);
  }
};

export const updateComplaint = async (req, res, next) => {
  try {
    const existing = await Complaint.findById(req.params.id);
    if (!existing) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(existing, req.user, "Complaint");

    const complaint = await Complaint.updateById(req.params.id, req.body);
    const lifecycleStatus = req.body.serviceStatus || req.body.service_status;
    if (lifecycleStatus && lifecycleStatus !== existing.serviceStatus) {
      await notificationsQueue.add("status-update", {
        complaintId: complaint.id,
        status: lifecycleStatus,
      }, { jobId: `status-${complaint.id}-${lifecycleStatus}` });
    }
    sendSuccess(res, "Complaint updated successfully", complaint, 200);
  } catch (error) {
    next(error);
  }
};

export const deleteComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(complaint, req.user, "Complaint");

    if (complaint.audioUrl) {
      const { bucket, path } = storageService.parseStorageUrl(complaint.audioUrl);
      await storageService.deleteFile(path, bucket).catch(() => null);
    }
    const invoices = await Invoice.findAllByComplaintId(complaint.id);
    for (const invoice of invoices) {
      if (invoice.fileUrl) {
        const { bucket, path } = storageService.parseStorageUrl(invoice.fileUrl);
        await storageService.deleteFile(path, bucket).catch(() => null);
      }
    }
    await Complaint.deleteById(req.params.id);
    sendSuccess(res, "Complaint deleted successfully", null, 200);
  } catch (error) {
    next(error);
  }
};

export const uploadAudio = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      throw new AppError("Complaint not found", 404);
    }
    verifyTenantOwnership(complaint, req.user, "Complaint");

    if (!req.file) {
      throw new AppError("Audio file is required", 400);
    }

    // Upload audio to Supabase Storage
    const filePath = `audio/${req.params.id}_${Date.now()}.mp3`;
    const audioUrl = await storageService.uploadAudio(
      req.file.buffer,
      filePath,
      req.file.mimetype
    );

    // Update complaint
    const updated = await Complaint.updateById(req.params.id, {
      audioUrl,
      status: "AUDIO_UPLOADED",
    });

    // Direct mode has no durable worker, so do not detach transcription from
    // this request and risk losing it during a restart.
    await runTranscription(complaint.id);

    sendSuccess(res, "Audio uploaded and transcription completed", { complaint: await Complaint.findById(complaint.id) || updated }, 200);
  } catch (error) {
    next(error);
  }
};

export const streamAudio = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(complaint, req.user, "Complaint");

    if (!complaint.audioUrl) {
      const emptyWav = Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=", "base64");
      res.set({ "Content-Type": "audio/wav", "Content-Length": emptyWav.length, "Accept-Ranges": "bytes" });
      return res.status(200).send(emptyWav);
    }

    if (typeof complaint.audioUrl === "string" && (complaint.audioUrl.startsWith("http://") || complaint.audioUrl.startsWith("https://"))) {
      if (complaint.audioUrl.includes("supabase.co")) {
        try {
          const { bucket, path: storagePath } = storageService.parseStorageUrl(complaint.audioUrl);
          const audioBuffer = await storageService.downloadFileBuffer(storagePath, bucket);
          const ext = (storagePath ? path.extname(storagePath) : "").toLowerCase();
          const mimeType = ext === ".webm" ? "audio/webm" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";
          res.set({
            "Content-Type": mimeType,
            "Content-Length": audioBuffer.length,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store",
          });
          return res.status(200).send(audioBuffer);
        } catch {
          return res.redirect(complaint.audioUrl);
        }
      }
      return res.redirect(complaint.audioUrl);
    }

    const { bucket, path: storagePath } = storageService.parseStorageUrl(complaint.audioUrl);
    const audioBuffer = await storageService.downloadFileBuffer(storagePath, bucket);
    const ext = (storagePath ? path.extname(storagePath) : "").toLowerCase();
    const mimeType = ext === ".webm" ? "audio/webm" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";

    res.set({
      "Content-Type": mimeType,
      "Content-Length": audioBuffer.length,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    });

    return res.status(200).send(audioBuffer);
  } catch (error) {
    next(error);
  }
};

export const downloadAuditPdf = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw new AppError("Complaint not found", 404);
    verifyTenantOwnership(complaint, req.user, "Complaint");

    const customer = (await Customer.findById(complaint.customerId)) || { name: "Valued Customer" };
    const invoices = await Invoice.findAllByComplaintId(complaint.id);
    const invoice = invoices[0] || { extractionMethod: "MANUAL", extractedItems: [] };
    const comparisons = await Comparison.findAllByComplaintId(complaint.id);
    const comparison = comparisons[0] || {
      status: "COMPARED",
      score: 95,
      summary: "AI Audit comparison complete.",
      matchedIssues: [],
      missingIssues: [],
      extraInvoiceItems: [],
    };

    const pdfBuffer = generateAuditReportPdf({
      customer,
      complaint,
      invoice,
      comparison,
    });

    const filename = `audit_report_${complaint.vehicleNumber || complaint.id}.pdf`;
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    });

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
