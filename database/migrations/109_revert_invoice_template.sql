/* 109_revert_invoice_template.sql
   Retour arrière de 109.

   ATTENTION : après ce retrait, plus aucune facture PDF ne pourra être produite. La mise en
   page interne a été supprimée du code, et sans cette colonne le modèle ne peut plus être
   désigné.

   À ne jouer que si l'on revient aussi sur le code. Le modèle de document lui-même reste dans
   Modèles : seule l'association « ce modèle est ma facture » disparaît. */

ALTER TABLE shop_settings
    DROP COLUMN IF EXISTS invoice_template_slug;
