/* 109_revert_invoice_template.sql
   Retour arrière de 109.

   Sans risque : la facture repasse à sa mise en page interne, celle qui servait avant. Les
   factures déjà émises ne sont pas concernées — leur PDF a été transmis, et le modèle n'est
   consulté qu'au moment de produire un nouveau PDF.

   Le modèle de document lui-même, s'il a été créé, reste dans Modèles : seule l'association
   « ce modèle est ma facture » disparaît. */

ALTER TABLE shop_settings
    DROP COLUMN IF EXISTS invoice_template_slug;
