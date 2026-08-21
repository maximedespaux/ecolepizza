-- ============================================================================
--  Migration 003 — Acheteur libre + description sur les factures
--  Permet de facturer une vente de matériel à une personne (stagiaire ou
--  client comptoir) avec le détail des produits.
--    mysql -u root -p gds_doc_gestionary < database/migrations/003_invoice_buyer.sql
-- ============================================================================

ALTER TABLE invoice
  ADD COLUMN buyer_name  varchar(255) DEFAULT NULL AFTER company_id,
  ADD COLUMN description varchar(255) DEFAULT NULL AFTER buyer_name;
