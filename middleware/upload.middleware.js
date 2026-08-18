import multer from "multer";
import { AppError } from "../utils/AppError.js";

const storage = multer.memoryStorage();

export const uploadAudio = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
  fileFilter: (req, file, cb) => {
    const isMedia =
      file.mimetype.startsWith("audio/") ||
      file.mimetype.startsWith("video/") ||
      file.mimetype === "application/octet-stream" ||
      /\.(mp3|wav|mpeg|mpg|m4a|ogg|mp4|webm|aac)$/i.test(file.originalname);

    if (isMedia) {
      cb(null, true);
    } else {
      cb(new AppError("Only audio/video media files are allowed for feedback submissions", 400));
    }
  },
}).single("audio");

export const uploadInvoicePdf = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new AppError("Only digital or scanned PDF files are allowed for invoices", 400));
    }
  },
}).single("file");
