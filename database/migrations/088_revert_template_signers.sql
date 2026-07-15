-- 088_revert_template_signers.sql — ROLLBACK MANUEL.
ALTER TABLE document_template DROP COLUMN IF EXISTS signers;
