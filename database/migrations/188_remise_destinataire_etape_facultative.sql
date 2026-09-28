/*
  188_remise_destinataire_etape_facultative.sql

  DEUX RÉGLAGES DEMANDÉS LE 2026-09-28, dans Modèles de documents et dans le parcours.

  1. À QUI UN DOCUMENT EST REMIS. Un « document remis » (migration 160) allait toujours au
     STAGIAIRE, qui en accusait réception depuis son espace. Or certains s'adressent à son
     EMPLOYEUR — une attestation pour l'OPCO, un document de prise en charge. Décidé par l'école le
     même jour : chaque type choisit son destinataire, le stagiaire ou l'entreprise ; « entreprise »
     le fait paraître dans l'espace entreprise, et c'est l'entreprise qui en accuse réception. Un
     stagiaire inscrit SANS entreprise, ou dont l'entreprise n'a PAS D'ESPACE (aucun compte de
     représentant, company.user_id vide), le reçoit dans son propre espace : personne d'autre ne
     pourrait en accuser réception, et l'étape resterait bloquée.
       · remise_type.destinataire : 'STAGIAIRE' (défaut, le comportement d'avant) ou 'ENTREPRISE'.

  2. UNE ÉTAPE FACULTATIVE. Chaque étape du parcours documentaire d'une formation (document, QCM,
     pièce à fournir, remise) peut être marquée facultative. Décidé le même jour : elle reste
     visible et faisable, mais ne compte pas dans l'avancement du dossier, n'est jamais « l'étape
     en cours » et ne bloque aucun point d'accès à l'émargement.
       · program_step.facultatif : 0 (défaut, l'étape compte) ou 1.
     PAR FORMATION, comme l'ordre et l'inclusion : une même étape peut être due dans une formation
     et facultative dans une autre.

  VALEURS PAR DÉFAUT = LE COMPORTEMENT D'AVANT : rien ne change tant qu'on ne coche rien.

  LE CODE MARCHE AVANT ET APRÈS. Sans la colonne `destinataire`, tout va au stagiaire, et choisir
  l'entreprise répond « migration 188 non jouée » (503) au lieu d'être ignoré. Sans `facultatif`,
  toutes les étapes comptent, et l'enregistrement du parcours le dit s'il a dû l'écarter.

  ⚠ LA PRÉSENCE DES CLÉS NE PROUVE RIEN : sans les colonnes, le code rend `destinataire: 'STAGIAIRE'`
  et `facultatif: 0`, les clés existent dans les deux cas. Vérification par l'API, sans SQL, sur une
  VALEUR : enregistrer un type de remise « L'entreprise » (sans la migration : 503), puis GET
  /api/remises rend `destinataire: "ENTREPRISE"` ; ou cocher « Facultatif » sur une étape, enregistrer
  (sans la migration : l'avertissement le dit), puis GET /api/formations/:id/steps rend
  `facultatif: true` sur cette étape. Ou une requête, qui doit rendre 2 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND ((table_name='remise_type' AND column_name='destinataire')
       OR (table_name='program_step' AND column_name='facultatif'));
*/

ALTER TABLE remise_type
    ADD COLUMN IF NOT EXISTS destinataire varchar(12) NOT NULL DEFAULT 'STAGIAIRE';

ALTER TABLE program_step
    ADD COLUMN IF NOT EXISTS facultatif tinyint(1) NOT NULL DEFAULT 0;
