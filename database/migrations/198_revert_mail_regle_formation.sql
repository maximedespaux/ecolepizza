/*
  REVERT de la 198 — retire le filtre multi-formations des envois programmés.

  CE QUI SE PERD : les règles qui visaient PLUSIEURS formations redeviennent « toutes formations »
  (leur liste vivait dans cette table). Les règles qui ne visaient QU'UNE formation la gardent :
  `mail_regle.program_id` la porte encore (le code l'y laisse quand une seule est choisie).
*/
DROP TABLE IF EXISTS mail_regle_formation;
