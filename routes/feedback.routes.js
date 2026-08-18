// routes/feedback.routes.js
import { Router } from "express";
import {
  createLink,
  listLinks,
  sendInvite,
  validateToken,
} from "../controllers/feedback.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { validateRequest } from "../middleware/validate.middleware.js";
import { createFeedbackLinkSchema, sendFeedbackLinkSchema } from "../validators/feedback.validator.js";

const router = Router();

router.get("/", authenticate, authorizeRoles("ADMIN", "STAFF"), listLinks);

router.post(
  "/create",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  validateRequest({ body: createFeedbackLinkSchema }),
  createLink,
);

router.post(
  "/send",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  validateRequest({ body: sendFeedbackLinkSchema }),
  sendInvite,
);

router.get("/:token", validateToken);

export default router;