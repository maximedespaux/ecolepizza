-- ============================================================================
--  Migration 002 — TVA sur les articles d'inventaire
--  unit_price = prix HT ; tax_rate = taux de TVA (%) ; TTC = HT * (1 + taux/100)
--    mysql -u root -p gds_doc_gestionary < database/migrations/002_inventory_tax.sql
-- ============================================================================

ALTER TABLE inventory_item
  ADD COLUMN tax_rate decimal(5,2) NOT NULL DEFAULT 20.00 AFTER unit_price;
