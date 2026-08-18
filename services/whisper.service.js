// services/whisper.service.js — Groq Whisper Large-v3 (cloud, free tier)
import Groq from "groq-sdk";
import fs from "fs";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

/**
 * Transcribes an audio file using Groq Whisper Large-v3.
 * Returns: { text, language, confidence, duration }
 */
const transcribe = async (audioFilePath) => {
  logger.info(`🎙️ Sending audio to Groq Whisper: ${audioFilePath}`);

  const fileStream = fs.createReadStream(audioFilePath);

  const response = await groq.audio.transcriptions.create({
    file: fileStream,
    model: "whisper-large-v3",
    response_format: "verbose_json",  // gives us language + segments
    temperature: 0,
  });

  const text = response.text?.trim() || "";
  const language = response.language || "en";
  const duration = response.duration || 0;

  // Estimate confidence from avg log-probability of segments (if available)
  let confidence = 0.95; // default high confidence
  if (response.segments && response.segments.length > 0) {
    const avgLogProb = response.segments.reduce((sum, seg) => sum + (seg.avg_logprob || -0.1), 0) / response.segments.length;
    // Convert log-prob to 0–1 scale (roughly): -0.0 = 100%, -0.7 = ~50%
    confidence = Math.min(1, Math.max(0, 1 + avgLogProb / 2));
  }

  logger.info(`✅ Groq Whisper done — lang: ${language}, confidence: ${(confidence * 100).toFixed(1)}%, chars: ${text.length}`);

  return {
    text,
    language,
    confidence: parseFloat((confidence * 100).toFixed(2)), // as percentage e.g. 96.4
    duration,
    length: text.length,
  };
};

export default { transcribe };