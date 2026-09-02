import express from "express";
import crypto from "crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { standardLimiter } from "./middleware/rateLimit.middleware.js";
import { swaggerSpec } from "./config/swagger.js";
import { apiRouter } from "./routes/index.js";
import { getWorkerHeartbeat } from "./jobs/workerHeartbeat.js";

const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

// Every client-visible failure can be matched to one precise server log entry.
app.use((req, res, next) => {
  req.requestId = req.get("x-request-id") || crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
});

// Trust reverse proxy (Render / Cloudflare)
app.set("trust proxy", 1);

// Secure headers
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts for Vite SPA
}));

// CORS: only configured application origins may call credentialed APIs.
const allowedOrigins = new Set(
  [
    env.CLIENT_URL,
    ...(env.CORS_ALLOWED_ORIGINS || "").split(","),
    ...(env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ]
      : []),
  ]
    .map(origin => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
app.use((req, res, next) => {
  if (req.path === "/api/webhooks/twilio/status") return next();
  return standardLimiter(req, res, next);
});

// Swagger docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health probe
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    data: {
      status: "UP",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: "Supabase (PostgreSQL)",
    },
  });
});

// Readiness is intentionally stricter than liveness. Deployment monitors can
// call this endpoint to catch the otherwise invisible case where HTTP is up
// but the background automation service is offline.
app.get("/api/readiness", async (_req, res) => {
  try {
    const workerHeartbeat = await getWorkerHeartbeat();
    const ready = Boolean(workerHeartbeat);
    res.status(ready ? 200 : 503).json({
      success: ready,
      message: ready ? "API and automation worker are ready" : "Automation worker heartbeat is missing",
      data: { workerHeartbeat },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Automation readiness check failed",
      data: { reason: error.message },
    });
  }
});

// API routes
app.use("/api", apiRouter);

// Serve the dashboard bundle and let the React app handle its own routes.
app.use(express.static(publicDir));
app.get(/^\/(?!api(?:\/|$)|api-docs(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Error handler
app.use(errorHandler);

export default app;
