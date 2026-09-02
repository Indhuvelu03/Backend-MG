import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { listManagerCases, reviewCase } from "../controllers/manager.controller.js";
const router = Router();
router.use(authenticate, authorizeRoles("ADMIN", "DEALER", "STAFF"));
router.get("/cases", listManagerCases);
router.put("/cases/:complaintId/review", reviewCase);
export default router;
