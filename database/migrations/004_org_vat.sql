-- ============================================================================
--  Migration 004 — N° de TVA intracommunautaire de l'organisme
--  Utilisé comme identifiant TVA vendeur (BT-31) dans Factur-X.
--  Optionnel : sans lui, Factur-X utilise le SIRET comme identifiant fiscal (BT-32).
--    mysql -u root -p gds_doc_gestionary < database/migrations/004_org_vat.sql
-- ============================================================================

ALTER TABLE organization
  ADD COLUMN vat_number varchar(30) DEFAULT NULL AFTER siret;
