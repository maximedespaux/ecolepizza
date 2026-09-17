/* 162_villes_capitales.sql
   LA VILLE EN CAPITALES — reprise des fiches stagiaire et entreprise DÉJÀ en base.

   Demandé par l'école le 2026-09-17. Le code met désormais la ville en capitales à chaque
   écriture (src/api/lib/saisie.js), mais il ne touche une fiche qu'au moment où on l'enregistre :
   sans cette reprise, les villes déjà saisies garderaient leur casse d'origine jusqu'à ce que
   quelqu'un rouvre chaque fiche une à une.

   CE QUE ÇA CHANGE, relevé en production le 2026-09-17 par l'API (organisme de l'école) :
   7 stagiaires sur 990 ayant une ville, et 1 entreprise sur 2, n'étaient pas en capitales. Trois
   villes s'écrivaient de deux façons — 670 villes distinctes, 667 une fois en capitales — et
   comptaient donc double partout où l'on regroupe par ville.

   ⚠ LE PIÈGE, ET POURQUOI LA COMPARAISON SE FAIT SUR LES OCTETS. Les tables sont en
   `utf8mb4_general_ci`, INSENSIBLE à la casse : « Tarbes » <> « TARBES » y vaut FAUX. Un simple
   `WHERE town <> UPPER(town)` ne sélectionnerait AUCUNE ligne — la migration passerait sans
   erreur et sans rien faire, et l'on croirait la reprise faite. `CAST(… AS BINARY)` compare les
   octets, où les deux casses diffèrent bien.

   `UPPER()` conserve les accents (« Lézignan » → « LÉZIGNAN »), comme `toLocaleUpperCase('fr')`
   côté application.

   Rejouable sans risque : une ville déjà en capitales n'est plus sélectionnée. Les villes des
   organismes, des partenaires, des OPCO et des lieux de formation ne sont PAS concernées — la
   demande portait sur les stagiaires et les entreprises. */

UPDATE learner
   SET town = UPPER(TRIM(town))
 WHERE town IS NOT NULL
   AND CAST(town AS BINARY) <> CAST(UPPER(TRIM(town)) AS BINARY);

UPDATE company
   SET town = UPPER(TRIM(town))
 WHERE town IS NOT NULL
   AND CAST(town AS BINARY) <> CAST(UPPER(TRIM(town)) AS BINARY);
