/* 116_revert_invoice_payment_split.sql
   Retour arriere de 116.

   Apres ce retrait, une facture ne garde plus que son moyen de paiement principal
   (payment_method) ; le detail de la ventilation est DETRUIT. Le montant total, lui, est
   intact — il n'a jamais dependu de la ventilation. A ne jouer que si l'on revient aussi sur le
   code. */

ALTER TABLE invoice
    DROP COLUMN IF EXISTS payment_split;
