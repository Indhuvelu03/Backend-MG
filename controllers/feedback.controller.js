// controllers/feedback.controller.js — Supabase-based
import path from "path";
import * as feedbackService from "../services/feedback.service.js";
import * as storageService from "../services/storage.service.js";
import { Complaint } from "../models/Complaint.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { Customer } from "../models/Customer.js";
import { processTypedFeedback, runTranscription } from "../services/directProcessor.service.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { getEffectiveTenantId, verifyTenantOwnership } from "../middleware/tenant.middleware.js";
import { env } from "../config/env.js";

export const createLink = async (req, res, next) => {
  try {
    const { customerId } = req.body;
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError("Customer not found", 404);
    verifyTenantOwnership(customer, req.user, "Customer");
    const link = await feedbackService.createFeedbackLink(customerId);
    sendSuccess(res, "Feedback link generated and ready to send", link, 201);
  } catch (error) { next(error); }
};

export const listLinks = async (req, res, next) => {
  try {
    const dealershipId = getEffectiveTenantId(req, req.query.dealershipId);
    const links = await FeedbackLink.findAll({ dealershipId });

    sendSuccess(res, "Feedback links retrieved successfully", links, 200);
  } catch (error) { next(error); }
};

export const sendInvite = async (req, res, next) => {
  try {
    const { feedbackLinkId, channels } = req.body;
    const link = await FeedbackLink.findByIdWithCustomer(feedbackLinkId);
    if (!link) throw new AppError("Feedback link not found", 404);
    verifyTenantOwnership(link.customerId || link, req.user, "Feedback link");
    await feedbackService.enqueueNotificationInvite(feedbackLinkId, channels);
    sendSuccess(res, "Invite queued for delivery", { feedbackLinkId, channels }, 200);
  } catch (error) { next(error); }
};

export const renewExpiredLink = async (req, res, next) => {
  try {
    const link = await FeedbackLink.findByIdWithCustomer(req.params.id);
    if (!link) throw new AppError("Feedback link not found", 404);
    verifyTenantOwnership(link.customerId || link, req.user, "Feedback link");
    if (link.status === "SUBMITTED") {
      throw new AppError("A submitted feedback link cannot be renewed", 400);
    }
    if (!link.isExpired()) {
      throw new AppError("Only expired feedback links can be renewed", 400);
    }

    const customerId = link.customerId?.id || link.customerId?._id || link.customerId || link.customer_id;
    const renewedLink = await feedbackService.autoCreateAndSendLink(customerId);
    sendSuccess(res, "A new 72-hour feedback link was created and sent", renewedLink, 201);
  } catch (error) { next(error); }
};

export const validateToken = async (req, res, next) => {
  try {
    const link = await feedbackService.verifyFeedbackToken(req.params.token);
    const customer = link.customerId || link.customer;
    sendSuccess(res, "Token is valid", {
      id: link.id,
      status: link.status,
      expiresAt: link.expiresAt || link.expires_at,
      customerId: customer && {
        name: customer.name,
        vehicleNumber: customer.vehicleNumber || customer.vehicle_number,
        vehicleModel: customer.vehicleModel || customer.vehicle_model,
        serviceCenter: customer.serviceCenter || customer.service_center,
        serviceDate: customer.serviceDate || customer.service_date,
      },
    }, 200);
  } catch (error) { next(error); }
};

export const deleteLink = async (req, res, next) => {
  try {
    const link = await FeedbackLink.findByIdWithCustomer(req.params.id);
    if (!link) throw new AppError("Feedback link not found", 404);
    verifyTenantOwnership(link.customerId || link, req.user, "Feedback link");
    await FeedbackLink.deleteById(req.params.id);
    sendSuccess(res, "Feedback link deleted", null);
  } catch (error) { next(error); }
};

export const submitFeedback = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { vehicleNumber, feedbackText } = req.body;
    const file = req.file;
    const voiceConsent = String(req.body.voiceConsent || "").toLowerCase() === "true";

    if (!file && !feedbackText?.trim()) throw new AppError("Please provide typed feedback or a voice recording", 400);
    if (file && !voiceConsent) throw new AppError("Voice recording consent is required", 400);
    if (!vehicleNumber) throw new AppError("Vehicle number is required", 400);

    // 1. Verify link + get customer
    const link     = await feedbackService.verifyFeedbackToken(token);
    const customer = link.customerId || link.customer;
    if (!customer) throw new AppError("Customer record not found for this link", 404);

    // 2. Validate vehicle number
    const custVehicle = customer.vehicle_number || customer.vehicleNumber || "";
    if (custVehicle.toUpperCase() !== vehicleNumber.trim().toUpperCase()) {
      throw new AppError("Vehicle number verification failed", 400);
    }

    // 3. Audio is optional; typed feedback is accepted on its own.
    let audioUrl = null;
    if (file) {
      const ext = path.extname(file.originalname) || ".mp3";
      const filePath = `audio/${token}_${Date.now()}${ext}`;
      audioUrl = await storageService.uploadAudio(file.buffer, filePath, file.mimetype);
    }

    // 4. Create complaint record (attached to customer's dealership branch)
    const dealershipId = customer.dealership_id || customer.dealershipId || customer.dealerId || null;
    const complaint = await Complaint.create({
      customerId:     customer.id || customer._id,
      dealershipId,
      feedbackLinkId: link.id,
      vehicleNumber:  custVehicle.toUpperCase(),
      audioUrl,
      transcript:      feedbackText?.trim() || null,
      status:          file ? "AUDIO_UPLOADED" : "TRANSCRIBED",
      voiceConsentAt:  file ? new Date().toISOString() : null,
      privacyNoticeVersion: "2026-01",
      retentionUntil: new Date(Date.now() + env.AUDIO_RETENTION_DAYS * 86400000).toISOString(),
    });

    // 5. Mark link as submitted (first use = expired)
    await FeedbackLink.updateById(link.id, { status: "SUBMITTED" });

    // 6. Run processing in the web service. Free Render deployments do not
    // provide a separate worker, so a no-op queue must never swallow this job.
    let jobId = null;
    if (file) {
      jobId = `direct-transcribe-${complaint.id}`;
      await runTranscription(complaint.id);
    } else {
      jobId = `direct-text-${complaint.id}`;
      await processTypedFeedback(complaint.id);
    }

    sendSuccess(res, file ? "Feedback submitted and processing started" : "Typed feedback submitted and processing started", {
      complaint: { id: complaint.id, status: complaint.status, vehicleNumber: complaint.vehicleNumber },
      jobId,
    }, 201);
  } catch (error) { next(error); }
};
