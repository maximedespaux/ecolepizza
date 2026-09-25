/* 183_jeton_acompte.sql
   L'ACOMPTE REVIENT DANS LE DEVIS, LA CONVENTION ET LE CONTRAT.

   Relevé le 2026-09-26 par l'API, en passant tous les modèles de production au crible de leurs
   jetons : quatre modèles — « devis-particulier », « devis-professionnel-copie », « convention » et
   « contrat » — portent une puce {custom:Acomtpe}. Le jeton personnalisé de l'organisme s'appelle
   « Acompte » : sa clé, d'abord saisie « Acomtpe », a été corrigée dans la fenêtre des jetons
   personnalisés, et rien n'a suivi dans les modèles. Une puce dont la clé ne désigne plus rien
   s'imprime VIDE, sans la moindre erreur : ces quatre documents annoncent « votre règlement de  € »
   et « un paiement de  € ».

   CE QUE FAIT LA MIGRATION : elle fait pointer ces puces vers le jeton qui existe, dans le corps,
   l'en-tête et le pied des modèles. La puce garde son libellé (« Acompte de la formation (30%) »,
   le même des deux côtés). La forme en texte ({custom:Acomtpe}, avec ou sans calcul après une barre
   verticale) est traitée aussi, par principe ; aucun modèle de production ne l'emploie.

   CE QU'ELLE NE TOUCHE PAS : un organisme qui aurait encore un jeton « Acomtpe », ou qui n'aurait
   pas de jeton « Acompte » vers lequel pointer. Les deux sous-requêtes le garantissent.

   LE CODE L'EMPÊCHE DÉSORMAIS : la clé d'un jeton déjà enregistré ne se modifie plus, et le
   serveur refuse de retirer une clé qu'un modèle emploie encore (template.controller.js,
   saveCustomTokens). L'éditeur, lui, montre barrée et nomme toute puce qui ne désigne plus rien.

   LES DOCUMENTS DÉJÀ PRODUITS : un document non signé se rend depuis le modèle, il retrouve son
   acompte dès cette migration. Un document SIGNÉ garde son PDF figé — sans l'acompte ; c'est voulu,
   on ne réécrit pas ce qui a été signé.

   AUCUN POINT-VIRGULE NI BARRE OBLIQUE INVERSE dans les chaînes (cf. la 146 et la 166).
   Rejouable sans risque : une fois les puces repointées, plus rien ne correspond.
   Se vérifie dans l'éditeur (Modèles → Convention) : la puce « Acompte de la formation (30%) »
   n'est plus barrée, et l'aperçu PDF imprime le montant. Ou une requête, qui doit rendre 0 :
   SELECT COUNT(*) FROM document_template WHERE CONCAT_WS(' ', body_html, header_html, footer_html) LIKE '%custom:Acomtpe%' */

UPDATE document_template
   SET body_html   = REPLACE(REPLACE(body_html,   'data-token="custom:Acomtpe"', 'data-token="custom:Acompte"'), '{custom:Acomtpe', '{custom:Acompte'),
       header_html = REPLACE(REPLACE(header_html, 'data-token="custom:Acomtpe"', 'data-token="custom:Acompte"'), '{custom:Acomtpe', '{custom:Acompte'),
       footer_html = REPLACE(REPLACE(footer_html, 'data-token="custom:Acomtpe"', 'data-token="custom:Acompte"'), '{custom:Acomtpe', '{custom:Acompte')
 WHERE CONCAT_WS(' ', body_html, header_html, footer_html) LIKE '%custom:Acomtpe%'
   AND organization_id IN (SELECT organization_id FROM custom_token WHERE token_key = 'Acompte')
   AND organization_id NOT IN (SELECT organization_id FROM custom_token WHERE token_key = 'Acomtpe');
