/* 163_qcm_plusieurs_formations.sql
   UN QCM, PLUSIEURS FORMATIONS — et un jour propre à chacune si besoin.

   LE CONSTAT (production, 2026-09-17). Un QCM ne se rattachait qu'à UNE formation
   (`quiz.program_id`). Pour poser le même questionnaire dans plusieurs formations, il fallait
   le dupliquer : 22 des 23 QCM de l'école sont des copies de 6 d'entre eux (« Test de
   positionnement » existe en cinq exemplaires). Pire, activer un QCM non rattaché dans le
   parcours d'une formation le lui rattachait aussitôt — il disparaissait alors des autres.

   CE QUE FAIT CETTE TABLE. Chaque ligne dit « ce QCM sert à cette formation ».
   · `day` : le jour PROPRE à la formation (« Hygiène » tombe au jour 3 en HYG et au jour 4 en
     NIV1H). NULL = le QCM garde son jour par défaut (`quiz.day`).
   · `created_at` : la date du RATTACHEMENT, et elle n'est pas décorative. L'envoi automatique se
     déclenche quand un stagiaire ouvre son espace, pour tout jour de QCM déjà passé — y compris
     dans une session terminée depuis des mois. Rattacher un QCM à une formation l'aurait donc
     envoyé à TOUS ses anciens stagiaires. Un rattachement ne concerne que les sessions pas encore
     terminées à sa date (espace.controller, releaseAutoQuizzes).

   `quiz.program_id` RESTE, tenu égal à la première formation : le code d'avant cette migration
   continue de fonctionner, et un revert ne rend aucun QCM orphelin.

   REPRISE DE L'EXISTANT : chaque QCM rattaché reçoit sa ligne, datée de la CRÉATION du QCM — la
   vraie date de rattachement n'est écrite nulle part. Dater de la migration aurait écarté les
   sessions terminées entre la création du QCM et aujourd'hui, que le code d'avant servait encore.
   Rien d'autre ne bouge : les copies existantes restent des QCM distincts (la plupart n'ont
   d'ailleurs pas les mêmes questions d'une formation à l'autre).

   Rejouable : `IF NOT EXISTS` et `INSERT IGNORE`. */

CREATE TABLE IF NOT EXISTS quiz_program (
    quiz_id     uuid      NOT NULL,
    program_id  uuid      NOT NULL,
    day         int       DEFAULT NULL,
    created_at  timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (quiz_id, program_id),
    KEY idx_quiz_program_program (program_id),
    CONSTRAINT fk_quiz_program_quiz FOREIGN KEY (quiz_id)
        REFERENCES quiz (id) ON DELETE CASCADE,
    CONSTRAINT fk_quiz_program_program FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO quiz_program (quiz_id, program_id, day, created_at)
SELECT id, program_id, NULL, created_at
  FROM quiz
 WHERE program_id IS NOT NULL;
