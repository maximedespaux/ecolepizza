-- 076_revert_template_emargement_break.sql — ROLLBACK MANUEL.
ALTER TABLE document_template DROP COLUMN IF EXISTS emargement_break;
