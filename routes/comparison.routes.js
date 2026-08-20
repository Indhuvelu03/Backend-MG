// routes/comparison.routes.js
import { Router } from "express";
import { analyzeComparison, getComparison, getAuditReport } from "../controllers/comparison.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

const router = Router();

// Secure all endpoints in this router
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Comparison
 *   description: AI Invoice-to-Complaint semantic audit comparison APIs
 */

/**
 * @swagger
 * /api/comparison/analyze/{complaintId}:
 *   post:
 *     summary: Manually trigger AI semantic comparison analysis (ADMIN/STAFF)
 *     description: Starts a background GPT comparison check if both transcript and invoice text are extracted and no audit was run yet.
 *     tags: [Comparison]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: complaintId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       202:
 *         description: AI comparison job enqueued
 *       200:
 *         description: Comparison was already completed, returns existing report
 *       400:
 *         description: Inputs not ready or invoice not uploaded
 *       404:
 *         description: Complaint not found
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/analyze/:complaintId",
  authorizeRoles("ADMIN", "STAFF"),
  analyzeComparison,
);

/**
 * @swagger
 * /api/comparison/{complaintId}:
 *   get:
 *     summary: Retrieve AI semantic comparison report by complaint ID (ADMIN/STAFF)
 *     tags: [Comparison]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: complaintId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comparison report details
 *       404:
 *         description: Comparison report not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/:complaintId/report",
  authorizeRoles("ADMIN", "STAFF"),
  getAuditReport,
);

router.get(
  "/:complaintId",
  authorizeRoles("ADMIN", "STAFF"),
  getComparison,
);

export default router;
