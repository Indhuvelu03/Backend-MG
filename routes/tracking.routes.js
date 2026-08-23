import { Router } from "express";
import { getPublicTracking, submitServiceRating } from "../controllers/tracking.controller.js";
const router = Router();
router.get("/:token", getPublicTracking);
router.post("/:token/rating", submitServiceRating);
export default router;
