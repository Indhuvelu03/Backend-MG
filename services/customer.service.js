// services/customer.service.js — Supabase-based
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/AppError.js";
import { autoCreateAndSendLink } from "./feedback.service.js";
import { logger } from "../utils/logger.js";

export const createCustomer = async (data, createdBy) => {
  const vehicleUpper = data.vehicleNumber?.toUpperCase();
  const existing = await Customer.findOne({ vehicleNumber: vehicleUpper });
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
  const customer = await Customer.findByIdAndUpdate(id, data);
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};

export const deleteCustomer = async (id) => {
  const customer = await Customer.findByIdAndDelete(id);
  if (!customer) throw new AppError("Customer not found", 404);
};