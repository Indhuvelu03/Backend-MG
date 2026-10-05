import { z } from "zod";

const customerFields = {
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().min(10, "Mobile must be at least 10 characters"),
  email: z.string().email("A valid customer email is required"),
  vehicleNumber: z.string().min(4, "Vehicle number must be at least 4 characters"),
  vehicleModel: z.string().min(1, "Vehicle model is required"),
  serviceCenter: z.string().min(1, "Service center is required"),
  dealershipId: z.string().uuid("A valid dealership branch is required").optional(),
  serviceDate: z.preprocess((val) => {
    if (typeof val === "string" || val instanceof Date) return new Date(val);
    return val;
  }, z.date({ invalid_type_error: "Invalid service date format" })),
};

export const createCustomerSchema = z.object(customerFields);

export const importCustomersSchema = z.object({
  dealershipId: z.string().uuid("A valid dealership branch is required").optional(),
  customers: z.array(z.object(customerFields).omit({ dealershipId: true }))
    .min(1, "The workbook does not contain customer rows")
    .max(500, "A maximum of 500 customers can be imported at once"),
});

export const updateCustomerSchema = createCustomerSchema.partial();
