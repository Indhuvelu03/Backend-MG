// routes/auth.routes.js
import { Router } from "express";
import { beginMfaSetup, deleteUser, disableMfa, enableMfa, forgotPassword, getProfile, listUsers, login, logout, logoutAll, register, resetPassword, updateUser, verifyMfaLogin } from "../controllers/auth.controller.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimit.middleware.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { forgotPasswordSchema, loginSchema, mfaCodeSchema, mfaVerifySchema, registerSchema, resetPasswordSchema } from "../validators/auth.validator.js";

const router = Router();

router.post(
  "/register",
  authLimiter,
  authenticate,
  authorizeRoles("ADMIN", "DEALER"),
  validateRequest({ body: registerSchema }),
  register,
);

router.post("/login", authLimiter, validateRequest({ body: loginSchema }), login);
router.post("/mfa/verify-login", authLimiter, validateRequest({ body: mfaVerifySchema }), verifyMfaLogin);
router.post("/forgot-password", authLimiter, validateRequest({ body: forgotPasswordSchema }), forgotPassword);
router.post("/reset-password", authLimiter, validateRequest({ body: resetPasswordSchema }), resetPassword);
router.get("/profile", authenticate, getProfile);
router.post("/logout", authenticate, logout);
router.post("/logout-all", authenticate, logoutAll);
router.post("/mfa/setup", authenticate, beginMfaSetup);
router.post("/mfa/enable", authenticate, validateRequest({ body: mfaCodeSchema }), enableMfa);
router.post("/mfa/disable", authenticate, validateRequest({ body: mfaCodeSchema }), disableMfa);

// User management — DEALER can list/update/delete their own staff
router.get("/users", authenticate, listUsers);
router.put("/users/:id", authenticate, authorizeRoles("ADMIN", "DEALER"), updateUser);
router.delete("/users/:id", authenticate, authorizeRoles("ADMIN", "DEALER"), deleteUser);

export default router;
