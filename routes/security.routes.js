import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { exportSecurityEvents, listSecurityEvents } from "../controllers/security.controller.js";

const router = Router();
router.use(authenticate, authorizeRoles("ADMIN", "DEALER"));
router.get("/events", listSecurityEvents);
router.get("/events/export", exportSecurityEvents);
export default router;
