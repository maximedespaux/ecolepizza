/* 111_revert_invoice_buyer_identity.sql
   Retour arriere de 111.

   ATTENTION : apres ce retrait, les factures de vente repartent sans BT-49 (adresse
   electronique de l'acheteur) et seront rejetees a la validation francaise. Le code sait s'en
   passer — il retombe sur le nom libre, comme avant — mais la conformite, elle, est perdue.

   Les valeurs deja saisies sont DETRUITES : la contrainte tombe, puis les colonnes. Rien ne
   permettra de les retrouver. A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE invoice
    DROP FOREIGN KEY IF EXISTS fk_invoice_learner;

ALTER TABLE invoice
    DROP COLUMN IF EXISTS learner_id,
    DROP COLUMN IF EXISTS buyer_email;
