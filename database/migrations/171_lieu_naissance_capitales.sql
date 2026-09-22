/* 171_lieu_naissance_capitales.sql
   LE LIEU DE NAISSANCE EN CAPITALES — reprise des fiches stagiaire DÉJÀ en base.

   Demandé par l'école le 2026-09-22, « comme la ville ». Le code met désormais le lieu de
   naissance en capitales à chaque écriture, par la fiche tenue par l'école comme par l'espace du
   stagiaire (src/api/lib/saisie.js, CAPITALES_STAGIAIRE). Mais il ne touche une fiche qu'au moment
   où on l'enregistre : sans cette reprise, les lieux déjà saisis garderaient leur casse d'origine
   jusqu'à ce que quelqu'un rouvre chaque fiche une à une.

   ⚠ MÊME PIÈGE QUE LA 162, MÊME PARADE. Les tables sont en utf8mb4_general_ci, INSENSIBLE à la
   casse : « Tarbes » <> « TARBES » y vaut FAUX. Un simple WHERE birth_place <> UPPER(birth_place)
   ne sélectionnerait AUCUNE ligne — la migration passerait sans erreur et sans rien faire, et l'on
   croirait la reprise faite. CAST(… AS BINARY) compare les octets, où les deux casses diffèrent.

   UPPER() conserve les accents (« Béziers » devient « BÉZIERS »), comme toLocaleUpperCase('fr')
   côté application.

   Rejouable sans risque : un lieu déjà en capitales n'est plus sélectionné.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes : le client SQL de l'organisme découpe
   sur ce caractère (cf. la 146). */

UPDATE learner
   SET birth_place = UPPER(TRIM(birth_place))
 WHERE birth_place IS NOT NULL
   AND CAST(birth_place AS BINARY) <> CAST(UPPER(TRIM(birth_place)) AS BINARY);
