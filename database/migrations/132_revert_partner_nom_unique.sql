/* 132_revert_partner_nom_unique.sql
   RETIRE LA CONTRAINTE D'UNICITÉ SUR LE NOM D'UN PARTENAIRE.

   Sans effet sur les données : aucune ligne n'est touchée, et le contrôle applicatif de
   `createPartner` continue de refuser un homonyme. On retombe simplement sur l'état d'avant — un
   doublon redevient possible par import ou par insertion directe, c'est-à-dire par les deux
   chemins qui contournent le contrôle applicatif, et donc exactement ceux par lesquels le doublon
   « Berkel » était arrivé.

   `IF EXISTS` pour rester rejouable sur une base qui n'a jamais reçu la 132. */

ALTER TABLE partner
    DROP INDEX IF EXISTS uq_partner_nom;
