// middleware/validate.middleware.js
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails = {};
        error.errors.forEach((err) => {
          const key = err.path.join(".") || "field";
          errorDetails[key] = err.message;
        });
        next(new AppError("Validation Failed", 400, errorDetails));
      } else {
        next(error);
      }
    }
  };
};