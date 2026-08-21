-- 036_access_profile_system_role.sql
-- Permet d'enregistrer une PERSONNALISATION d'un rôle système (couleur + accès par
-- défaut) par organisme : une ligne access_profile avec system_role = code du rôle.
ALTER TABLE access_profile
    ADD COLUMN IF NOT EXISTS system_role varchar(30) DEFAULT NULL AFTER name;

ALTER TABLE access_profile
    ADD UNIQUE KEY IF NOT EXISTS uq_ap_sys (organization_id, system_role);
