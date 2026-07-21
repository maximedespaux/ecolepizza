/* 112_revert_material_sale_company.sql
   Retour arriere de 112.

   ATTENTION : apres ce retrait, une vente en caisse ne pourra plus etre rattachee a une
   entreprise cote comptabilite. Les rattachements deja saisis sont DETRUITS. La facture, elle,
   garde son invoice.company_id (colonne de base) : c'est la comptabilite analytique par
   entreprise qui se perd, pas la facturation.

   A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE material_sale
    DROP FOREIGN KEY IF EXISTS fk_sale_company;

ALTER TABLE material_sale
    DROP COLUMN IF EXISTS company_id;
