-- 045_esignature_pades.sql
-- Signature électronique : cachet PAdES de l'organisme + traçabilité des signatures.

-- Certificat de scellement de l'organisme (PKCS#12 chiffré au repos, base64).
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS sign_cert longtext DEFAULT NULL;

-- Traçabilité de la signature d'un document (preuve : qui / quand / d'où / quoi).
ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS signer_ip varchar(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS signer_user_agent varchar(400) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS signed_hash char(64) DEFAULT NULL; -- SHA-256 du contenu signé

-- Traçabilité de la signature d'émargement.
ALTER TABLE attendance_record
    ADD COLUMN IF NOT EXISTS signer_ip varchar(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS signer_user_agent varchar(400) DEFAULT NULL;
