// routes/customer.routes.js
import { Router } from "express";
import {
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
} from "../controllers/customer.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { createCustomerSchema, updateCustomerSchema } from "../validators/customer.validator.js";

const router = Router();

// Apply auth to all customer routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer service record management APIs
 */

/**
 * @swagger
 * /api/customers:
 *   post:
 *     summary: Create a new customer service record
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - mobile
 *               - vehicleNumber
 *               - vehicleModel
 *               - serviceCenter
 *               - serviceDate
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Smith
 *               mobile:
 *                 type: string
 *                 example: "+919876543210"
 *               email:
 *                 type: string
 *                 example: jane@example.com
 *               vehicleNumber:
 *                 type: string
 *                 example: MH12AB1234
 *               vehicleModel:
 *                 type: string
 *                 example: Honda City
 *               serviceCenter:
 *                 type: string
 *                 example: Pune West
 *               serviceDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-07-25T10:00:00.000Z"
 *     responses:
 *       201:
 *         description: Customer created successfully
 *       400:
 *         description: Validation failed or vehicle number already registered
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/",
  authorizeRoles("ADMIN", "STAFF"),
  validateRequest({ body: createCustomerSchema }),
  createCustomer,
);

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: List customer service records
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           description: Search by name, vehicle number, mobile, or service center
 *     responses:
 *       200:
 *         description: List of customers retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", authorizeRoles("ADMIN", "STAFF"), listCustomers);

/**
 * @swagger
 * /api/customers/{id}:
 *   get:
 *     summary: Get a customer record by ID
 *     tags: [Customers]
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
 *         description: Customer details
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authorizeRoles("ADMIN", "STAFF"), getCustomer);

/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Update a customer record by ID
 *     tags: [Customers]
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
 *             properties:
 *               name:
 *                 type: string
 *               mobile:
 *                 type: string
 *               email:
 *                 type: string
 *               vehicleNumber:
 *                 type: string
 *               vehicleModel:
 *                 type: string
 *               serviceCenter:
 *                 type: string
 *               serviceDate:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:id",
  authorizeRoles("ADMIN", "STAFF"),
  validateRequest({ body: updateCustomerSchema }),
  updateCustomer,
);

/**
 * @swagger
 * /api/customers/{id}:
 *   delete:
 *     summary: Delete a customer record (ADMIN only)
 *     tags: [Customers]
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
 *         description: Customer deleted successfully
 *       404:
 *         description: Customer not found
 *       403:
 *         description: Forbidden (ADMIN role required)
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authorizeRoles("ADMIN"), deleteCustomer);

export default router;