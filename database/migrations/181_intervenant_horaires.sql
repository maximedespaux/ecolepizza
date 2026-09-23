/*
  181_intervenant_horaires.sql

  LES HEURES D'UN INTERVENANT EXTERNE, demi-journée par demi-journée (demandé le 2026-09-23).

  POURQUOI. Une demi-journée cochée disait QU'IL est venu, jamais QUAND. Or un intervenant
  externe ne suit pas les horaires de la formation : l'expert hygiène passe de 10 h à 12 h 30
  un mardi matin, le jury siège de 14 h à 16 h. La feuille d'émargement imprimait donc sa
  signature dans une case muette, sous une ligne « Horaires » qui annonce les heures des
  STAGIAIRES. Un contrôle qui vérifie le temps facturé par l'intervenant n'avait rien à lire.

  DEUX COLONNES, NULLES PAR DÉFAUT, et c'est volontaire : les demi-journées déjà cochées
  restent valides et sans heures. La feuille n'imprime alors rien de plus qu'avant pour elles
  (pas de « 00h00 - 00h00 » inventé), et l'école les complète quand elle veut.

  LE CODE MARCHE AVANT ET APRÈS : lecture et écriture passent par une cascade sur
  ER_BAD_FIELD_ERROR (cf. intervenant.controller et lib/emargement). Sans la migration, cocher
  une demi-journée marche comme avant et l'écran dit que les heures ne s'enregistrent pas.

  Vérification par l'API, sans SQL : saisir une heure sur une demi-journée, puis
  GET /api/sessions/:id/intervenants rend la ligne avec ses clés debut et fin remplies.
*/

ALTER TABLE session_intervenant_slot
    ADD COLUMN IF NOT EXISTS heure_debut time DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS heure_fin   time DEFAULT NULL;
