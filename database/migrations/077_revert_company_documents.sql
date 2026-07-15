-- 077_revert_company_documents.sql — ROLLBACK MANUEL.
ALTER TABLE document_template DROP COLUMN IF EXISTS company_level;
ALTER TABLE generated_document
    DROP COLUMN IF EXISTS scope,
    DROP COLUMN IF EXISTS company_id,
    DROP COLUMN IF EXISTS session_id;
