-- 055_revert_program_needs_emargement.sql — ROLLBACK MANUEL.
ALTER TABLE training_program DROP COLUMN IF EXISTS needs_emargement;
