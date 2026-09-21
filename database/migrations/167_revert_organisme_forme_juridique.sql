/* 167_revert_organisme_forme_juridique.sql
   RETIRE la colonne `legal_status` de l'organisme. La forme juridique choisie dans Paramètres est
   perdue, et le jeton {Forme juridique organisme} ressort vide hors facture, comme avant la 167.
   Le code d'avant comme celui d'après fonctionnent sans elle.

   LA VILLE N'EST PAS REMISE en minuscules, et c'est voulu : sa casse d'origine n'est conservée
   nulle part, et le code d'avant lit parfaitement une ville en capitales (même raisonnement que
   le revert de la 162). */

ALTER TABLE organization
    DROP COLUMN IF EXISTS legal_status;
