import { Router } from "express";
import { getPublicTracking } from "../controllers/tracking.controller.js";
const router = Router();
router.get("/:token", getPublicTracking);
export default router;
