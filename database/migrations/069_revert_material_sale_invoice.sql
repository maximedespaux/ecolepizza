-- 069_revert_material_sale_invoice.sql — ROLLBACK MANUEL.
ALTER TABLE material_sale DROP INDEX IF EXISTS idx_material_sale_invoice;
ALTER TABLE material_sale
    DROP COLUMN IF EXISTS invoice_id,
    DROP COLUMN IF EXISTS invoice_number;
