-- Safe to run repeatedly in the Supabase SQL Editor.
-- Stores both the spoken-language transcript and its English translation.
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS english_transcript TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS transcript_flagged BOOLEAN NOT NULL DEFAULT false;

-- Existing records may have only a single transcript. Preserve it as the
-- English field only when no separate translation has been recorded yet.
UPDATE complaints
SET english_transcript = transcript
WHERE english_transcript IS NULL
  AND transcript IS NOT NULL;
