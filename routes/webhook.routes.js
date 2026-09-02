import { Router } from "express";
import { handleTwilioStatus } from "../controllers/twilioWebhook.controller.js";

const router = Router();
router.post("/twilio/status", handleTwilioStatus);

export default router;
