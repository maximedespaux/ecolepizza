-- 083_revert_company_archive_tree.sql — ROLLBACK MANUEL.
ALTER TABLE training_program DROP COLUMN IF EXISTS company_archive_tree;
