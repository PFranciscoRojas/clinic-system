ALTER TABLE professional_profiles
    ADD COLUMN IF NOT EXISTS ai_prefs JSONB NOT NULL DEFAULT '{"note_style":"structured","tone":"formal"}'::jsonb;
