-- 049_org_signature.sql
-- Signature de l'ORGANISME sur un document : appliquée automatiquement (image de
-- signature enregistrée) au moment de l'envoi, avant la signature du stagiaire.
ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS org_signed_at     datetime     DEFAULT NULL,   -- horodatage de la signature organisme
    ADD COLUMN IF NOT EXISTS org_signer_name   varchar(255) DEFAULT NULL,   -- nom de l'organisme signataire
    ADD COLUMN IF NOT EXISTS org_signature_data longtext    DEFAULT NULL;   -- image de signature (data URL, chiffrée au repos)
