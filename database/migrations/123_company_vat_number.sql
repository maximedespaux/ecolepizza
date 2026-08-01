/* 123_company_vat_number.sql
   Le numero de TVA intracommunautaire de l'ENTREPRISE cliente.

   POURQUOI. L'organisme a le sien depuis longtemps (organization.vat_number, active par defaut
   dans les Champs documents). L'entreprise CLIENTE, elle, n'avait que son SIRET : impossible de
   faire figurer son numero de TVA sur une facture, alors que c'est une mention attendue des
   qu'on facture une societe — et obligatoire des que l'operation est intracommunautaire.
   Il fallait le taper a la main dans le libelle, ou l'omettre.

   La colonne devient automatiquement un jeton `field:company.vat_number` : le catalogue des
   Champs documents est construit par INTROSPECTION des colonnes reelles (cf. lib/conditions.js),
   il n'y a donc rien a declarer de plus pour qu'il soit insérable dans un modele.

   NULL = non renseigne. Pas de contrainte de format : les numeros europeens varient (FR + 11,
   BE + 10, DE + 9…), et refuser une saisie parce qu'elle ne ressemble pas au format francais
   bloquerait une facture a un client etranger. La longueur couvre le plus long format en vigueur.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE company
    ADD COLUMN IF NOT EXISTS vat_number varchar(20) DEFAULT NULL
    COMMENT 'Numero de TVA intracommunautaire du client. NULL = non renseigne.';
