/* 123_revert_company_vat_number.sql
   Retour arriere de 123. Les numeros de TVA saisis sur les fiches entreprise sont DETRUITS,
   sans recours : ils n'existent nulle part ailleurs.

   Un modele qui utilise le jeton `field:company.vat_number` le verra disparaitre du catalogue et
   sortira la valeur vide. A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE company
    DROP COLUMN IF EXISTS vat_number;
