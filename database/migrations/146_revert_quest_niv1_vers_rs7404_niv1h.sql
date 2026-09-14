/*
 * REVERT de la 146 — retire le contenu Pizza Quest de RS7404 et NIV1H.
 *
 * LA SUPPRESSION PORTE SUR TOUS LES CHAPITRES DE CES DEUX FORMATIONS, et c'est exact au moment
 * où la 146 est jouée : les deux n'en avaient AUCUN avant elle (vérifié en production —
 * 26 chapitres, tous rattachés à NIV1 ou NIV2). L'aller s'abstient d'ailleurs si la cible a déjà
 * du contenu, précisément pour que ce retour reste sans ambiguïté.
 *
 * ⚠️ EN REVANCHE, SI DU CONTENU A ÉTÉ CRÉÉ À LA MAIN sur RS7404 ou NIV1H APRÈS la 146, ce revert
 * l'emportera aussi : rien ne distingue une question copiée d'une question écrite ensuite. Le
 * dire ici plutôt que de le découvrir après — c'est la seule information qui compte avant de
 * lancer ce fichier.
 *
 * Les questions et leurs options partent d'elles-mêmes : `quest_question.chapter_id` et
 * `quest_option.question_id` sont en ON DELETE CASCADE.
 */

DELETE c FROM quest_chapter c
  JOIN training_program p ON p.id = c.program_id
 WHERE p.code IN ('RS7404', 'NIV1H');

/* Tables de correspondance : normalement déjà supprimées par l'aller, sauf s'il s'est
   interrompu en chemin. */
DROP TABLE IF EXISTS _quest_copie_question;
DROP TABLE IF EXISTS _quest_copie_chapitre;
DROP TABLE IF EXISTS _quest_copie_hygiene;
