-- 023_org_code.sql
-- Code court et unique par organisme, saisi à la connexion pour distinguer les
-- locataires (multi-tenant). Permet à une même adresse e-mail d'exister dans
-- plusieurs organismes (cf. migration 024).
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS code varchar(24) DEFAULT NULL AFTER short_name;

ALTER TABLE organization
    ADD UNIQUE KEY IF NOT EXISTS uq_org_code (code);
