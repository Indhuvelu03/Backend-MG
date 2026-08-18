// services/pdf.service.js
import pdfParse from "pdf-parse";
import { logger } from "../utils/logger.js";

export const extractTextFromPdf = async (buffer) => {
  try {
    const parsed = await pdfParse(buffer);
    return parsed.text?.trim() || "";
  } catch (error) {
    logger.error(`pdf-parse digital text extraction failed: ${error.message}`);
    throw error;
  }
};