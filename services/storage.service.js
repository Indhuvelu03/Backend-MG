// services/storage.service.js — Supabase Storage (replaces AWS S3)
import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";

const AUDIO_BUCKET   = "audio-complaints";
const INVOICE_BUCKET = "invoice-pdfs";

/**
 * Upload a file buffer to Supabase Storage
 * Returns the public URL of the uploaded file
 */
export const uploadFile = async (buffer, path, contentType, bucket = AUDIO_BUCKET) => {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) {
    logger.error(`Storage upload error (${bucket}/${path}): ${error.message}`);
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  logger.info(`✅ Uploaded to Supabase Storage: ${bucket}/${path}`);
  return data.publicUrl;
};

/**
 * Upload audio file
 */
export const uploadAudio = async (buffer, path, contentType) =>
  uploadFile(buffer, path, contentType, AUDIO_BUCKET);

/**
 * Upload invoice PDF
 */
export const uploadInvoice = async (buffer, path, contentType) =>
  uploadFile(buffer, path, contentType, INVOICE_BUCKET);

/**
 * Download a file from Supabase Storage as a Buffer
 */
export const downloadFileBuffer = async (path, bucket = AUDIO_BUCKET) => {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    logger.error(`Storage download error (${bucket}/${path}): ${error.message}`);
    throw new Error(error.message);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

/**
 * Extract storage path from a public URL
 * e.g. "https://xxx.supabase.co/storage/v1/object/public/audio-complaints/audio/abc.ogg"
 *   → { bucket: "audio-complaints", path: "audio/abc.ogg" }
 */
export const parseStorageUrl = (publicUrl) => {
  try {
    const url = new URL(publicUrl);
    const parts = url.pathname.split("/storage/v1/object/public/")[1]?.split("/");
    if (!parts || parts.length < 2) throw new Error("Invalid storage URL");
    const bucket = parts[0];
    const path   = parts.slice(1).join("/");
    return { bucket, path };
  } catch {
    // Fallback: treat entire path after last known bucket name
    if (publicUrl.includes(AUDIO_BUCKET)) {
      return { bucket: AUDIO_BUCKET, path: publicUrl.split(`${AUDIO_BUCKET}/`)[1] };
    }
    if (publicUrl.includes(INVOICE_BUCKET)) {
      return { bucket: INVOICE_BUCKET, path: publicUrl.split(`${INVOICE_BUCKET}/`)[1] };
    }
    throw new Error(`Cannot parse storage URL: ${publicUrl}`);
  }
};

/**
 * Delete a file from Supabase Storage
 */
export const deleteFile = async (path, bucket = AUDIO_BUCKET) => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    logger.error(`Storage delete error (${bucket}/${path}): ${error.message}`);
    throw new Error(error.message);
  }
  logger.info(`✅ Deleted from Supabase Storage: ${bucket}/${path}`);
};
