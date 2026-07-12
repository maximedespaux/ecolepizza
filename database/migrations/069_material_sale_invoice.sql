-- 069_material_sale_invoice.sql
-- Lien vente ↔ facture : chaque ligne de vente (material_sale) créée à la caisse
-- référence la facture générée. Permet de REGROUPER l'historique des ventes par
-- facture et de rouvrir le détail / le PDF de chaque facture.
ALTER TABLE material_sale
    ADD COLUMN IF NOT EXISTS invoice_id     CHAR(36)    NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(60) NULL DEFAULT NULL;

ALTER TABLE material_sale
    ADD INDEX IF NOT EXISTS idx_material_sale_invoice (invoice_id);
