-- 084_company_user.sql
-- Compte de connexion du REPRÉSENTANT d'une entreprise : lien vers le user (rôle
-- REPRESENTANT) qui pourra signer lui-même les documents de niveau entreprise.
ALTER TABLE company
    ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT NULL AFTER organization_id;
