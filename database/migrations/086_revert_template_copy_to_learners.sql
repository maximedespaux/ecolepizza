-- 086_revert_template_copy_to_learners.sql — ROLLBACK MANUEL.
ALTER TABLE document_template DROP COLUMN IF EXISTS copy_to_learners;
