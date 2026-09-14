/*
 * ÉVALUATION PAR UN JURY EXTERNE — la grille RS7404 telle qu'elle est réellement remplie.
 *
 * CE QUE LA GRILLE DE L'ÉCOLE FAIT, ET QUE LA 148 NE SAVAIT PAS DIRE. Sur la grille papier
 * « Fabriquer des pizzas artisanales RS7404 », le jury ne pose pas de points : il COCHE des
 * critères valant 1, et c est la COMPÉTENCE qui se valide, selon une règle écrite en toutes
 * lettres sous chaque bloc :
 *     C1 « le candidat doit valider les 6 critères »
 *     C2 « au moins 5 critères sur 6. Le critère C2.3 est obligatoire »
 *     C5 « les 4 critères sur 5. Le critère C5.5 est obligatoire »
 * Un total de points ne sait pas exprimer cela : 5 sur 6 et 5 sur 6 DONT LE BON ne font pas la
 * même règle, et les deux donnent pourtant cinq points.
 *
 * D OÙ DEUX AJOUTS SEULEMENT, plutôt qu un second jeu de tables :
 *   · une COMPÉTENCE, qui groupe des critères et porte le seuil ;
 *   · un drapeau OBLIGATOIRE sur le critère.
 * Un critère reste un exercice au barème BINAIRE valant 1 point : acquis ou non. Toute la
 * mécanique de saisie, de notes et d appartenance de la 148 est réemployée telle quelle.
 *
 * LE RÔLE SÉPARE LES DEUX GRILLES D UNE MÊME FORMATION. Le formateur note en continu pendant le
 * stage ; le jury évalue le jour de l examen. Ce sont deux actes, deux auteurs, deux documents —
 * et la formation en a besoin des deux en même temps.
 *
 * LE VERDICT EST UNE LIGNE À PART, et non trois colonnes sur l inscription. Il porte ce que le
 * jury PRONONCE — avis, rattrapage, observations — qui ne se déduit pas des cases cochées :
 * c est une décision, pas un calcul. Et il porte l heure de clôture, après laquelle la grille
 * ne bouge plus : un procès-verbal signé dont on pourrait encore changer les notes ne prouve
 * rien.
 */

/* ── 1. Le rôle de la grille ───────────────────────────────────────────────────────────── */
ALTER TABLE evaluation_grille
    ADD COLUMN IF NOT EXISTS role ENUM('FORMATEUR','JURY') NOT NULL DEFAULT 'FORMATEUR' AFTER program_id;

/* Le modèle de document produit à la clôture (slug d un `document_template`). Facultatif :
   une grille sans modèle se note quand même, elle n imprime simplement rien. */
ALTER TABLE evaluation_grille
    ADD COLUMN IF NOT EXISTS template_slug varchar(120) DEFAULT NULL AFTER pass_score;

/* L index de recherche portait (program_id, active) ; il porte désormais le rôle, puisqu une
   formation a maintenant DEUX grilles actives et qu on en cherche toujours une seule. */
ALTER TABLE evaluation_grille
    ADD INDEX IF NOT EXISTS idx_evalgrille_role (program_id, role, active);

/* ── 2. La compétence ─────────────────────────────────────────────────────────────────────
 * `min_valides` NULL signifie « tous les critères » — c est la règle la plus fréquente sur la
 * grille de l école (C1, C3, C4, C7), et la seule qui reste juste quand on ajoute un critère.
 * Écrire 6 en dur obligerait à repasser sur la compétence à chaque ajout, sans que rien ne le
 * signale. */
CREATE TABLE IF NOT EXISTS evaluation_competence (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    grille_id       uuid         NOT NULL,
    code            varchar(20)  DEFAULT NULL,       /* C1, C2… tel qu imprimé sur la grille */
    label           varchar(200) NOT NULL,
    min_valides     int          DEFAULT NULL,       /* NULL = tous les critères */
    sort_order      int          NOT NULL DEFAULT 0,
    active          tinyint(1)   NOT NULL DEFAULT 1,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_evalcomp_grille (grille_id, sort_order),
    CONSTRAINT fk_evalcomp_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalcomp_grille FOREIGN KEY (grille_id)
        REFERENCES evaluation_grille (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* ── 3. Le critère : un exercice rattaché à une compétence, éventuellement obligatoire ──── */
ALTER TABLE evaluation_exercice
    ADD COLUMN IF NOT EXISTS competence_id uuid DEFAULT NULL AFTER grille_id;
ALTER TABLE evaluation_exercice
    ADD COLUMN IF NOT EXISTS obligatoire tinyint(1) NOT NULL DEFAULT 0 AFTER max_points;
ALTER TABLE evaluation_exercice
    ADD INDEX IF NOT EXISTS idx_evalex_comp (competence_id, sort_order);

/* ── 4. Le verdict du jury pour un candidat ───────────────────────────────────────────────
 * `document_id` relie le procès-verbal produit à la clôture. SET NULL : si le document est
 * supprimé et régénéré, le verdict lui survit — c est lui qui porte la décision, le document
 * n en est que la mise en page. */
CREATE TABLE IF NOT EXISTS evaluation_verdict (
    id              uuid      NOT NULL DEFAULT uuid(),
    organization_id uuid      NOT NULL,
    grille_id       uuid      NOT NULL,
    enrollment_id   uuid      NOT NULL,
    avis            ENUM('FAVORABLE','DEFAVORABLE') DEFAULT NULL,
    rattrapage      tinyint(1) NOT NULL DEFAULT 0,
    observations    varchar(1000) DEFAULT NULL,
    /* Renseigné à la clôture : tant qu il est nul, la grille se modifie encore. */
    cloture_le      timestamp NULL DEFAULT NULL,
    cloture_par     uuid      DEFAULT NULL,
    document_id     uuid      DEFAULT NULL,
    created_at      timestamp NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    /* Un verdict par candidat et par grille : le jury ne délibère qu une fois. */
    UNIQUE KEY uq_evalverdict (grille_id, enrollment_id),
    KEY idx_evalverdict_org (organization_id),
    CONSTRAINT fk_evalverdict_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalverdict_grille FOREIGN KEY (grille_id)
        REFERENCES evaluation_grille (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalverdict_enr FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE,
    CONSTRAINT fk_evalverdict_user FOREIGN KEY (cloture_par)
        REFERENCES user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
