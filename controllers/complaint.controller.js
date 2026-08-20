// controllers/complaint.controller.js — Supabase-based
import { Complaint } from "../models/Complaint.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import * as storageService from "../services/storage.service.js";
import { transcriptionQueue, notificationsQueue } from "../jobs/queue.js";

export const createComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.create({
      ...req.body,
      customerId: req.body.customerId,
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
    sendSuccess(res, "Complaint retrieved successfully", complaint, 200);
  } catch (error) {
    next(error);
  }
};

export const listComplaints = async (req, res, next) => {
  try {
    const { customerId } = req.query;
    const complaints = await Complaint.findAll({ customerId });
    sendSuccess(res, "Complaints retrieved successfully", complaints, 200);
  } catch (error) {
    next(error);
  }
};

export const updateComplaint = async (req, res, next) => {
  try {
    const existing = await Complaint.findById(req.params.id);
    if (!existing) throw new AppError("Complaint not found", 404);
    const complaint = await Complaint.updateById(req.params.id, req.body);
    if (req.body.status && req.body.status !== existing.status) {
      await notificationsQueue.add("status-update", {
        complaintId: complaint.id,
        status: complaint.status,
      }, { jobId: `status-${complaint.id}-${complaint.status}` });
    }
    sendSuccess(res, "Complaint updated successfully", complaint, 200);
  } catch (error) {
    next(error);
  }
};

export const deleteComplaint = async (req, res, next) => {
  try {
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

    // Enqueue transcription job
    const job = await transcriptionQueue.add("transcribe-audio", {
      complaintId: complaint.id,
    }, { jobId: `transcribe-${complaint.id}` });

    sendSuccess(res, "Audio uploaded and transcription queued", { complaint: updated, jobId: job.id }, 200);
  } catch (error) {
    next(error);
  }
};
