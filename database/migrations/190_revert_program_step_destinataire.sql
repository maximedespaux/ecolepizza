/*
  190_revert_program_step_destinataire.sql

  190 EST ABANDONNÉE — à jouer SEULEMENT si 190_program_step_destinataire.sql a été jouée (elle
  l'a été en production le 2026-09-28, pour l'essayer).

  La 190 ajoutait `program_step.destinataire` : un jalon du parcours adressé à l'entreprise plutôt
  qu'au stagiaire (les CGV « reçues par l'entreprise »). L'école a préféré dupliquer le document et
  le cocher « Groupe », plus simple. Le code a été retiré par la PR #246 avec ses deux fichiers.
  Ce revert revient seul, comme celui de la 187, pour que la colonne restée en base se retire en
  jouant un fichier plutôt qu'en tapant une commande.

  CE QUI SE PERD : rien que le code lise encore. Plus aucun écran ne pose ni ne relit ce choix.

  Sans risque à ne pas jouer si la 190 ne l'a jamais été : `IF EXISTS`.
*/

ALTER TABLE program_step
    DROP COLUMN IF EXISTS destinataire;
