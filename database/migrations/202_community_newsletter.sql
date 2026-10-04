/*
  202 — LA NEWSLETTER : trace de l'envoi d'une annonce de la Communauté par e-mail.

  POURQUOI CETTE COLONNE. Quand le bureau publie une ANNONCE dans la Communauté, il peut désormais
  cocher « Envoyer aussi en newsletter » : l'annonce part alors par e-mail à tous les stagiaires de
  l'école (ceux qui ne se sont pas désinscrits). On garde la DATE de cet envoi sur l'annonce
  elle-même, pour deux raisons :
    - l'afficher (« Newsletter envoyée le 04/10 ») — une annonce muette ne dit pas si elle est partie ;
    - empêcher un second envoi si un jour on ajoute un bouton « renvoyer » (le marqueur est le garde-fou).

  CE N'EST QU'UNE TRACE. Le consentement (opt-out) vit dans `consent_record` (finalité 'newsletter',
  migration 130, déjà jouée) ; le lien de désinscription est signé (JWT), rien à stocker pour lui.
  Donc AUCUNE donnée ne dépend de cette colonne : sans elle, l'envoi marche quand même — le code
  écrit la date dans un try/catch (ER_BAD_FIELD_ERROR avalé) et relit la liste en cascade. Le code
  marche donc AVANT comme APRÈS la migration.

  Rejouable sans risque (ADD COLUMN IF NOT EXISTS).
*/

ALTER TABLE community_post
    ADD COLUMN IF NOT EXISTS newsletter_envoye_le DATETIME NULL AFTER pinned;
