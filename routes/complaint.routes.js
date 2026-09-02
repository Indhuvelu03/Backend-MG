// routes/complaint.routes.js
import { Router } from "express";
import {
  createComplaint,
  getComplaint,
  listComplaints,
  updateComplaint,
  deleteComplaint,
  uploadAudio,
  streamAudio,
  downloadAuditPdf,
} from "../controllers/complaint.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { uploadAudio as uploadAudioMiddleware } from "../middleware/upload.middleware.js";

const router = Router();

// Every complaint endpoint contains private customer information.
router.use(authenticate);

router.get("/:id/audio", authorizeRoles("ADMIN", "DEALER", "STAFF"), streamAudio);
router.get("/:id/pdf", authorizeRoles("ADMIN", "DEALER", "STAFF"), downloadAuditPdf);

/**
 * @swagger
 * tags:
 *   name: Complaints
 *   description: Complaint management APIs
 */

/**
 * @swagger
 * /api/complaints:
 *   post:
 *     summary: Create a new complaint
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - vehicleNumber
 *             properties:
 *               customerId:
 *                 type: string
 *               vehicleNumber:
 *                 type: string
 *               audioUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Complaint created successfully
 */
router.post("/", authorizeRoles("ADMIN", "DEALER", "STAFF"), createComplaint);

/**
 * @swagger
 * /api/complaints:
 *   get:
 *     summary: List all complaints
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of complaints
 */
router.get("/", authorizeRoles("ADMIN", "DEALER", "STAFF"), listComplaints);

/**
 * @swagger
 * /api/complaints/{id}:
 *   get:
 *     summary: Get complaint by ID
 *     tags: [Complaints]
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
 *         description: Complaint details
 *       404:
 *         description: Complaint not found
 */
router.get("/:id", authorizeRoles("ADMIN", "DEALER", "STAFF"), getComplaint);

/**
 * @swagger
 * /api/complaints/{id}:
 *   put:
 *     summary: Update complaint
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Complaint updated
 */
router.put("/:id", authorizeRoles("ADMIN", "DEALER", "STAFF"), updateComplaint);

/**
 * @swagger
 * /api/complaints/{id}:
 *   delete:
 *     summary: Delete complaint
 *     tags: [Complaints]
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
 *         description: Complaint deleted
 */
router.delete("/:id", authorizeRoles("ADMIN", "DEALER", "STAFF"), deleteComplaint);

/**
 * @swagger
 * /api/complaints/{id}/audio:
 *   post:
 *     summary: Upload audio for complaint
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - audio
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Audio uploaded
 */
router.post(
  "/:id/audio",
  authorizeRoles("ADMIN", "DEALER", "STAFF"),
  uploadAudioMiddleware,
  uploadAudio
);

export default router;
