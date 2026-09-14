/*
 * REVERT de la 148 — retire l évaluation pratique.
 *
 * ⚠️ LES NOTES SONT PERDUES. Ce ne sont pas des données de configuration mais des résultats
 * d examen, saisis par un formateur devant son groupe : ils ne se reconstituent pas. À ne
 * jouer que si la fonctionnalité n a jamais servi.
 *
 * L ordre suit les clés étrangères : les notes avant les exercices, les exercices avant la
 * grille.
 */

DROP TABLE IF EXISTS evaluation_note;
DROP TABLE IF EXISTS evaluation_exercice;
DROP TABLE IF EXISTS evaluation_grille;
