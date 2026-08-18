// routes/auth.routes.js
import { Router } from "express";
import { register, login, getProfile } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimit.middleware.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";

const router = Router();

// Middleware to conditionally apply auth during registration (supports first-admin bootstrap)
const conditionalAuth = (req, res, next) => {
  if (req.headers.authorization) {
    authenticate(req, res, next).catch(next);
  } else {
    next();
  }
};

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication management APIs
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securePassword123
 *               role:
 *                 type: string
 *                 enum: [ADMIN, STAFF]
 *                 example: STAFF
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation failed or email already in use
 *       403:
 *         description: Forbidden (bootstrap period ended, requiring an ADMIN to add users)
 */
router.post(
  "/register",
  authLimiter,
  conditionalAuth,
  validateRequest({ body: registerSchema }),
  register,
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securePassword123
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", authLimiter, validateRequest({ body: loginSchema }), login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Retrieve active user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Token is missing or invalid
 */
router.get("/profile", authenticate, getProfile);

export default router;