/*
  184_emargement_rattrapage.sql

  LE RATTRAPAGE D'UNE DEMI-JOURNÉE D'ÉMARGEMENT, par l'école, avec son motif (décidé le 2026-09-26).

  POURQUOI. Le stagiaire ne signe plus que PENDANT la demi-journée : de son heure de début (les
  horaires de la formation ; 8 h 30 et 13 h 30 à défaut) jusqu'à minuit le même jour. Avant,
  seules les dates futures étaient refusées ; relevé sur les deux sessions du 14/09, les
  stagiaires signaient le matin ET l'après-midi dès leur arrivée — sept après-midi signés avant
  d'avoir eu lieu —, et quinze signatures sur cinquante portaient sur la veille. Une feuille
  d'émargement ne prouve la présence que signée pendant la demi-journée.

  Une demi-journée manquée se RATTRAPE donc par le personnel (POST /attendance/record/:id/rattrapage),
  et l'école a posé une condition : le MOTIF s'imprime dans la case, avec le nom de qui l'a
  enregistrée. Ces trois colonnes le portent :
    · rattrapage_motif : le motif (« Oubli de signature », « Sans téléphone »…), 120 caractères au
      plus — il doit tenir dans une case de 15 mm ;
    · rattrapage_par   : le nom du membre du personnel, FIGÉ comme il s'imprime (un compte
      supprimé plus tard ne vide pas la case) ; le journal d'audit garde, lui, l'identifiant ;
    · rattrapage_le    : quand il a été enregistré.

  NULLES PAR DÉFAUT : toutes les présences existantes sont des signatures du stagiaire.

  LE CODE MARCHE AVANT ET APRÈS : les lectures passent par une cascade sur ER_BAD_FIELD_ERROR
  (lib/emargement, attendance.controller, espace.controller). Sans la migration, la fenêtre de
  signature s'applique déjà, mais le rattrapage répond « Migration 184 non jouée » (503) : une
  demi-journée manquée ne peut pas encore être enregistrée.

  Vérification par l'API, sans SQL : rattraper une demi-journée depuis Sessions → Émargement, puis
  GET /api/attendance/:sessionId — la présence porte rattrapage_motif et rattrapage_par.
  Ou une requête, qui doit rendre 3 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='attendance_record' AND column_name IN ('rattrapage_motif','rattrapage_par','rattrapage_le');
*/

ALTER TABLE attendance_record
    ADD COLUMN IF NOT EXISTS rattrapage_motif varchar(120) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rattrapage_par   varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS rattrapage_le    datetime     DEFAULT NULL;
