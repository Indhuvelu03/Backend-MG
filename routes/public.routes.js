// routes/public.routes.js
import { Router } from "express";
import { submitFeedback } from "../controllers/feedback.controller.js";
import { publicFeedbackLimiter } from "../middleware/rateLimit.middleware.js";
import { uploadAudio } from "../middleware/upload.middleware.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { publicSubmitFeedbackSchema } from "../validators/feedback.validator.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Public Feedback
 *   description: Public customer voice feedback submission APIs
 */

/**
 * @swagger
 * /api/public/feedback/{token}:
 *   post:
 *     summary: Publicly submit customer voice complaint feedback (No auth required)
 *     tags: [Public Feedback]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           description: Feedback Link random hex token
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - vehicleNumber
 *               - audio
 *             properties:
 *               vehicleNumber:
 *                 type: string
 *                 description: Customer's registered vehicle number (for verification)
 *                 example: MH12AB1234
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Voice recording complaint file (audio/* format, max 15MB)
 *     responses:
 *       201:
 *         description: Feedback submitted successfully, background transcription started
 *       400:
 *         description: Validation failed, missing file, or vehicle number doesn't match
 *       404:
 *         description: Feedback link not found
 *       410:
 *         description: Feedback link has expired
 *       429:
 *         description: Too many feedback submissions from this IP
 */
router.post(
  "/:token",
  publicFeedbackLimiter,
  uploadAudio,
  validateRequest({ body: publicSubmitFeedbackSchema }),
  submitFeedback,
);

export default router;