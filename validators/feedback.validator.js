import { z } from "zod";

export const createFeedbackLinkSchema = z.object({
  customerId: z.string().uuid("Invalid Customer ID format"),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const sendFeedbackLinkSchema = z.object({
  feedbackLinkId: z.string().uuid("Invalid Feedback Link ID format"),
  channels: z.array(z.enum(["email", "sms", "whatsapp"])).min(1, "At least one notification channel is required"),
});

export const publicSubmitFeedbackSchema = z.object({
  vehicleNumber: z.string().min(4, "Vehicle number must be at least 4 characters"),
  feedbackText: z.string().trim().min(10, "Please enter at least 10 characters of feedback").max(5000).optional(),
  voiceConsent: z.enum(["true", "false"]).optional(),
});
