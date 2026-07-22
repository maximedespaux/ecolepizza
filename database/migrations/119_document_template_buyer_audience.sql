/* 119_document_template_buyer_audience.sql
   Le DESTINATAIRE d'un modele de facture : particulier (stagiaire) ou entreprise.

   POURQUOI. Une facture adressee a une ENTREPRISE n'a pas la meme forme qu'une facture a un
   PARTICULIER : SIRET de l'acheteur, representant, mentions OPCO d'un cote ; rien de tout cela
   de l'autre. Le vendeur veut donc pouvoir tenir DEUX modeles de type FACTURE et laisser l'appli
   choisir le bon selon qui achete, sans clic. C'est ce que porte cette colonne.

   Valeurs : 'individual' (particulier / stagiaire), 'company' (entreprise). NULL = 'tous' :
   le modele convient aux deux (comportement d'avant cette migration). Le moteur (buildInvoicePdf)
   prend le modele dont le destinataire correspond a l'acheteur ; a defaut, un modele 'tous' ;
   a defaut, l'unique modele FACTURE. Aucune facture ne se retrouve donc sans modele.

   La colonne est OPTIONNELLE partout : sans cette migration, la selection retombe sur l'unique
   modele FACTURE, exactement comme avant. Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS buyer_audience varchar(20) DEFAULT NULL
    COMMENT 'Destinataire du modele de facture : individual | company. NULL = tous.';
