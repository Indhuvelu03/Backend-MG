import { ServiceCenter } from "../models/ServiceCenter.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { getEffectiveTenantId, verifyTenantOwnership } from "../middleware/tenant.middleware.js";

export const listServiceCenters = async (req, res, next) => {
  try {
    const dealershipId = getEffectiveTenantId(req, req.query.dealershipId);
    const data = await ServiceCenter.findAll(dealershipId ? { dealershipId } : {});
    sendSuccess(res, "Service centers retrieved", data);
  } catch (error) { next(error); }
};

export const createServiceCenter = async (req, res, next) => {
  try {
    const userTenant = req.user?.dealershipId || req.user?.dealership_id;
    const dealershipId = req.user?.role === "ADMIN"
      ? (req.body.dealershipId || userTenant || null)
      : userTenant;

    if (!dealershipId && req.user?.role !== "ADMIN") {
      throw new AppError("Dealer account has no associated dealership branch", 403);
    }

    const { name, branch, location, phone, managerEmail, manager_email } = req.body;
    if (!name) throw new AppError("Service center name is required", 400);

    // Uniqueness check per dealership
    const existingList = await ServiceCenter.findAll(dealershipId ? { dealershipId } : {});
    const duplicate = existingList.find(s => s.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (duplicate) {
      throw new AppError(`A service center branch named "${name}" already exists for your dealership.`, 400);
    }

    const payload = {
      name,
      location: branch || location || "Main",
      branch: branch || location || "Main",
      phone: phone || null,
      managerEmail: managerEmail || manager_email,
      dealershipId,
    };

    const created = await ServiceCenter.create(payload);
    sendSuccess(res, "Service center created successfully", created, 201);
  } catch (error) { next(error); }
};

export const updateServiceCenter = async (req, res, next) => {
  try {
    const existing = await ServiceCenter.findById(req.params.id);
    if (!existing) throw new AppError("Service center not found", 404);
    verifyTenantOwnership(existing, req.user, "Service Center");

    const updated = await ServiceCenter.update(req.params.id, req.body);
    sendSuccess(res, "Service center updated successfully", updated);
  } catch (error) { next(error); }
};

export const deleteServiceCenter = async (req, res, next) => {
  try {
    const existing = await ServiceCenter.findById(req.params.id);
    if (!existing) throw new AppError("Service center not found", 404);
    verifyTenantOwnership(existing, req.user, "Service Center");

    await ServiceCenter.delete(req.params.id);
    sendSuccess(res, "Service center deleted successfully", null);
  } catch (error) { next(error); }
};
