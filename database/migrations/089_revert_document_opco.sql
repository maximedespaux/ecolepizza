-- 089_revert_document_opco.sql — ROLLBACK MANUEL.
ALTER TABLE generated_document DROP COLUMN IF EXISTS opco;
