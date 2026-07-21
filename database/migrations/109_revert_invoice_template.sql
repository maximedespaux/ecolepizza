/* 109_revert_invoice_template.sql
   Retour arrière de 109.

   ATTENTION : après ce retrait, PLUS AUCUNE facture PDF ne pourra être produite. La mise en
   page interne a été supprimée du code — c'était le but de la 109 — et sans la colonne, le
   réglage qui désigne le modèle n'a plus où vivre.

   À ne jouer que si l'on revient aussi sur le code (le commit « Facture : plus de mise en page
   interne »). Le modèle de document lui-même, s'il a été créé, reste dans Modèles : seule
   l'association « ce modèle est ma facture » disparaît. */

ALTER TABLE shop_settings
    DROP COLUMN IF EXISTS invoice_template_slug;
