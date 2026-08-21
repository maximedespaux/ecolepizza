-- 052_revert_program_step_or_group.sql — ROLLBACK MANUEL.
ALTER TABLE program_step DROP COLUMN IF EXISTS or_group;
