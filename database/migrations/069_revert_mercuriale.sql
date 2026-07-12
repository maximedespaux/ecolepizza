-- ============================================================================
--  Revert 069 — supprime les tables de la mercuriale.
--    mysql -u root -p gds_doc_gestionary < database/migrations/069_revert_mercuriale.sql
-- ============================================================================

DROP TABLE IF EXISTS mercuriale_price;
DROP TABLE IF EXISTS mercuriale_item;
DROP TABLE IF EXISTS mercuriale_store;
