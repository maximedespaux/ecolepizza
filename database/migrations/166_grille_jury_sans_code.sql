/* 166_grille_jury_sans_code.sql
   LA GRILLE DU JURY N'IMPRIME PLUS LE CODE DE LA FORMATION APRÈS SON INTITULÉ.

   Vu le 2026-09-21 en rendant le vrai modèle « Grille d'évaluation du jury » : son en-tête
   affichait « Fabriquer des pizzas artisanales RS7404 RS7404 ». Le modèle posé par l'application
   écrivait {Formation} puis {Code}, et l'intitulé de la formation de l'école contient déjà son
   code. Demandé par l'organisme le même jour : retirer {Code} du modèle.

   POURQUOI UNE MIGRATION. Le modèle livré (src/api/lib/modelesJury.js) est corrigé aussi, mais il
   ne sert qu'à POSER un modèle absent — il n'écrase jamais celui de l'organisme. Le modèle qui
   s'imprime vit en base, et c'est lui qu'il faut corriger.

   CE QUI EST TOUCHÉ, ET RIEN D'AUTRE : le modèle `grille-jury`, et dans son corps la puce {Code}
   avec l'espace qui la précède. Le motif ne dépend ni de l'ordre des attributs ni du libellé de
   la puce : l'éditeur a pu la réenregistrer depuis sa pose. Il ne touche pas {Code RNCP} (la
   clé est comparée guillemets compris).

   AUCUNE BARRE OBLIQUE INVERSE dans le motif (`[[:space:]]` et non l'abréviation habituelle) :
   selon le mode SQL du serveur, le client l'interprète ou la transmet, et un motif qui change de
   sens selon un réglage ne se relit pas. Et AUCUN POINT-VIRGULE dans les chaînes : c'est un
   découpage sur ce caractère qui a fait refuser la 146 par le client SQL de l'organisme.

   LES DOCUMENTS DÉJÀ PRODUITS : une grille non signée se rend depuis le modèle, elle perd le code
   doublé dès cette migration. Une grille SIGNÉE garde son PDF figé : elle ne bouge pas, et c'est
   voulu — on ne réécrit pas ce qui a été signé.

   Rejouable sans risque : sans puce {Code}, le modèle n'est plus sélectionné.
   Se vérifie à l'aperçu du modèle (Modèles → Grille d'évaluation du jury) : plus de code après
   l'intitulé. */

UPDATE document_template
   SET body_html = REGEXP_REPLACE(body_html, '[[:space:]]*<span[^>]*data-token="Code"[^>]*>[^<]*</span>', '')
 WHERE slug = 'grille-jury'
   AND body_html LIKE '%data-token="Code"%';
