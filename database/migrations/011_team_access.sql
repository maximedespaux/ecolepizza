-- 011_team_access.sql
-- Gestion de l'équipe (comptes ayant accès au panneau de l'organisme) :
-- possibilité de désactiver un accès sans supprimer le compte + trace de la
-- dernière connexion. Idempotent grâce à IF NOT EXISTS (MariaDB 10.2+).

ALTER TABLE user
    ADD COLUMN IF NOT EXISTS active tinyint(1) NOT NULL DEFAULT 1 AFTER phone,
    ADD COLUMN IF NOT EXISTS last_login_at timestamp NULL DEFAULT NULL AFTER active;
