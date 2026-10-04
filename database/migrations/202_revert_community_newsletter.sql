/*
  REVERT 202 — retire la trace d'envoi de newsletter.

  ⚠️ Ne supprime QUE la date affichée sur l'annonce. Les e-mails déjà partis sont partis ; les
  désinscriptions (consent_record finalité 'newsletter') restent — elles ne vivent pas ici. Après
  revert, le code retombe sur son repli (il relit les annonces sans cette colonne, et n'affiche plus
  « Newsletter envoyée le… »). Sans risque (DROP COLUMN IF EXISTS).
*/

ALTER TABLE community_post
    DROP COLUMN IF EXISTS newsletter_envoye_le;
