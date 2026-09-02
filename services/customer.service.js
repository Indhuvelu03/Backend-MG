// services/customer.service.js — Supabase-based
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/AppError.js";
import { autoCreateAndSendLink } from "./feedback.service.js";
import { logger } from "../utils/logger.js";

export const createCustomer = async (data, createdBy) => {
  const vehicleUpper = data.vehicleNumber?.toUpperCase();
  const existing = await Customer.findOne({
    vehicleNumber: vehicleUpper,
    dealershipId: data.dealershipId,
  });
  if (existing) throw new AppError("A customer with this vehicle number already exists", 400);

  const customer = await Customer.create({ ...data, vehicleNumber: vehicleUpper, createdBy });
  logger.info(`✅ Customer created: ${customer.name} (${vehicleUpper})`);

  // AUTO: generate feedback link + send email (zero admin action)
  try {
    const link = await autoCreateAndSendLink(customer.id);
    logger.info(`📧 Feedback link auto-queued for ${customer.name} — token: ${link.token}`);
  } catch (err) {
    logger.error(`⚠️ Auto-link failed for ${customer.name}: ${err.message}`);
    // Do not fail the customer creation
  }

  return customer;
};

export const getCustomersList = async (options = {}) => {
  const page  = Math.max(1, Number(options.page  || 1));
  const limit = Math.max(1, Math.min(100, Number(options.limit || 10)));
  const skip  = (page - 1) * limit;

  const query = {};
  if (options.dealershipId) {
    query.dealershipId = options.dealershipId;
  }
  if (options.search) {
    const regex = new RegExp(options.search, "i");
    query.$or = [{ name: regex }, { vehicleNumber: regex }, { mobile: regex }, { serviceCenter: regex }];
  }

  const { rows, total } = await Customer.find(query, { skip, limit });
  return { customers: rows, total, page, limit, pages: Math.ceil(total / limit) };
};

export const getCustomerById = async (id) => {
  const customer = await Customer.findById(id);
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};

export const updateCustomer = async (id, data) => {
  const previousCustomer = await Customer.findById(id);
  if (!previousCustomer) throw new AppError("Customer not found", 404);

  const customer = await Customer.findByIdAndUpdate(id, data);
  const emailChanged = Boolean(data.email) && data.email.trim().toLowerCase() !== (previousCustomer.email || "").toLowerCase();
  const vehicleChanged = Boolean(data.vehicleNumber) && data.vehicleNumber.trim().toUpperCase() !== (previousCustomer.vehicleNumber || "").toUpperCase();
  const mobileChanged = Boolean(data.mobile) && data.mobile.replace(/\D/g, "") !== (previousCustomer.mobile || "").replace(/\D/g, "");

  // A changed destination or vehicle needs a new signed link and an updated email.
  // Queueing keeps the edit endpoint responsive while the worker sends it reliably.
  if (emailChanged || vehicleChanged || mobileChanged) {
    try {
      const link = await autoCreateAndSendLink(customer.id);
      logger.info(`📧 Updated feedback invite auto-queued for ${customer.name} — token: ${link.token}`);
    } catch (err) {
      logger.error(`⚠️ Updated feedback invite failed for ${customer.name}: ${err.message}`);
    }
  }
  return customer;
};

export const deleteCustomer = async (id) => {
  const customer = await Customer.findByIdAndDelete(id);
  if (!customer) throw new AppError("Customer not found", 404);
};
