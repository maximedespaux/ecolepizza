-- 097_revert_partner_product_specs_prix.sql
-- Annule la 097. La table part AVANT la colonne : rien ne les lie, mais on garde l'ordre
-- inverse de la création par principe.
DROP TABLE IF EXISTS partner_product_price;
ALTER TABLE partner_product DROP COLUMN specs;
