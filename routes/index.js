// routes/index.routes.js
import { Router } from "express";
import authRouter from "./auth.routes.js";
import customerRouter from "./customer.routes.js";
import feedbackRouter from "./feedback.routes.js";
import publicRouter from "./public.routes.js";
import invoiceRouter from "./invoice.routes.js";
import comparisonRouter from "./comparison.routes.js";
import reportRouter from "./report.routes.js";
import complaintRouter from "./complaint.routes.js";


export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/customers", customerRouter);
apiRouter.use("/feedback-links", feedbackRouter);
apiRouter.use("/public/feedback", publicRouter);
apiRouter.use("/complaints", complaintRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/comparison", comparisonRouter);
apiRouter.use("/reports", reportRouter);