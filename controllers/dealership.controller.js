// controllers/dealership.controller.js — Supabase-based
import { Dealership } from "../models/Dealership.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";

export const createDealership = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      throw new AppError("Only Super Administrators can create dealership branches.", 403);
    }
    const { name, code, city } = req.body;
    if (!name || !code || !city) {
      throw new AppError("Name, Code, and City are required.", 400);
    }
    const dealership = await Dealership.create(req.body);
    sendSuccess(res, "Dealership branch created successfully", dealership, 201);
  } catch (error) { next(error); }
};

export const listDealerships = async (req, res, next) => {
  try {
    const dealerships = await Dealership.findAll();
    sendSuccess(res, "Dealership branches retrieved successfully", dealerships, 200);
  } catch (error) { next(error); }
};

export const updateDealership = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      throw new AppError("Only Super Administrators can update dealership branches.", 403);
    }
    const dealership = await Dealership.updateById(req.params.id, req.body);
    sendSuccess(res, "Dealership branch updated successfully", dealership, 200);
  } catch (error) { next(error); }
};

export const deleteDealership = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "ADMIN") {
      throw new AppError("Only Super Administrators can delete dealership branches.", 403);
    }
    await Dealership.deleteById(req.params.id);
    sendSuccess(res, "Dealership branch deleted successfully", null, 200);
  } catch (error) { next(error); }
};
