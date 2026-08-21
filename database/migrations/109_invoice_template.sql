/* 109_invoice_template.sql
   Le modèle de document qui sert de facture.

   POURQUOI CE RÉGLAGE EXISTE, alors qu'une version précédente s'en passait. On avait d'abord
   retenu que la facture serait produite par LE modèle de type FACTURE, trouvé par son type, en
   départageant les éventuelles variantes par leurs conditions (`applies_when`) — comme les
   variantes de devis particulier / entreprise / RS7404.

   Ça ne tient pas dès qu'un organisme a plusieurs modèles de type FACTURE qui ne se
   distinguent PAS par une condition : une facture de formation et une facture de boutique, par
   exemple, s'adressent au même client dans le même cas de figure. Le choix serait alors
   implicite, décidé par un `sort_order` que personne ne pense à regarder — et une facture
   partirait avec la mauvaise présentation sans que rien ne le signale.

   Le choix redevient donc EXPLICITE. C'est le genre de décision qu'il vaut mieux écrire que
   déduire.

   SUR shop_settings, la table des réglages de facturation : elle porte déjà le préfixe de
   numérotation, les moyens de paiement et l'assujettissement à la TVA.

   NULL = aucune facture PDF ne sera produite, avec un message qui dit où créer et désigner le
   modèle. Ce n'est pas un repli : la mise en page interne a été retirée du code. Même règle
   que pour les documents de dossier — une pièce dont le contenu n'est fixé nulle part n'a pas
   à être émise.

   Le modèle désigné doit être de type FACTURE. Vérifié à l'enregistrement du réglage ET au
   moment de produire le PDF : un modèle peut changer de type après avoir été choisi.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE shop_settings
    ADD COLUMN IF NOT EXISTS invoice_template_slug varchar(80) DEFAULT NULL
    COMMENT 'Slug du modele de document (type FACTURE) servant de facture. NULL = aucune facture PDF.';
