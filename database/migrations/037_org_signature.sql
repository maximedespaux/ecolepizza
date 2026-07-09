-- 037_org_signature.sql
-- Signature de l'organisme (image, data URL) : insérée automatiquement sur les
-- documents via le jeton {Signature organisme}.
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS signature_image longtext DEFAULT NULL;
