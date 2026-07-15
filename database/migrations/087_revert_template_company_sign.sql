-- 087_revert_template_company_sign.sql — ROLLBACK MANUEL.
ALTER TABLE document_template DROP COLUMN IF EXISTS company_sign;
