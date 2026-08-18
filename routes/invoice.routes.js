// routes/invoice.routes.js
import { Router } from "express";
import { uploadInvoice, getInvoice } from "../controllers/invoice.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { uploadInvoicePdf } from "../middleware/upload.middleware.js";

const router = Router();

// Secure all endpoints in this router
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Invoices
 *   description: Invoice upload and extraction management APIs
 */

/**
 * @swagger
 * /api/invoices/upload:
 *   post:
 *     summary: Upload a service invoice PDF (ADMIN/STAFF)
 *     description: Uploads a digital or scanned invoice PDF file, uploads it to S3, and registers it to a complaint. Starts background text extraction.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - complaintId
 *               - file
 *             properties:
 *               complaintId:
 *                 type: string
 *                 description: ID of the voice complaint to link this invoice to
 *                 example: 60d21b4667d0d8992e610c87
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF invoice file (max 10MB)
 *     responses:
 *       201:
 *         description: Invoice uploaded and extraction job enqueued
 *       400:
 *         description: Validation failed, missing file, or active invoice already linked
 *       404:
 *         description: Complaint not found
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/upload",
  authorizeRoles("ADMIN", "STAFF"),
  uploadInvoicePdf,
  uploadInvoice,
);

/**
 * @swagger
 * /api/invoices/{id}:
 *   get:
 *     summary: Get invoice details and extraction status (ADMIN/STAFF)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details and text extraction status
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/:id",
  authorizeRoles("ADMIN", "STAFF"),
  getInvoice,
);

export default router;