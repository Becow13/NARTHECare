-- 0003_care_recipient_profile_fields.sql
--
-- Add the small set of caregiver-editable profile fields needed by
-- the web Care Recipient profile screen. Every column is nullable
-- and PHI-shaped — the UI renders "Not provided" for NULLs so we do
-- not store placeholder strings.
--
-- Idempotent on purpose: every migration in this directory must be
-- safe to run on every boot. `ADD COLUMN IF NOT EXISTS` handles the
-- replay case.

ALTER TABLE care_recipients
  ADD COLUMN IF NOT EXISTS relationship TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
