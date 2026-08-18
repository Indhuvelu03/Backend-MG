// routes/report.routes.js
import { Router } from "express";
import { getDashboardMetrics } from "../controllers/report.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

const router = Router();

// Secure all endpoints in this router
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Executive dashboard analytics and discrepancy reports
 */

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Retrieve dashboard metrics and analytics (ADMIN only)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (inclusive)
 *         example: "2026-07-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (inclusive)
 *         example: "2026-07-25"
 *       - in: query
 *         name: serviceCenter
 *         schema:
 *           type: string
 *         description: Service center location filter
 *         example: Pune West
 *     responses:
 *       200:
 *         description: Dashboard metrics and performance calculations retrieved successfully
 *       403:
 *         description: Forbidden (ADMIN role required)
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/dashboard",
  authorizeRoles("ADMIN"),
  getDashboardMetrics,
);

export default router;