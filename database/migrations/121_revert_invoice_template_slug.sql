/* 121_revert_invoice_template_slug.sql
   Retour arriere de 121 : le modele fige a la vente est DETRUIT ; le rendu retombe sur la
   selection automatique. A ne jouer qu'en revenant aussi sur le code. */

ALTER TABLE invoice
    DROP COLUMN IF EXISTS template_slug;
