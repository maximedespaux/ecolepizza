/* 210_revert_compta_entite.sql
   Retour arrière de 210.

   ATTENTION : les rattachements d'écritures aux entités sont PERDUS (les ventes, produits divers,
   dépenses et apports restent, mais « non rattachés ») ; la Comptabilité revient à un total unique,
   toutes entités confondues. Les factures gardent le leur (invoice.billing_profile_id, migration 113).
   À ne jouer que si l'on revient aussi sur le code.

   `DROP FOREIGN KEY IF EXISTS` d'abord, par PRUDENCE : les premières versions de la 210 posaient une
   FK (retirée depuis). Si une a été créée au passage, il faut la retirer avant la colonne, sinon
   `DROP COLUMN` buterait dessus. Sans FK, ces lignes n'émettent qu'un avertissement bénin. */

ALTER TABLE material_sale DROP FOREIGN KEY IF EXISTS fk_material_sale_billing;
ALTER TABLE material_sale DROP COLUMN IF EXISTS billing_profile_id;

ALTER TABLE revenue_extra DROP FOREIGN KEY IF EXISTS fk_revenue_extra_billing;
ALTER TABLE revenue_extra DROP COLUMN IF EXISTS billing_profile_id;

ALTER TABLE expense DROP FOREIGN KEY IF EXISTS fk_expense_billing;
ALTER TABLE expense DROP COLUMN IF EXISTS billing_profile_id;

ALTER TABLE partner_contribution DROP FOREIGN KEY IF EXISTS fk_pcontrib_billing;
ALTER TABLE partner_contribution DROP COLUMN IF EXISTS billing_profile_id;
