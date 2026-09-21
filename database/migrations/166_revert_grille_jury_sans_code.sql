/* 166_revert_grille_jury_sans_code.sql
   REMET la puce {Code} juste après l'intitulé {Formation}, dans le modèle `grille-jury`.

   C'est la position exacte d'où la 166 l'a retirée : le modèle livré les écrivait côte à côte,
   séparés d'une espace. On la repose sous sa forme d'origine (libellé « Code formation »).

   SANS BARRE OBLIQUE INVERSE, pour la raison écrite dans la 166 — d'où la position calculée
   (REGEXP_INSTR + longueur de la puce trouvée) plutôt qu'un remplacement avec renvoi, qui en
   exigerait une. Les positions sont comptées en CARACTÈRES par les trois fonctions, ce qui les
   rend cohérentes entre elles sur un texte accentué.

   Ne fait rien si le modèle porte déjà {Code}, ou s'il n'a plus de {Formation} où la raccrocher. */

UPDATE document_template
   SET body_html = INSERT(
         body_html,
         REGEXP_INSTR(body_html, '<span[^>]*data-token="Formation"[^>]*>[^<]*</span>')
           + CHAR_LENGTH(REGEXP_SUBSTR(body_html, '<span[^>]*data-token="Formation"[^>]*>[^<]*</span>')),
         0,
         ' <span class="doc-token" contenteditable="false" data-token="Code" data-label="Code formation">Code formation</span>')
 WHERE slug = 'grille-jury'
   AND body_html LIKE '%data-token="Formation"%'
   AND body_html NOT LIKE '%data-token="Code"%';
