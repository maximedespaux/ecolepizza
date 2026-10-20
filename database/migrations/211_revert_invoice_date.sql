/* 211_revert_invoice_date.sql
   Retour arrière de 211 : les dates de facture choisies sont PERDUES ; {Date facture} et la liste
   des factures retombent sur `created_at` (la date de création en base), comme avant. */

ALTER TABLE invoice DROP COLUMN IF EXISTS invoice_date;
