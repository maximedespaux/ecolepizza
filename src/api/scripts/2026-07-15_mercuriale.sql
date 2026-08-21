-- Migration : enrichit la table « mercuriale_item » existante (liste de prix curée).
-- La table existait déjà (colonnes produit/marque/rayon/unite/prix_kg/notes, org-scoped, vide) :
-- on la réutilise et on ajoute les colonnes du modèle prototype (source, origine, user_id…).
-- Additif / non destructif. À APPLIQUER sur la base distante.

ALTER TABLE mercuriale_item
  ADD COLUMN user_id            CHAR(36) NULL AFTER organization_id,
  ADD COLUMN origin             VARCHAR(120) NULL AFTER marque,
  ADD COLUMN calibre            VARCHAR(60)  NULL AFTER conditionnement,
  ADD COLUMN market             VARCHAR(120) NULL AFTER unite,
  ADD COLUMN source             ENUM('RNM','METRO','FOURNISSEUR','MANUEL') NOT NULL DEFAULT 'MANUEL' AFTER prix_kg,
  ADD COLUMN auto_update        TINYINT(1)   NOT NULL DEFAULT 0 AFTER source,
  ADD COLUMN catalog_product_id CHAR(36)     NULL AFTER auto_update,
  ADD INDEX idx_merc_user (user_id);

-- Correspondance colonnes ↔ modèle : produit=libellé · marque=marque · rayon=famille ·
-- unite=unité · prix_kg=prix €/unité · conditionnement · notes=usage.

-- ----------------------------------------------------------------------------
-- REVERT :
-- ALTER TABLE mercuriale_item
--   DROP COLUMN user_id, DROP COLUMN origin, DROP COLUMN calibre, DROP COLUMN market,
--   DROP COLUMN source, DROP COLUMN auto_update, DROP COLUMN catalog_product_id,
--   DROP INDEX idx_merc_user;
