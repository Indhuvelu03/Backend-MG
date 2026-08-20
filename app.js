import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { standardLimiter } from "./middleware/rateLimit.middleware.js";
import { swaggerSpec } from "./config/swagger.js";
import { apiRouter } from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust reverse proxy (Render / Cloudflare)
app.set("trust proxy", 1);

// Secure headers
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts for Vite SPA
}));

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
app.options("*", cors());

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static frontend
app.use(express.static("public"));

// Rate limiting
app.use(standardLimiter);

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

// API routes
app.use("/api", apiRouter);

// SPA client routing fallback (returns index.html for non-API routes)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handler
app.use(errorHandler);

export default app;
