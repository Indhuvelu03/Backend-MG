// controllers/customer.controller.js
import * as customerService from "../services/customer.service.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";
import { getEffectiveTenantId, verifyTenantOwnership } from "../middleware/tenant.middleware.js";
import { protectCustomerContact } from "../utils/privacy.js";
import { Dealership } from "../models/Dealership.js";

export const createCustomer = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError("No authenticated user context found", 401);
    }
    // Non-admin roles strictly bound to their own dealership
    const dealershipId = req.user.role === "ADMIN"
      ? (req.body.dealershipId || req.user.dealershipId || null)
      : (req.user.dealershipId || req.user.dealership_id);

    if (!dealershipId) {
      throw new AppError("Select a dealership branch before creating a customer", 400);
    }

    if (req.user.role === "ADMIN") {
      const dealership = await Dealership.findById(dealershipId);
      if (!dealership || dealership.isActive === false) {
        throw new AppError("The selected dealership branch is unavailable", 400);
      }
    }

    const customer = await customerService.createCustomer({ ...req.body, dealershipId }, req.user.id);
    sendSuccess(res, "Customer created successfully", protectCustomerContact(customer, req.user), 201);
  } catch (error) {
    next(error);
  }
};

export const listCustomers = async (req, res, next) => {
  try {
    const { page, limit, search, dealershipId } = req.query;
    const targetDealershipId = getEffectiveTenantId(req, dealershipId);
    const data = await customerService.getCustomersList({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: search ? String(search) : undefined,
      dealershipId: targetDealershipId,
    });
    sendSuccess(res, "Customers retrieved successfully", { ...data, customers: data.customers.map(customer => protectCustomerContact(customer, req.user)) }, 200);
  } catch (error) {
    next(error);
  }
};

export const getCustomer = async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    if (!customer) throw new AppError("Customer not found", 404);
    verifyTenantOwnership(customer, req.user, "Customer");
    sendSuccess(res, "Customer retrieved successfully", protectCustomerContact(customer, req.user), 200);
  } catch (error) {
    next(error);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const existing = await customerService.getCustomerById(req.params.id);
    if (!existing) throw new AppError("Customer not found", 404);
    verifyTenantOwnership(existing, req.user, "Customer");
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    sendSuccess(res, "Customer updated successfully", protectCustomerContact(customer, req.user), 200);
  } catch (error) {
    next(error);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    const existing = await customerService.getCustomerById(req.params.id);
    if (!existing) throw new AppError("Customer not found", 404);
    verifyTenantOwnership(existing, req.user, "Customer");
    await customerService.deleteCustomer(req.params.id);
    sendSuccess(res, "Customer deleted successfully", null, 200);
  } catch (error) {
    next(error);
  }
};

export const importCustomers = async (req, res, next) => {
  try {
    if (!req.user) throw new AppError("No authenticated user context found", 401);
    const dealershipId = req.user.role === "ADMIN"
      ? (req.body.dealershipId || req.user.dealershipId || null)
      : (req.user.dealershipId || req.user.dealership_id);

    if (!dealershipId) throw new AppError("Select a dealership branch before importing customers", 400);
    if (req.user.role === "ADMIN") {
      const dealership = await Dealership.findById(dealershipId);
      if (!dealership || dealership.isActive === false) {
        throw new AppError("The selected dealership branch is unavailable", 400);
      }
    }

    const imported = [];
    const failed = [];
    let cursor = 0;
    const importNext = async () => {
      while (cursor < req.body.customers.length) {
        const index = cursor;
        cursor += 1;
        const row = req.body.customers[index];
        try {
          const customer = await customerService.createCustomer({ ...row, dealershipId }, req.user.id);
          imported.push({ index, customer: protectCustomerContact(customer, req.user) });
        } catch (error) {
          failed.push({ row: index + 2, vehicleNumber: row.vehicleNumber, message: error.message || "Import failed" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, req.body.customers.length) }, importNext));
    imported.sort((a, b) => a.index - b.index);
    failed.sort((a, b) => a.row - b.row);

    sendSuccess(res, "Customer import completed", {
      imported: imported.map(item => item.customer),
      failed,
      summary: { total: req.body.customers.length, imported: imported.length, failed: failed.length },
    }, 200);
  } catch (error) {
    next(error);
  }
};
