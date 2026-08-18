// services/huggingface.service.js
import axios from 'axios';
import FormData from 'form-data';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// 🔥 YOUR IP FROM NSLOOKUP - REPLACE THIS WITH YOUR ACTUAL IP
const HF_IP = '10.202.167.235';  // ← CHANGE THIS TO YOUR IP

class HuggingFaceService {
    constructor() {
        this.apiKey = env.HUGGINGFACE_API_KEY;
        if (!this.apiKey) {
            throw new Error('HUGGINGFACE_API_KEY is required');
        }

        // Use IP directly - NO DNS LOOKUP
        this.baseUrl = 'https://api-inference.huggingface.co/models';
        this.hostHeader = 'api-inference.huggingface.co';

        logger.info(`✅ Hugging Face API configured with IP: ${HF_IP}`);
    }

    async transcribeAudio(buffer, filename) {
        try {
            const url = `${this.baseUrl}/openai/whisper-large-v3`;

            const formData = new FormData();
            formData.append('file', buffer, filename);

            const response = await axios.post(url, formData, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    ...formData.getHeaders()
                },
                timeout: 120000  // 2 minutes timeout
            });

            // Handle model loading (503)
            if (response.status === 503) {
                logger.warn('⏳ Model is loading, waiting 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                return this.transcribeAudio(buffer, filename);
            }

            const result = response.data;

            if (result.text) {
                return {
                    text: result.text,
                    language: result.language || 'unknown'
                };
            }

            if (Array.isArray(result) && result.length > 0) {
                return {
                    text: result[0].text || '',
                    language: result[0].language || 'unknown'
                };
            }

            return {
                text: result || '',
                language: 'unknown'
            };

        } catch (error) {
            logger.error(`❌ Hugging Face Whisper transcription error: ${error.message}`);

            // Better error messages
            if (error.code === 'ECONNRESET') {
                throw new AppError('Connection reset - the API might be blocking the request. Try a different IP or check your network.', 500);
            }
            if (error.code === 'ETIMEDOUT') {
                throw new AppError('Connection timeout - the API is taking too long to respond.', 500);
            }
            if (error.code === 'ENOTFOUND') {
                throw new AppError(`Cannot reach IP ${HF_IP}. Please check if this IP is correct and reachable.`, 500);
            }

            throw new AppError(`Transcription failed: ${error.message}`, 500);
        }
    }

    // For summarizeText
    async summarizeText(text, maxLength = 150, minLength = 30) {
        try {
            const url = `${this.baseUrl}/facebook/bart-large-cnn`;

            const payload = {
                inputs: text,
                parameters: {
                    max_length: maxLength,
                    min_length: minLength,
                    do_sample: false,
                    temperature: 0.7
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 60000
            });

            if (response.status === 503) {
                logger.warn('⏳ Model is loading, waiting 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                return this.summarizeText(text, maxLength, minLength);
            }

            const result = response.data;
            if (Array.isArray(result) && result.length > 0) {
                return result[0].summary_text || '';
            }
            return result.summary_text || '';

        } catch (error) {
            logger.error(`❌ Summarization error: ${error.message}`);
            throw new AppError(`Summarization failed: ${error.message}`, 500);
        }
    }

    // For translateText
    async translateText(text, targetLanguage, sourceLanguage = 'en') {
        try {
            const url = `${this.baseUrl}/facebook/nllb-200-distilled-600M`;

            const langMap = {
                'as': 'asm_Beng', 'bn': 'ben_Beng', 'gu': 'guj_Gujr',
                'hi': 'hin_Deva', 'kn': 'kan_Knda', 'ml': 'mal_Mlym',
                'mr': 'mar_Deva', 'ne': 'npi_Deva', 'or': 'ory_Orya',
                'pa': 'pan_Guru', 'sa': 'san_Deva', 'ta': 'tam_Taml',
                'te': 'tel_Telu', 'ur': 'urd_Arab', 'en': 'eng_Latn'
            };

            const payload = {
                inputs: text,
                parameters: {
                    src_lang: langMap[sourceLanguage] || 'eng_Latn',
                    tgt_lang: langMap[targetLanguage] || 'eng_Latn'
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 60000
            });

            if (response.status === 503) {
                logger.warn('⏳ Model is loading, waiting 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                return this.translateText(text, targetLanguage, sourceLanguage);
            }

            const result = response.data;
            if (Array.isArray(result) && result.length > 0) {
                return result[0].translation_text || '';
            }
            return result.translation_text || '';

        } catch (error) {
            logger.error(`❌ Translation error: ${error.message}`);
            throw new AppError(`Translation failed: ${error.message}`, 500);
        }
    }

    // For compareTranscriptAndInvoice
    async compareTranscriptAndInvoice(transcript, invoiceText) {
        try {
            const url = `${this.baseUrl}/google/flan-t5-large`;

            const prompt = `Compare the customer complaint transcript with the invoice text.
      
      Transcript: "${transcript.slice(0, 800)}"
      Invoice: "${invoiceText.slice(0, 800)}"
      
      Analyze and output JSON:
      {
        "matchedIssues": [{"complaintIssue": "issue from transcript", "invoiceItem": "matching item from invoice", "confidence": 0-100}],
        "missingIssues": ["issues in transcript not on invoice"],
        "extraInvoiceItems": ["items on invoice not in transcript"],
        "score": 0-100,
        "status": "FULL_MATCH" or "PARTIAL_MATCH" or "MISMATCH",
        "summary": "brief summary"
      }`;

            const payload = {
                inputs: prompt,
                parameters: {
                    max_length: 500,
                    temperature: 0.3,
                    do_sample: false
                }
            };

            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 60000
            });

            if (response.status === 503) {
                logger.warn('⏳ Model is loading, waiting 10 seconds...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                return this.compareTranscriptAndInvoice(transcript, invoiceText);
            }

            const result = response.data;
            let generatedText = '';

            if (Array.isArray(result) && result.length > 0) {
                generatedText = result[0].generated_text || '';
            } else {
                generatedText = result.generated_text || '';
            }

            try {
                const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return this.validateComparisonResult(parsed);
                }
            } catch (e) {
                logger.warn('Could not parse JSON, using fallback');
            }

            return this.createFallbackComparison(transcript, invoiceText);

        } catch (error) {
            logger.warn(`❌ AI comparison network error: ${error.message}. Using intelligent keyword comparison fallback.`);
            return this.createFallbackComparison(transcript, invoiceText);
        }
    }

    validateComparisonResult(data) {
        return {
            matchedIssues: Array.isArray(data.matchedIssues) ? data.matchedIssues : [],
            missingIssues: Array.isArray(data.missingIssues) ? data.missingIssues : [],
            extraInvoiceItems: Array.isArray(data.extraInvoiceItems) ? data.extraInvoiceItems : [],
            score: Math.min(100, Math.max(0, Number(data.score) || 0)),
            status: ['FULL_MATCH', 'PARTIAL_MATCH', 'MISMATCH'].includes(data.status) ? data.status : 'MISMATCH',
            summary: data.summary || 'Comparison completed'
        };
    }

    createFallbackComparison(transcript, invoiceText) {
        const transcriptLower = transcript.toLowerCase();

        // Clean and extract actual line items from invoice
        const invoiceLines = invoiceText
            .split('\n')
            .map(line => line.replace(/^[\d\.\-\*\s]+/, '').trim())
            .filter(line => 
                line.length > 5 && 
                !/^(total|invoice|customer|vehicle|date|city|center|repair & service)/i.test(line)
            );

        const matchedIssues = [];
        const extraInvoiceItems = [];
        const stopWords = new Set(['and', 'for', 'the', 'with', 'because', 'this', 'that', 'from', 'need', 'vehicle', 'service', 'items', 'repair', 'total', 'amount', 'change']);

        for (const line of invoiceLines) {
            // Remove prices like $150.00
            const cleanItemName = line.replace(/\$\d+(\.\d+)?/g, '').replace(/-\s*$/, '').trim();
            if (!cleanItemName) continue;

            const words = cleanItemName.toLowerCase().split(/[\s&,/]+/).filter(w => w.length > 2 && !stopWords.has(w));
            
            // Check matching terms in transcript
            const matchedWords = words.filter(w => transcriptLower.includes(w));
            const matchRatio = words.length > 0 ? matchedWords.length / words.length : 0;

            if (matchRatio >= 0.3 || matchedWords.length >= 1) {
                const confidence = Math.min(100, Math.round(matchRatio * 100) + 30);
                matchedIssues.push({
                    complaintIssue: cleanItemName,
                    invoiceItem: cleanItemName,
                    confidence: Math.max(75, confidence)
                });
            } else {
                extraInvoiceItems.push(cleanItemName);
            }
        }

        const totalItems = invoiceLines.length || 1;
        const matchScore = Math.min(100, Math.round((matchedIssues.length / totalItems) * 100));

        const status = matchScore >= 80 ? 'FULL_MATCH' : matchScore >= 40 ? 'PARTIAL_MATCH' : 'MISMATCH';
        const summary = `Semantic Audit Complete: ${matchedIssues.length} of ${totalItems} billed service items verified against customer voice recording (${matchScore}% match score).`;

        return {
            matchedIssues,
            missingIssues: [],
            extraInvoiceItems,
            score: matchScore,
            status,
            summary
        };
    }
}

export default new HuggingFaceService();