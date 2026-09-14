/*
 * ÉVALUATION PRATIQUE — le formateur note chaque stagiaire sur des exercices.
 *
 * POURQUOI UN NOUVEL OBJET plutôt qu'un QCM. Un QCM est rempli par le STAGIAIRE, qui choisit
 * parmi des options écrites d'avance. Ici c'est le FORMATEUR qui saisit une mesure brute — des
 * points, un temps au chronomètre, un geste acquis ou non — que le barème convertit en points.
 * Rien de commun : ni l'auteur, ni la nature de la saisie, ni la conversion.
 *
 * TROIS TABLES, ET LA RAISON DE CHACUNE :
 *   · la GRILLE appartient à une formation, parce que la notation diffère d'une formation à
 *     l autre. Une formation sans grille ne note rien, et rien ne change pour elle.
 *   · l EXERCICE porte son barème. Quatre familles coexistent dans la même grille : on ne note
 *     pas un temps de façonnage comme on valide un geste d hygiène.
 *   · la NOTE lie un exercice à un DOSSIER (enrollment) et non à un stagiaire : la même personne
 *     peut refaire la formation, et ses deux passages ne doivent pas se confondre.
 *
 * LES POINTS SONT FIGÉS À LA SAISIE. `points` est calculé au moment où le formateur note, puis
 * stocké. Le recalculer à la lecture semblerait plus propre, mais changer un palier six mois
 * plus tard réécrirait silencieusement des notes déjà communiquées — et un stagiaire à qui l on
 * a annoncé 100 points ne doit pas en trouver 50 sur son attestation. La valeur BRUTE est
 * conservée à côté, pour qu on puisse toujours recalculer en connaissance de cause.
 */

CREATE TABLE IF NOT EXISTS evaluation_grille (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    program_id      uuid         NOT NULL,
    label           varchar(160) NOT NULL,
    /* Seuil de réussite en POURCENTAGE du total atteignable, comme `quiz.pass_score` — et non
       en points, pour qu ajouter un exercice ne rende pas caduc un seuil écrit en dur. */
    pass_score      int          DEFAULT NULL,
    active          tinyint(1)   NOT NULL DEFAULT 1,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_evalgrille_prog (program_id, active),
    CONSTRAINT fk_evalgrille_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalgrille_prog FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS evaluation_exercice (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    grille_id       uuid         NOT NULL,
    label           varchar(200) NOT NULL,
    consigne        text         DEFAULT NULL,
    /* POINTS   note directe, bornée par max_points
       TEMPS    une durée en secondes, convertie par des paliers
       BINAIRE  acquis ou non acquis
       NIVEAUX  une appréciation parmi plusieurs, chacune valant des points */
    bareme          ENUM('POINTS','TEMPS','BINAIRE','NIVEAUX') NOT NULL DEFAULT 'POINTS',
    /* Points maximum atteignables sur cet exercice. Sert au total de la grille, et borne la
       saisie en mode POINTS. Pour TEMPS et NIVEAUX, il doit valoir le meilleur palier — le
       serveur le recalcule pour éviter qu une grille annonce un total qu on ne peut pas faire. */
    max_points      int          NOT NULL DEFAULT 20,
    /* Paliers, en JSON, pour TEMPS et NIVEAUX. Vide pour les deux autres barèmes.
       TEMPS   [{"max_s":60,"points":100},{"max_s":120,"points":50},{"max_s":null,"points":0}]
               le premier palier dont `max_s` couvre la durée gagne, `null` valant au-delà.
       NIVEAUX [{"label":"Insuffisant","points":0},{"label":"Acquis","points":10}] */
    paliers         longtext     DEFAULT NULL,
    sort_order      int          NOT NULL DEFAULT 0,
    active          tinyint(1)   NOT NULL DEFAULT 1,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_evalex_grille (grille_id, sort_order),
    CONSTRAINT fk_evalex_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalex_grille FOREIGN KEY (grille_id)
        REFERENCES evaluation_grille (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS evaluation_note (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    enrollment_id   uuid         NOT NULL,
    exercice_id     uuid         NOT NULL,
    /* La mesure BRUTE, telle que saisie : un nombre de points, une durée en secondes, OUI ou
       NON, l index d une appréciation. Conservée pour pouvoir recalculer un jour en sachant ce
       qu on recalcule. */
    valeur          varchar(40)  DEFAULT NULL,
    /* Les points, FIGÉS au moment de la saisie (cf. en-tête). */
    points          int          DEFAULT NULL,
    commentaire     varchar(400) DEFAULT NULL,
    note_par        uuid         DEFAULT NULL,
    note_le         timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    /* UNE note par dossier et par exercice. Sans cette contrainte, deux formateurs notant la
       même personne en même temps créeraient deux lignes, et le total en compterait deux. */
    UNIQUE KEY uq_evalnote (enrollment_id, exercice_id),
    KEY idx_evalnote_org (organization_id),
    CONSTRAINT fk_evalnote_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalnote_enr FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalnote_ex FOREIGN KEY (exercice_id)
        REFERENCES evaluation_exercice (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalnote_user FOREIGN KEY (note_par)
        REFERENCES user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
