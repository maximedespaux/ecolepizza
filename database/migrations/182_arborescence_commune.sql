/*
  182_arborescence_commune.sql

  L'ARBORESCENCE D'ARCHIVAGE, UNE FOIS POUR TOUTES LES FORMATIONS (demandé le 2026-09-24).

  POURQUOI. L'arborescence vivait sur chaque formation (training_program.archive_tree, 053 ;
  company_archive_tree, 083) : il fallait la recomposer à la main dix fois, alors que les trois
  formations déjà réglées (RS7404, NIV1, NIV1H) avaient EXACTEMENT le même squelette —
  {Année}/{Semaine}/{Code}/{Stagiaire}, et un sous-dossier « Évaluations ». Seuls les documents
  différaient, et un document qu'une formation n'a pas n'a pas à y figurer : il est simplement
  sauté à l'export. Une arborescence par organisme suffit donc, et elle se range là où vivent
  déjà les réglages communs de l'organisme (emargement_config, logo, signature).

  DEUX COLONNES, comme sur la formation : l'arborescence des dossiers STAGIAIRE et celle des
  dossiers arrivés par une ENTREPRISE. NULLES par défaut : tant que l'école n'a rien enregistré,
  l'export suit l'arborescence de chaque formation (celles de 053 et 083, qu'on ne touche pas),
  puis la structure standard.

  LE CODE MARCHE AVANT ET APRÈS : sans la migration, l'éditeur commun le dit (« migration 182
  non jouée »), l'enregistrement répond 503, et l'export continue de suivre l'arborescence de
  chaque formation.

  Vérification par l'API, sans SQL : enregistrer l'arborescence commune (Formations →
  Arborescence d'archivage), puis GET /api/formations/arborescence rend `disponible: true` et
  l'arbre enregistré. Ou une requête, qui doit rendre 2 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='organization' AND column_name IN ('archive_tree','company_archive_tree');
*/

ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS archive_tree         longtext DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS company_archive_tree longtext DEFAULT NULL;
