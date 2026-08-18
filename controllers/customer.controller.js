// controllers/customer.controller.js
import * as customerService from "../services/customer.service.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { AppError } from "../utils/AppError.js";

export const createCustomer = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError("No authenticated admin/staff context found", 401);
    }
    const customer = await customerService.createCustomer(req.body, req.user.id);
    sendSuccess(res, "Customer created successfully", customer, 201);
  } catch (error) {
    next(error);
  }
};

export const listCustomers = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const data = await customerService.getCustomersList({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: search ? String(search) : undefined,
    });
    sendSuccess(res, "Customers retrieved successfully", data, 200);
  } catch (error) {
    next(error);
  }
};

export const getCustomer = async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    sendSuccess(res, "Customer retrieved successfully", customer, 200);
  } catch (error) {
    next(error);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    sendSuccess(res, "Customer updated successfully", customer, 200);
  } catch (error) {
    next(error);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    await customerService.deleteCustomer(req.params.id);
    sendSuccess(res, "Customer deleted successfully", null, 200);
  } catch (error) {
    next(error);
  }
};