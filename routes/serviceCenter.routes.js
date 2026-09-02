import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { listServiceCenters, createServiceCenter, updateServiceCenter, deleteServiceCenter } from "../controllers/serviceCenter.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", authorizeRoles("ADMIN", "DEALER", "STAFF"), listServiceCenters);
router.post("/", authorizeRoles("ADMIN", "DEALER"), createServiceCenter);
router.put("/:id", authorizeRoles("ADMIN", "DEALER"), updateServiceCenter);
router.delete("/:id", authorizeRoles("ADMIN", "DEALER"), deleteServiceCenter);

export default router;
