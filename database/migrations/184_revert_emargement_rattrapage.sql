/*
  184_revert_emargement_rattrapage.sql

  CE QUI SE PERD : le MOTIF et l'AUTEUR de chaque rattrapage. La présence, elle, reste : une
  demi-journée rattrapée avec la signature du stagiaire garde sa signature ; une présence
  attestée sans signature reste « présente » en base, mais sa case redeviendra vide sur les
  feuilles régénérées — sans rien pour dire pourquoi elle compte.

  Les feuilles déjà générées en PDF et les documents d'émargement déjà signés gardent le motif
  qu'ils portaient : ils sont figés.

  Après ce revert, le rattrapage répond de nouveau « Migration 184 non jouée » (503), et la
  fenêtre de signature du stagiaire continue de s'appliquer.
*/

ALTER TABLE attendance_record
    DROP COLUMN IF EXISTS rattrapage_motif,
    DROP COLUMN IF EXISTS rattrapage_par,
    DROP COLUMN IF EXISTS rattrapage_le;
