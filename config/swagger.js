// src/config/swagger.js
import swaggerJSDoc from "swagger-jsdoc";
import { env } from "./env.js";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AI Vehicle Service Feedback & Invoice Verification System API",
      version: "1.0.0",
      description: "Backend services for automotive feedback recording, transcription, text extraction, and AI audit comparison.",
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: "Local Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./routes/*.js", "./routes/**/*.js", "./src/routes/*.js"],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);