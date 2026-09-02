import { Router } from "express";
import { downloadTrackingReport, getPublicTracking, submitServiceRating } from "../controllers/tracking.controller.js";
const router = Router();
router.get("/:token", getPublicTracking);
router.get("/:token/report", downloadTrackingReport);
router.post("/:token/rating", submitServiceRating);
export default router;
