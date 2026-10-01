/*
  198 — PLUSIEURS FORMATIONS POUR UN ENVOI PROGRAMMÉ (demandé le 2026-10-01).

  POURQUOI. Une règle d'envoi ne filtrait que sur UNE formation (`mail_regle.program_id`, NULL =
  toutes). L'école veut « Toutes / une / plusieurs » : le même suivi à froid pour RS7404 ET NIV1,
  sans écrire deux règles jumelles qui finiraient par diverger.

  CE QU'ON STOCKE. Une table d'association `mail_regle_formation` (regle_id, program_id), comme
  `mail_regle_doc` : clé primaire sur le couple (pas de doublon), et les deux liens en cascade — une
  règle supprimée emporte ses lignes, une formation supprimée aussi.

  LE CODE MARCHE AVANT ET APRÈS. Sans la table, le serveur retombe sur `mail_regle.program_id`
  (comportement d'avant) ; l'écran ne propose alors qu'UNE formation et le dit. Avec la table, elle
  fait autorité quand elle porte des lignes ; vide = toutes les formations. `program_id` reste
  rempli quand UNE SEULE formation est choisie — ainsi un revert de la 198 garde ces règles-là sur
  leur formation (une règle à plusieurs formations, elle, redevient « toutes » : perte assumée).

  VÉRIFICATION (par l'API, sans SQL) : enregistrer une règle sur DEUX formations répond 200, puis
  GET /api/mailing/regles rend `program_ids` à deux éléments sur cette règle. Ou une requête, qui
  doit rendre 1 :
  SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='mail_regle_formation';

  REVERT : supprime la table — les règles à UNE formation la gardent (via program_id), celles à
  plusieurs redeviennent « toutes formations ».

  Collation alignée sur mail_regle / training_program (utf8mb4) pour que les clés étrangères passent.
*/
CREATE TABLE IF NOT EXISTS mail_regle_formation (
    regle_id    uuid NOT NULL,
    program_id  uuid NOT NULL,
    PRIMARY KEY (regle_id, program_id),
    CONSTRAINT fk_mrf_regle   FOREIGN KEY (regle_id)   REFERENCES mail_regle (id)        ON DELETE CASCADE,
    CONSTRAINT fk_mrf_program FOREIGN KEY (program_id) REFERENCES training_program (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
