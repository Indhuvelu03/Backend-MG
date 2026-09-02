// services/whisper.service.js — Groq Whisper Large-v3 Multilingual & Translation
import Groq from "groq-sdk";
import fs from "fs";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

const detectScriptLanguage = (text = "", defaultLang = "en") => {
  if (/[\u0900-\u097F]/.test(text)) return "hi"; // Hindi (Devanagari)
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta"; // Tamil
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn"; // Kannada
  if (/[\u0C00-\u0C7F]/.test(text)) return "te"; // Telugu
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml"; // Malayalam
  return defaultLang;
};

/**
 * Transcribes an audio file using Groq Whisper Large-v3.
 * Automatically translates non-English audio to English for AI comparison.
 * Returns: { text, englishTranscript, language, confidence, duration }
 */
const transcribe = async (audioFilePath) => {
  logger.info(`🎙️ Sending audio to Groq Multilingual Whisper: ${audioFilePath}`);

  const fileStream = fs.createReadStream(audioFilePath);

  const response = await groq.audio.transcriptions.create({
    file: fileStream,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    temperature: 0,
  });

  const text = response.text?.trim() || "";
  let language = response.language || "en";
  language = detectScriptLanguage(text, language);
  const duration = response.duration || 0;

  let englishTranscript = text;
  if (language !== "en" && language !== "english") {
    try {
      logger.info(`🌐 Translating ${language} audio to English via Groq...`);
      const transStream = fs.createReadStream(audioFilePath);
      const translationRes = await groq.audio.translations.create({
        file: transStream,
        model: "whisper-large-v3",
      });
      if (translationRes.text?.trim()) {
        englishTranscript = translationRes.text.trim();
      }
    } catch (err) {
      logger.warn(`⚠️ Groq translation fallback to original text: ${err.message}`);
    }
  }

  let confidence = 0.95;
  if (response.segments && response.segments.length > 0) {
    const avgLogProb = response.segments.reduce((sum, seg) => sum + (seg.avg_logprob || -0.1), 0) / response.segments.length;
    confidence = Math.min(1, Math.max(0, 1 + avgLogProb / 2));
  }

  logger.info(`✅ Groq Whisper done — lang: ${language}, chars: ${text.length}, english chars: ${englishTranscript.length}`);

  return {
    text,
    englishTranscript,
    language,
    confidence: parseFloat((confidence * 100).toFixed(2)),
    duration,
    length: text.length,
  };
};

export default { transcribe };