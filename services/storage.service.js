// services/storage.service.js — Supabase Storage (replaces AWS S3)
import { supabase } from "../config/supabase.js";
import { logger } from "../utils/logger.js";

const AUDIO_BUCKET   = "audio-complaints";
const INVOICE_BUCKET = "invoice-pdfs";
const readyBuckets = new Set();
const PRIVATE_URL_TTL_SECONDS = 10 * 60;

// Render deployments and fresh Supabase projects may not have the Storage
// buckets created yet. The backend uses the service-role key, so it can safely
// provision its own application buckets before the first upload.
const ensureBucket = async (bucket) => {
  if (readyBuckets.has(bucket)) return;

  const { data: existing, error: lookupError } = await supabase.storage.getBucket(bucket);
  if (existing) {
    if (existing.public) {
      const { error: privacyError } = await supabase.storage.updateBucket(bucket, { public: false });
      if (privacyError) throw new Error(`Could not make Storage bucket private: ${privacyError.message}`);
      logger.info(`🔒 Supabase Storage bucket made private: ${bucket}`);
    }
    readyBuckets.add(bucket);
    return;
  }

  // A missing bucket returns an error from getBucket; only creation is relevant
  // here. Any creation error is reported clearly to the upload caller.
  const { error: createError } = await supabase.storage.createBucket(bucket, { public: false });
  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    const reason = createError.message || lookupError?.message || "Unknown Storage error";
    logger.error(`Storage bucket setup error (${bucket}): ${reason}`);
    throw new Error(`Storage bucket \"${bucket}\" is unavailable: ${reason}`);
  }

  readyBuckets.add(bucket);
  logger.info(`✅ Supabase Storage bucket ready: ${bucket}`);
};

/**
 * Upload a file buffer to Supabase Storage
 * Returns a private, non-routable storage reference. Signed URLs are generated
 * only after the caller has passed authentication or tracking-token checks.
 */
export const uploadFile = async (buffer, path, contentType, bucket = AUDIO_BUCKET) => {
  await ensureBucket(bucket);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) {
    logger.error(`Storage upload error (${bucket}/${path}): ${error.message}`);
    throw new Error(error.message);
  }

  logger.info(`✅ Uploaded to Supabase Storage: ${bucket}/${path}`);
  return `storage://${bucket}/${path}`;
};

export const createSignedUrl = async (reference, expiresIn = PRIVATE_URL_TTL_SECONDS) => {
  if (!reference) return null;
  const { bucket, path } = parseStorageUrl(reference);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create secure file URL");
  return data.signedUrl;
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
  if (publicUrl?.startsWith("storage://")) {
    const [bucket, ...pathParts] = publicUrl.slice("storage://".length).split("/");
    if (!bucket || !pathParts.length) throw new Error("Invalid private storage reference");
    return { bucket, path: pathParts.join("/") };
  }
  try {
    const url = new URL(publicUrl);
    const objectPath = url.pathname.split(/\/storage\/v1\/object\/(?:public|sign|authenticated)\//)[1];
    const parts = objectPath?.split("/");
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
