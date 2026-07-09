-- 045_revert_esignature_pades.sql
-- ROLLBACK MANUEL de 045_esignature_pades.sql — à jouer À LA MAIN uniquement si vous
-- abandonnez la signature PAdES / la traçabilité. NE PAS l'inclure dans la séquence
-- automatique des migrations (sinon elle annulerait aussitôt 045).
-- ⚠ Supprime définitivement le certificat de scellement et les données de traçabilité
--   (IP, appareil, empreintes) des documents et émargements déjà signés.

ALTER TABLE organization
    DROP COLUMN IF EXISTS sign_cert;

ALTER TABLE generated_document
    DROP COLUMN IF EXISTS signer_ip,
    DROP COLUMN IF EXISTS signer_user_agent,
    DROP COLUMN IF EXISTS signed_hash;

ALTER TABLE attendance_record
    DROP COLUMN IF EXISTS signer_ip,
    DROP COLUMN IF EXISTS signer_user_agent;
