/* 163_revert_qcm_plusieurs_formations.sql
   RETIRE LA TABLE DES RATTACHEMENTS QCM ↔ FORMATIONS.

   CE QUI SE PERD : les formations AU-DELÀ de la première, et les jours propres à chaque
   formation. Un QCM partagé entre cinq formations redevient le QCM de sa formation principale
   (`quiz.program_id`, que le code tient à jour à chaque enregistrement) ; les quatre autres ne le
   voient plus, et le jour par défaut du QCM s'applique partout.

   CE QUI RESTE : tous les QCM, leurs questions et leurs réponses. Aucun n'est rendu orphelin —
   la formation principale n'a jamais cessé d'être écrite dans `quiz.program_id`. Le code
   fonctionne sans la table : il retombe sur cette seule colonne. */

DROP TABLE IF EXISTS quiz_program;
