-- 039_drop_password_plain.sql
-- Sécurité : suppression du stockage RÉVERSIBLE du mot de passe (password_plain_enc).
-- Les mots de passe ne sont plus conservés en clair/déchiffrables ; le mot de passe
-- généré n'est affiché qu'une seule fois à la création / réinitialisation.
ALTER TABLE user
    DROP COLUMN IF EXISTS password_plain_enc;
