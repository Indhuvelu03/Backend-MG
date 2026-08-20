// controllers/feedback.controller.js — Supabase-based
import path from "path";
import * as feedbackService from "../services/feedback.service.js";
import * as storageService from "../services/storage.service.js";
import { Complaint } from "../models/Complaint.js";
import { FeedbackLink } from "../models/FeedbackLink.js";
import { transcriptionQueue } from "../jobs/queue.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

export const createLink = async (req, res, next) => {
  try {
    const { customerId } = req.body;
    const link = await feedbackService.createFeedbackLink(customerId);
    sendSuccess(res, "Feedback link generated successfully", link, 201);
  } catch (error) { next(error); }
};

export const listLinks = async (req, res, next) => {
  try {
    const links = await FeedbackLink.findAll();
    sendSuccess(res, "Feedback links retrieved successfully", links, 200);
  } catch (error) { next(error); }
};

export const sendInvite = async (req, res, next) => {
  try {
    const { feedbackLinkId } = req.body;
    await feedbackService.enqueueNotificationInvite(feedbackLinkId);
    sendSuccess(res, "Invite queued for delivery", { feedbackLinkId }, 200);
  } catch (error) { next(error); }
};

export const validateToken = async (req, res, next) => {
  try {
    const link = await feedbackService.verifyFeedbackToken(req.params.token);
    sendSuccess(res, "Token is valid", link, 200);
  } catch (error) { next(error); }
};

export const submitFeedback = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { vehicleNumber } = req.body;
    const file = req.file;

    if (!file)          throw new AppError("Audio recording is required", 400);
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

    // 3. Upload audio to Supabase Storage
    const ext       = path.extname(file.originalname) || ".mp3";
    const filePath  = `audio/${token}_${Date.now()}${ext}`;
    const audioUrl  = await storageService.uploadAudio(file.buffer, filePath, file.mimetype);

    // 4. Create complaint record
    const complaint = await Complaint.create({
      customerId:     customer.id || customer._id,
      feedbackLinkId: link.id,
      vehicleNumber:  custVehicle.toUpperCase(),
      audioUrl,
      status:         "AUDIO_UPLOADED",
    });

    // 5. Mark link as submitted (first use = expired)
    await FeedbackLink.updateById(link.id, { status: "SUBMITTED" });

    // 6. The request is only successful once durable queueing succeeds.
    // This prevents an uploaded recording from appearing accepted while no
    // automation can ever process it.
    const job = await transcriptionQueue.add("transcribe-audio", {
      complaintId: complaint.id,
    }, { jobId: `transcribe-${complaint.id}` });
    logger.info(`Queued transcription job ${job.id} for complaint ${complaint.id}`);

    sendSuccess(res, "Feedback submitted and queued for processing", { complaint, jobId: job.id }, 201);
  } catch (error) { next(error); }
};
