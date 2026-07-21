/* 109_invoice_template.sql
   Le modèle de document qui sert de facture.

   CE QUE FAIT CETTE MIGRATION : elle ajoute une colonne à shop_settings, la table des réglages
   de facturation (elle porte déjà le préfixe de numérotation, les mentions légales et
   l'assujettissement à la TVA). Cette colonne dit « c'est ce modèle-là, ma facture ».

   POURQUOI. La mise en page de la facture était écrite dans le code, posée au pixel avec
   pdf-lib : aucun organisme ne pouvait y mettre son logo, ses conditions de règlement, sa
   présentation. L'application sait pourtant faire exactement cela — ce sont les Modèles de
   documents, avec leurs jetons. Il ne manquait qu'un endroit pour désigner le bon.

   NULL = AUCUNE FACTURE PDF NE SERA PRODUITE. Ce n'est pas un repli, c'est un refus explicite,
   avec un message qui dit où créer le modèle. Même règle que pour les documents de dossier :
   une pièce dont le contenu n'est fixé nulle part n'a pas à être émise. La mise en page interne
   a été retirée du code, pas seulement débranchée — un gabarit de secours qui traîne finit
   toujours par resservir.

   Le modèle désigné doit être de type FACTURE. La vérification est faite à l'enregistrement du
   réglage ET au moment de produire le PDF : un modèle peut changer de type après avoir été
   choisi.

   CE QUE LE MODÈLE NE DÉCIDE PAS : le XML Factur-X reste produit par le code, et attaché au
   PDF. Il est normé (EN 16931) — sa structure n'est pas une question de mise en page, et la
   laisser configurer produirait des factures non conformes. Le modèle décide de ce que le
   client LIT, le code de ce que sa comptabilité IMPORTE.

   À FAIRE APRÈS AVOIR JOUÉ CETTE MIGRATION : créer un modèle de type FACTURE dans Modèles de
   documents, puis le désigner dans Ventes & Inventaire → Réglages de facturation. Sans cela,
   le téléchargement d'une facture renverra une erreur explicite.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE shop_settings
    ADD COLUMN IF NOT EXISTS invoice_template_slug varchar(80) DEFAULT NULL
    COMMENT 'Slug du modele de document (type FACTURE) servant de facture. NULL = aucune facture PDF.';
