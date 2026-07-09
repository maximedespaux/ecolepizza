-- 051_user_signature.sql
-- Signature enregistrée d'un utilisateur (surtout les intervenants « société » qui
-- signent avec un cachet/image plutôt qu'un tracé). Chiffrée au repos par l'appli.
ALTER TABLE user
    ADD COLUMN IF NOT EXISTS signature_image longtext DEFAULT NULL;
