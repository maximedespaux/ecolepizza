/*
  197 — LA SIGNATURE DES E-MAILS (demandée le 2026-10-01).

  POURQUOI. Tous les e-mails de l'école (identifiants, réinitialisation, alertes, notifications,
  message à un groupe, règles programmées) partageaient un pied de page minimal : nom, e-mail,
  téléphone, adresse en texte. L'école veut une vraie signature de marque — son logo, « Administration »,
  ses coordonnées, ses réseaux, et ses labels qualité (Qualiopi / ICPF / cofrac) — au bas de CHAQUE
  e-mail, qu'elle compose et fait évoluer (ajouter / retirer une image) elle-même.

  CE QU'ON STOCKE. Une seule colonne JSON sur `organization`, à l'image de `logo_image` (déjà une
  data URL en base) : les champs modifiables (sous-titre, site, réseaux, texte des labels) ET les
  images de la signature (logo propre + badges) en data URL PNG. Pas de table à part : ces images
  sont peu nombreuses, propres à l'organisme, et lues avec le reste du contexte (orgContext) — pas à
  chaque envoi.

  LE CODE MARCHE AVANT ET APRÈS. Sans la colonne, orgContext ne charge pas la signature (requête
  isolée, ER_BAD_FIELD_ERROR avalé) : les e-mails gardent leur pied de page actuel, et l'écran de
  réglage répond « migration 197 non jouée ». Jouée, la signature paraît dès qu'elle est enregistrée.

  VÉRIFICATION (par l'API, sans SQL) : enregistrer une signature dans Mailing → Signature répond 200
  (et non 503), puis GET /api/mailing/signature la rend. Ou une requête, qui doit rendre 1 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='organization' AND column_name='email_signature';

  REVERT : efface la signature (la colonne), et les e-mails reviennent au pied de page texte.
*/
ALTER TABLE organization ADD COLUMN IF NOT EXISTS email_signature longtext DEFAULT NULL;
