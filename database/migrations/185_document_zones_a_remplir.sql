/*
  185_document_zones_a_remplir.sql

  LES ZONES À REMPLIR PAR LE STAGIAIRE, et leurs réponses (demandé le 2026-09-28).

  POURQUOI. L'attestation sur l'honneur d'expérience professionnelle porte des pointillés que le
  stagiaire doit remplir lui-même — « Entreprise / structure : ……… », « Fonction exercée : ……… »,
  « Période d'exercice : du ……… au ……… » — parce que l'école ne connaît pas ces informations et ne
  les stocke nulle part. En ligne, personne ne pouvait les remplir : l'attestation se signait avec
  ses blancs, et ne prouvait rien.

  Une ZONE est désormais une puce du modèle (`saisie:<type>:<identifiant>`, bouton « Zone à remplir »
  de l'éditeur ; règles dans src/api/lib/zonesARemplir.js). Décidé par l'école le 2026-09-28 : le
  stagiaire la remplit depuis son espace, ou le bureau pour lui ; TOUTES les zones sont obligatoires
  avant de signer ; signé, le document fige ses réponses. Cette colonne les porte :
    · saisies : les réponses du document, en JSON ({ "saisie:texte:entreprise": "…", … }),
      CHIFFRÉ au repos (AES-256-GCM, la clé du n° de sécurité sociale) comme la signature voisine —
      c'est le parcours professionnel de quelqu'un.

  NULLE PAR DÉFAUT : aucun document existant n'a de réponse, et aucun modèle n'a encore de zone.

  LE CODE MARCHE AVANT ET APRÈS. Sans la colonne, les zones s'impriment en pointillés comme avant,
  l'écran ne propose pas de les remplir (il le dit), l'enregistrement répond « migration 185 non
  jouée » (503), et la signature n'est pas bloquée — elle ne pourrait pas l'être sans issue.

  Vérification par l'API, sans SQL : ouvrir un document dont le modèle porte une zone —
  GET /api/documents/:id rend `zones_a_remplir` et `zones_indisponibles: false`. Ou une requête,
  qui doit rendre 1 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='generated_document' AND column_name='saisies';
*/

ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS saisies longtext DEFAULT NULL;
