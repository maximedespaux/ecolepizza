/* 118_revert_invoice_line_reference.sql
   Retour arriere de 118. La reference figee sur chaque ligne est DETRUITE ; le libelle et les
   montants restent. A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE invoice_line
    DROP COLUMN IF EXISTS reference;
