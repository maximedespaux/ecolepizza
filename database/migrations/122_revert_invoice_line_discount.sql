/* 122_revert_invoice_line_discount.sql
   Retour arriere de 122. Le taux de remise et le prix brut figes sur chaque ligne sont DETRUITS ;
   le libelle et les montants nets restent, donc les factures gardent leurs totaux — seule la
   colonne « Remise » des modeles retombe sur « — ».

   L'information est PERDUE sans recours : elle n'existe nulle part ailleurs (c'est precisement
   la raison d'etre de 122). A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE invoice_line
    DROP COLUMN IF EXISTS discount_pct;

ALTER TABLE invoice_line
    DROP COLUMN IF EXISTS unit_price_gross_ht;
