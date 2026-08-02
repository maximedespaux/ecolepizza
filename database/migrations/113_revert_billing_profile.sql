/* 113_revert_billing_profile.sql
   Retour arriere de 113.

   ATTENTION : apres ce retrait, les factures repartent toutes sous l'identite de l'organisme.
   Les factures deja emises sous une autre entite GARDENT leur numero et leur identite imprimee
   (le PDF est fige), mais le lien vers l'entite est perdu et le XML reprendrait l'organisme si on
   les reeditait. Les entites emettrices et leurs compteurs sont DETRUITS.

   A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE invoice
    DROP FOREIGN KEY IF EXISTS fk_invoice_billing;

ALTER TABLE invoice
    DROP COLUMN IF EXISTS billing_profile_id;

DROP TABLE IF EXISTS billing_profile;
