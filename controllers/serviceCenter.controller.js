import { ServiceCenter } from "../models/ServiceCenter.js";
import { sendSuccess } from "../utils/responseHandler.js";
export const listServiceCenters = async (req, res, next) => { try { sendSuccess(res, "Service centers retrieved", await ServiceCenter.findAll()); } catch (error) { next(error); } };
export const createServiceCenter = async (req, res, next) => { try { sendSuccess(res, "Service center created", await ServiceCenter.create(req.body), 201); } catch (error) { next(error); } };
export const updateServiceCenter = async (req, res, next) => { try { sendSuccess(res, "Service center updated", await ServiceCenter.update(req.params.id, req.body)); } catch (error) { next(error); } };
export const deleteServiceCenter = async (req, res, next) => { try { await ServiceCenter.delete(req.params.id); sendSuccess(res, "Service center deleted", null); } catch (error) { next(error); } };
