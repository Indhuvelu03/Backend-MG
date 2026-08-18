// services/ocr.service.js
import { createWorker } from "tesseract.js";
import { logger } from "../utils/logger.js";

export const extractTextFromScannedPdf = async (buffer) => {
  let worker;
  try {
    logger.info("Starting Tesseract OCR engine for scanned content extraction...");
    
    // Initialize tesseract worker
    worker = await createWorker("eng");

    // Perform OCR recognition
    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    return data.text?.trim() || "";
  } catch (error) {
    logger.error(`OCR processing failed: ${error.message}`);
    
    if (worker) {
      try {
        await worker.terminate();
      } catch (termErr) {
        logger.error("Failed to terminate OCR worker", termErr);
      }
    }
    
    throw error;
  }
};