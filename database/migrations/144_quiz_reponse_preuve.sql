/*
 * LA PREUVE D'UNE RÉPONSE AU QCM — figée le jour où le stagiaire répond.
 *
 * LE PROBLÈME, constaté dans le code existant. Enregistrer un QCM SUPPRIME ses questions et les
 * recrée avec de nouveaux identifiants (`quiz.controller.js`, remplacement en bloc) — même quand
 * on n'a changé que le titre. Or `quiz_answer.question_id` ne porte AUCUNE clé étrangère : les
 * réponses déjà données ne sont ni supprimées ni recalées, elles désignent des lignes qui
 * n'existent plus. Résultat : la vue d'ensemble annonce « 12 réponses, moyenne 74 % » pendant que
 * chaque question affiche « 0 réponse ». Les données sont là, simplement plus rattachables.
 *
 * POURQUOI UN INSTANTANÉ, ET PAS DES IDENTIFIANTS STABLES. Garder les ids réparerait les
 * statistiques, mais pas la PREUVE : une question dont on corrige le texte, une option retirée,
 * une question supprimée — et l'on ne peut plus dire ce qui avait été RÉELLEMENT posé au stagiaire
 * ce jour-là. Un contrôle Qualiopi ne demande pas « quelle est la question 3 aujourd'hui », il
 * demande « qu'a-t-on demandé à cette personne, et qu'a-t-elle répondu ». La preuve doit donc être
 * autonome : elle recopie l'énoncé, les options et le choix EN TOUTES LETTRES, sans dépendre
 * d'aucune autre table.
 *
 * `longtext` : un QCM de vingt questions à choix multiples pèse quelques kilo-octets par réponse.
 * Le coût de stockage est négligeable devant celui de ne pas pouvoir prouver.
 *
 * NULL = réponse antérieure à cette migration : sa preuve détaillée n'existe pas et ne peut pas
 * être reconstituée. Le score, lui, reste (il est stocké sur `quiz_response` depuis l'origine).
 * L'écran doit donc distinguer « pas de preuve » de « preuve vide » — d'où NULL et non ''.
 *
 * `ADD COLUMN IF NOT EXISTS` → rejouable. Le code marche avant comme après : la colonne est
 * SONDÉE à l'écriture comme à la lecture, et une réponse s'enregistre même sans elle — refuser la
 * soumission d'un stagiaire parce qu'une migration n'est pas jouée serait le pire des échanges.
 */
ALTER TABLE quiz_response
    ADD COLUMN IF NOT EXISTS snapshot longtext DEFAULT NULL;
