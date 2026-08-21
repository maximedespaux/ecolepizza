/* 118_invoice_line_reference.sql
   La reference produit sur la ligne de facture.

   POURQUOI. Une facture de boutique gagne a montrer la REFERENCE de l'article (le SKU : P0008,
   AC-STF10…) a cote de sa designation, comme sur une facture de fournisseur. L'article la porte
   deja (inventory_item.sku) ; la ligne de facture, elle, ne gardait que le libelle. On la fige
   sur la ligne AU MOMENT de la vente : le SKU peut changer plus tard, la facture emise doit
   garder celui d'alors.

   NULL = ligne sans reference (formation, ancien article sans SKU). La colonne est optionnelle
   partout : sans cette migration, la facture sort comme avant, sans colonne Reference.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE invoice_line
    ADD COLUMN IF NOT EXISTS reference varchar(60) DEFAULT NULL
    COMMENT 'Reference/SKU de l article, figee a la vente. NULL = pas de reference.';
