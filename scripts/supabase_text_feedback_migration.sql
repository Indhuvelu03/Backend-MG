-- Run once in Supabase SQL Editor for existing projects.
-- Written feedback is stored in the existing transcript column; audio is optional.
ALTER TABLE complaints ALTER COLUMN audio_url DROP NOT NULL;
