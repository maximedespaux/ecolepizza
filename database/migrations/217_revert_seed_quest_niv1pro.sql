/* 217_revert_seed_quest_niv1pro.sql — annule 217_seed_quest_niv1pro.sql.

   Retire TOUS les chapitres Pizza Quest rattachés à la formation NIV1PRO : les questions et
   les options partent par cascade (ON DELETE CASCADE, cf. 102_quest_questions.sql). La
   formation est désignée par son CODE, jamais par un identifiant écrit en dur.

   NE TOUCHE À AUCUNE AUTRE FORMATION : NIV1, NIV2, RS7404 et NIV1H gardent leur banque intacte
   — chacune a ses propres chapitres, le lien se fait par quest_chapter.program_id.

   ⚠️ NIV1PRO n’avait aucun contenu Pizza Quest avant le seed : rejouer ce revert revient donc à
   l’état d’origine. Un chapitre NIV1PRO ajouté à la main APRÈS le seed serait, lui aussi, retiré
   — le revert raisonne par formation, pas par titre. */

DELETE c FROM quest_chapter c
  JOIN training_program p ON p.id = c.program_id AND p.code = 'NIV1PRO';
