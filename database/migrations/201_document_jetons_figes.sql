/*
  201_document_jetons_figes.sql

  LES DONNÉES D'UN DOCUMENT, FIGÉES À SON ÉMISSION (demandé le 2026-10-04, « URGENT »).

  POURQUOI. Un document se rend À CHAQUE ouverture depuis son modèle et les données vivantes du
  dossier. Un devis émis en mai, rouvert dans les archives en octobre, se redatait donc d'octobre
  ({Date}/{Today}, « Date du jour », résolu par `new Date()`), et aurait suivi tout changement de
  prix, d'adresse ou de dates survenu depuis. Une pièce ÉMISE ne doit plus bouger : c'est une offre,
  un engagement — elle vaut par ce qu'elle disait LE JOUR OÙ ON L'A ENVOYÉE.

  La date, elle, est déjà figée sans cette colonne : `loadContext` lit `sent_at` (à défaut
  `signed_at`) et la passe au rendu (`ctx.figeLe`, tokens.js). Cette colonne fige TOUT LE RESTE.

    · jetons_figes : les données de fusion du document (organisme, stagiaire, entreprise, formations,
      champs du dossier, financeur, date d'émission) en JSON, CHIFFRÉ au repos (AES-256-GCM, la clé
      du n° de sécurité sociale) comme `saisies` et la signature voisines — ce sont des noms, des
      adresses, des montants. Cristallisé à la PREMIÈRE lecture après l'émission (envoi ou
      signature), puis servi tel quel.

  CE QUI N'EST PAS FIGÉ, et reste donc vivant : les SIGNATURES (elles se complètent après l'envoi),
  la date de signature, les ZONES à remplir (`saisies`), les réponses de consentement (déjà figées à
  la signature, migration 130/185), et le cachet apposé par l'organisme. Les résultats d'examen /
  jury restent vivants aussi (ils sont finalisés et portent les signatures des membres).

  NULLE PAR DÉFAUT : aucun document existant n'est encore figé. Un document DÉJÀ émis avant cette
  migration garde sa date figée (via `sent_at`) mais ses autres données restent vivantes jusqu'à ce
  qu'il soit cristallisé à sa prochaine lecture (ou jamais, s'il n'est plus ouvert) — sans que rien
  ne casse.

  LE CODE MARCHE AVANT ET APRÈS. Sans la colonne, la lecture du figé est ignorée (ER_BAD_FIELD_ERROR)
  et la cristallisation ne s'écrit pas : le document se rend depuis les données vivantes, comme
  avant, avec seulement la date figée. Avec la colonne, il se fige à la première ouverture après
  l'émission.

  Vérification par l'API, sans SQL : ouvrir deux fois un devis ENVOYÉ en changeant une donnée du
  dossier entre les deux (p. ex. l'adresse du stagiaire) — le PDF ne bouge pas. Ou une requête, qui
  doit rendre 1 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='generated_document' AND column_name='jetons_figes';
*/

ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS jetons_figes longtext DEFAULT NULL;
