-- Profile photo shown in the sidebar and settings. Unlike the signature stamp,
-- an avatar is not forgery-sensitive material, so it is stored as a plain
-- base64 data URL (downscaled to ~256px client-side, a few KB).
ALTER TABLE professional_profiles ADD COLUMN avatar_png TEXT;
