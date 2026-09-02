// routes/dealership.routes.js
import { Router } from "express";
import { createDealership, listDealerships, updateDealership, deleteDealership } from "../controllers/dealership.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

const router = Router();

router.get("/", authenticate, authorizeRoles("ADMIN", "DEALER", "STAFF"), listDealerships);
router.post("/", authenticate, authorizeRoles("ADMIN"), createDealership);
router.put("/:id", authenticate, authorizeRoles("ADMIN"), updateDealership);
router.delete("/:id", authenticate, authorizeRoles("ADMIN"), deleteDealership);

export default router;
