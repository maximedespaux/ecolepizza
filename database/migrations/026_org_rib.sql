-- 026_org_rib.sql
-- Coordonnées bancaires (RIB) de l'organisme : utilisées sur les devis, conventions
-- et factures (jetons {IBAN}, {BIC}, {Banque}).
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS iban      varchar(34)  DEFAULT NULL AFTER email,
    ADD COLUMN IF NOT EXISTS bic       varchar(11)  DEFAULT NULL AFTER iban,
    ADD COLUMN IF NOT EXISTS bank_name varchar(120) DEFAULT NULL AFTER bic;
