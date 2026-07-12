-- 065_revert_template_layout.sql — ROLLBACK MANUEL.
ALTER TABLE document_template DROP COLUMN IF EXISTS layout;
