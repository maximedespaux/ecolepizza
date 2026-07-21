/* 109_invoice_template.sql
   Le modèle de document qui sert de facture.

   POURQUOI. La mise en page de la facture était écrite dans lib/facturx.js : un en-tête, un
   tableau, trois totaux, posés au pixel avec pdf-lib. Aucun organisme ne pouvait la changer —
   ni y mettre son logo, ses mentions, ses conditions de règlement, sa présentation.

   Or l'application sait déjà faire ça : c'est exactement ce que sont les Modèles de documents,
   avec leurs jetons. Il ne manquait qu'un endroit pour dire « celui-ci est ma facture ».

   SUR shop_settings, qui porte déjà le préfixe de numérotation, les mentions légales et
   l'assujettissement à la TVA : c'est la table des réglages de facturation. En créer une autre
   à côté aurait éparpillé le même sujet sur deux écrans.

   NULL = mise en page interne, celle d'aujourd'hui. C'est le comportement par défaut et il le
   reste : un organisme qui ne configure rien ne voit aucun changement. La facture n'est pas un
   écran où l'on impose une nouveauté.

   CE QUE LE MODÈLE NE DÉCIDE PAS : le XML Factur-X reste produit par le code, et attaché au
   PDF quel que soit le modèle. Il est normé (EN 16931) — sa structure n'est pas une question
   de mise en page, et la laisser configurer produirait des factures non conformes.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE shop_settings
    ADD COLUMN IF NOT EXISTS invoice_template_slug varchar(80) DEFAULT NULL
    COMMENT 'Slug du modele de document servant de facture. NULL = mise en page interne.';
