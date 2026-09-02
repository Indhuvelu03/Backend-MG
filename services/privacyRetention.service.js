import { supabase } from "../config/supabase.js";
import * as storageService from "./storage.service.js";
import { logger } from "../utils/logger.js";

const purgeReferences = async (table, urlColumn) => {
  const { data, error } = await supabase
    .from(table)
    .select(`id,${urlColumn}`)
    .not(urlColumn, "is", null)
    .lt("retention_until", new Date().toISOString())
    .limit(100);
  if (error) throw new Error(error.message);

  for (const record of data || []) {
    try {
      const { bucket, path } = storageService.parseStorageUrl(record[urlColumn]);
      await storageService.deleteFile(path, bucket);
      await supabase.from(table).update({ [urlColumn]: null }).eq("id", record.id);
      logger.info(`Privacy retention removed expired ${table} file for ${record.id}`);
    } catch (error) {
      logger.warn(`Privacy retention could not remove ${table}/${record.id}: ${error.message}`);
    }
  }
};

export const purgeExpiredPrivateFiles = async () => {
  await purgeReferences("complaints", "audio_url");
  await purgeReferences("invoices", "file_url");
};

export const startPrivacyRetentionScheduler = () => {
  const run = () => purgeExpiredPrivateFiles().catch(error => logger.error(`Privacy retention job failed: ${error.message}`));
  const firstRun = setTimeout(run, 60_000);
  const interval = setInterval(run, 24 * 60 * 60 * 1000);
  firstRun.unref?.();
  interval.unref?.();
};
