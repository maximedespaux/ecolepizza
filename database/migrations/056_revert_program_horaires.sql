-- 056_revert_program_horaires.sql — ROLLBACK MANUEL.
ALTER TABLE training_program DROP COLUMN IF EXISTS horaires;
