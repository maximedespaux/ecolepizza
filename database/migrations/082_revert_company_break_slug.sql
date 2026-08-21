-- 082_revert_company_break_slug.sql — ROLLBACK MANUEL.
ALTER TABLE training_program DROP COLUMN IF EXISTS company_break_slug;
