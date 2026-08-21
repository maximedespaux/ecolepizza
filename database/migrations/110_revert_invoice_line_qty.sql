/* 110_revert_invoice_line_qty.sql
   Retour arrière de 110.

   Les factures perdent le détail quantité / prix unitaire : un modèle qui présente ces
   colonnes les affichera vides. Les montants de ligne, eux, ne bougent pas — ils vivent dans
   `amount_net`, que cette migration n'a pas touché. Aucune facture ne change de total. */

ALTER TABLE invoice_line
    DROP COLUMN IF EXISTS qty;

ALTER TABLE invoice_line
    DROP COLUMN IF EXISTS unit_price_ht;
