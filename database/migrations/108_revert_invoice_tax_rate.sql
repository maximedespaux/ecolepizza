/* 108_revert_invoice_tax_rate.sql
   Retour arrière de 108.

   ATTENTION, CELUI-CI N'EST PAS ANODIN. Retirer ces colonnes fait repasser toutes les
   factures à 20 % en dur : une facture émise à 5,5 % se rééditerait à 20 %, avec un total
   différent de celui envoyé au client. Le PDF déjà transmis, lui, ne change pas — c'est donc
   une divergence entre la pièce envoyée et la pièce régénérée.

   À ne jouer que si la 108 vient d'être passée et qu'aucune facture n'a été émise depuis.
   Au-delà, préférer corriger le code plutôt que de retirer la donnée. */

ALTER TABLE invoice
    DROP COLUMN IF EXISTS tax_rate;

ALTER TABLE invoice_line
    DROP COLUMN IF EXISTS tax_rate;
