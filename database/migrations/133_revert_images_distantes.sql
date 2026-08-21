/* 133_revert_images_distantes.sql
   RETIRE LES DEUX COLONNES D'IMAGE.

   LES ADRESSES SAISIES SONT PERDUES, et c'est le seul point d'attention : `DROP COLUMN` efface les
   liens collés un par un sur chaque fiche. Rejouer la 133 ensuite rendra les colonnes vides, et
   il faudra tout recoller.

   Le code marche sans elles — les écrans masquent le champ quand la colonne est absente, plutôt
   que d'afficher une commande qui ne s'enregistrerait pas. `partner_product.image_url` n'est pas
   concernée : elle vient de la 095 et reste en place. */

ALTER TABLE partner
    DROP COLUMN IF EXISTS logo_url;

ALTER TABLE inventory_item
    DROP COLUMN IF EXISTS image_url;
