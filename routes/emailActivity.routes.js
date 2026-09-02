import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { listEmailActivities } from "../controllers/emailActivity.controller.js";

const router = Router();
router.use(authenticate, authorizeRoles("ADMIN", "DEALER", "STAFF"));
router.get("/", listEmailActivities);

export default router;
