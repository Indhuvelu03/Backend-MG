import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().min(10, "Mobile must be at least 10 characters"),
  email: z.string().email("A valid customer email is required"),
  vehicleNumber: z.string().min(4, "Vehicle number must be at least 4 characters"),
  vehicleModel: z.string().min(1, "Vehicle model is required"),
  serviceCenter: z.string().min(1, "Service center is required"),
  serviceDate: z.preprocess((val) => {
    if (typeof val === "string" || val instanceof Date) return new Date(val);
    return val;
  }, z.date({ invalid_type_error: "Invalid service date format" })),
});

export const updateCustomerSchema = createCustomerSchema.partial();
