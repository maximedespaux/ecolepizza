-- 095_revert_partner_product.sql
-- Annule 095_partner_product.sql.
-- ⚠️ Détruit le catalogue vitrine des partenaires (produits, tarifs négociés, notes).
-- Ne touche PAS à `partner` ni à `inventory_item` : le stock de l'école est ailleurs.
DROP TABLE IF EXISTS partner_product;
