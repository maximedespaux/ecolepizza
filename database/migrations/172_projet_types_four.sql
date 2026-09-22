/* 172_projet_types_four.sql
   LE TYPE DE FOUR — bois, électrique, gaz — sous la case « Four » de « Votre projet ».

   Demandé le 2026-09-22. La case « Four » disait qu'un stagiaire veut s'équiper d'un four, pas
   duquel. Or c'est la première question d'un fabricant de fours : le type part désormais aux
   partenaires (« four (bois, gaz) » au lieu de « four ») et sert de condition de document
   (learner.project_oven_wood et ses deux voisines).

   TROIS CASES, CHACUNE SA COLONNE, comme les six du projet — TINYINT(1) NOT NULL DEFAULT 0. C'est
   la forme que lisent les conditions de documents : une colonne booléenne devient une condition
   cochable sans rien écrire de plus. Bois ET gaz cochés ensemble disent un four mixte. Les fiches
   existantes prennent 0, ce qui est juste : personne n'a pu cocher une case qui n'existait pas.

   LE CODE MARCHE AVANT ET APRÈS. La liste blanche d'écriture est filtrée sur les colonnes que la
   table porte, et les deux SELECT de l'export des partenaires passent par colonneOuNull. Sans la
   migration, les types ne s'enregistrent pas — et le formulaire le DIT (« sauf le type de four,
   la migration 172 n'est pas jouée »).

   Rejouable sans risque (ADD COLUMN IF NOT EXISTS).
   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes : le client SQL de l'organisme découpe
   sur ce caractère (cf. la 146). */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS project_oven_wood TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : four a bois. Cf. migration 172.',
    ADD COLUMN IF NOT EXISTS project_oven_electric TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : four electrique. Cf. migration 172.',
    ADD COLUMN IF NOT EXISTS project_oven_gas TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Projet : four a gaz. Cf. migration 172.';
