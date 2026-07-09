-- 049_revert_org_signature.sql — ROLLBACK MANUEL de 049_org_signature.sql.
ALTER TABLE generated_document
    DROP COLUMN IF EXISTS org_signed_at,
    DROP COLUMN IF EXISTS org_signer_name,
    DROP COLUMN IF EXISTS org_signature_data;
