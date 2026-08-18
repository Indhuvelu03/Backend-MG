// services/aiComparison.service.js — Groq openai/gpt-oss-120b
import Groq from "groq-sdk";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// Result schema for validation
const comparisonResultSchema = z.object({
  matchedIssues: z.array(
    z.object({
      complaintIssue: z.string(),
      invoiceItem: z.string(),
      confidence: z.number().min(0).max(100),
    }),
  ),
  missingIssues: z.array(z.string()),
  extraInvoiceItems: z.array(z.string()),
  score: z.number().min(0).max(100),
  status: z.enum(["FULL_MATCH", "PARTIAL_MATCH", "MISMATCH"]),
  summary: z.string(),
});

export const compareTranscriptAndInvoice = async (transcript, invoiceText, retryCount = 0) => {
  logger.info(`🤖 Running AI comparison via Groq openai/gpt-oss-120b (attempt ${retryCount + 1})`);

  const systemPrompt = `You are an expert automotive service fraud detection AI.
Your job is to compare a customer's voice complaint transcript with a service invoice and determine if the services billed match what the customer requested.

Always respond with ONLY valid JSON. No explanation, no markdown, no code blocks.`;

  const userPrompt = `Compare these two documents and return a JSON analysis:

CUSTOMER VOICE TRANSCRIPT:
"""
${transcript}
"""

SERVICE INVOICE TEXT:
"""
${invoiceText}
"""

Return ONLY this JSON structure:
{
  "matchedIssues": [
    { "complaintIssue": "<what customer said>", "invoiceItem": "<matching invoice line>", "confidence": <0-100> }
  ],
  "missingIssues": ["<issues customer reported but NOT billed>"],
  "extraInvoiceItems": ["<items billed but NOT mentioned by customer>"],
  "score": <overall match percentage 0-100>,
  "status": "<FULL_MATCH | PARTIAL_MATCH | MISMATCH>",
  "summary": "<2-3 sentence plain English audit conclusion>"
}

Rules:
- FULL_MATCH: score >= 90
- PARTIAL_MATCH: score 60-89
- MISMATCH: score < 60
- Be strict — flag any billing not justified by the customer's complaint`;

  try {
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    logger.info(`📊 Groq response received (${raw.length} chars)`);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError("Groq returned invalid JSON", 422);
    }

    const validated = comparisonResultSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn(`Validation failed: ${JSON.stringify(validated.error.format())}`);
      if (retryCount === 0) {
        logger.info("Retrying comparison with extra instructions...");
        return compareTranscriptAndInvoice(transcript, invoiceText, 1);
      }
      throw new AppError("AI comparison result did not match expected format", 422);
    }

    logger.info(`✅ AI comparison done: ${validated.data.status} — ${validated.data.score}%`);
    return validated.data;

  } catch (error) {
    logger.error(`❌ AI comparison failed: ${error.message}`);
    throw error;
  }
};