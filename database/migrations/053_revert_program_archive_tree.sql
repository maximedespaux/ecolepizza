-- 053_revert_program_archive_tree.sql — ROLLBACK MANUEL.
ALTER TABLE training_program DROP COLUMN IF EXISTS archive_tree;
