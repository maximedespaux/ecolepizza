-- 100_exam_session.sql
-- Les sessions d'examen de la certification et leurs résultats.
--
-- POURQUOI CETTE TABLE EXISTE. Le dossier RNCP n° 21983 a été refusé en avril 2023 avec cette
-- phrase : « la fiabilité des données transmises par le déposant pour justifier ces critères
-- est suffisamment remise en cause pour que l'analyse ne puisse être réalisée sur ce
-- fondement ». La cause, dite en entretien par l'instructrice : « Quand on regarde les PV qui
-- sont fournis, on n'arrive pas à savoir quelle est la certification qui a été visée. On a
-- bien le nom des certifiés, mais on ne sait pas sur quel cursus ça a été fait. »
--
-- Le suivi des titulaires existait pourtant, et il était bon — 196 personnes suivies
-- nominativement. Ce qui manquait, c'était le CHAÎNAGE entre le certifié et sa certification.
-- Cette table le rend structurel : on ne peut pas enregistrer un résultat sans dire de quelle
-- certification, dans quel centre, devant quel jury et sous quel numéro de PV.
--
-- ⚠️ Aucune session ne se crée sans les trois membres du jury. C'est une règle métier tenue
-- côté application, pas une contrainte SQL — mais elle n'est pas négociable : « En l'absence
-- d'un membre, la session ne se tient pas » (règlement d'examen, article 6).

-- ─────────────────────────────────────────────────────────────────────────────────────────
--  1. La session d'examen.
--
--  Distincte de `training_session`, qui est une session de FORMATION. Un candidat peut passer
--  l'épreuve sans avoir suivi la formation (candidature individuelle, VAE), et un stagiaire
--  formé en 2024 peut revenir passer un bloc en 2026 — c'est tout l'intérêt de la
--  capitalisation par blocs, qui sont acquis à vie. Le lien vers la formation est donc
--  facultatif, et c'est délibéré.
CREATE TABLE IF NOT EXISTS exam_session (
    id                  uuid         NOT NULL DEFAULT uuid(),
    organization_id     uuid         NOT NULL,
    -- Facultatif : renseigné quand la session d'examen clôt une session de formation.
    training_session_id uuid         DEFAULT NULL,

    -- L'identification de la certification. Ces trois colonnes sont la réponse directe au
    -- motif de refus : sans elles, un PV ne dit pas ce qui a été passé.
    certification       varchar(160) NOT NULL DEFAULT 'Artisan pizzaïolo',
    rncp_code           varchar(20)  DEFAULT NULL,          -- renseigné après enregistrement
    voie_acces          enum('FORMATION_CONTINUE','CANDIDATURE_INDIVIDUELLE','VAE')
                        NOT NULL DEFAULT 'FORMATION_CONTINUE',

    pv_ref              varchar(32)  NOT NULL,              -- EPJJD-EX-2026-014, dictable au téléphone
    date_examen         date         NOT NULL,
    lieu                varchar(200) NOT NULL,              -- l'adresse, pas la ville seule
    centre              varchar(200) NOT NULL,              -- le centre habilité qui accueille

    -- Le jury, en JSON : trois membres, chacun {nom, qualite, employeur, externe, na_pas_forme}.
    -- En JSON et pas en table : un jury n'est jamais requêté ni agrégé, il est lu d'un bloc
    -- avec sa session et imprimé sur le PV. Une table de liaison ajouterait une jointure à
    -- chaque lecture pour un gain nul.
    --
    -- `externe` et `na_pas_forme` ne sont pas du confort : la majorité du jury doit être
    -- extérieure à l'organisme, et aucun membre ne peut évaluer un candidat qu'il a formé.
    -- Ces deux règles se vérifient à la saisie et s'impriment sur le PV — c'est ce qui les
    -- rend opposables.
    jury                JSON         DEFAULT NULL,

    -- OUVERTE : on saisit. CLOTUREE : le jury a délibéré, plus rien ne bouge. Un PV se signe
    -- le jour de la session ; le rouvrir après coup viderait la signature de son sens.
    status              enum('OUVERTE','CLOTUREE','ANNULEE') NOT NULL DEFAULT 'OUVERTE',
    -- Renseigné si ANNULEE : une session annulée sans motif écrit ne prouve rien.
    annulation_motif    varchar(500) DEFAULT NULL,
    cloture_at          timestamp    NULL DEFAULT NULL,

    created_at          timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at          timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),

    PRIMARY KEY (id),
    -- Le numéro de PV identifie la session dans l'organisme : deux sessions ne peuvent pas le
    -- partager, sinon on retombe sur l'ambiguïté de 2023.
    UNIQUE KEY uq_exam_pv (organization_id, pv_ref),
    KEY idx_exam_org_date (organization_id, date_examen),
    KEY idx_exam_training (training_session_id),
    -- Préfixe « fk_exam_ » : les noms de contraintes sont uniques dans TOUTE la base, pas par
    -- table (cf. 096, où « fk_shop_org » était déjà pris par shop_settings — errno 121).
    CONSTRAINT fk_exam_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    -- SET NULL et pas CASCADE : si la session de formation est supprimée, le PV d'examen doit
    -- survivre. Il est conservé dix ans.
    CONSTRAINT fk_exam_training FOREIGN KEY (training_session_id)
        REFERENCES training_session (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────────────────
--  2. Le résultat d'un candidat à une session.
--
--  Une ligne par candidat et par session, pas une ligne par critère. Le référentiel compte
--  plus de quarante critères et certains se notent par item — six pâtons, cinq ingrédients,
--  trois pizzas. En lignes, une session de huit candidats produirait plusieurs milliers
--  d'enregistrements qu'on ne requête jamais séparément : on lit toujours la copie entière
--  d'un candidat. Le barème lui-même vit dans `src/app/ui/lib/protocoles.js`, qui fait foi.
CREATE TABLE IF NOT EXISTS exam_result (
    id              uuid      NOT NULL DEFAULT uuid(),
    exam_session_id uuid      NOT NULL,
    learner_id      uuid      NOT NULL,

    -- Les blocs présentés par ce candidat : ["BC01","BC03"]. Un candidat en capitalisation
    -- ne présente pas les quatre.
    blocs_presentes JSON      DEFAULT NULL,

    -- La saisie brute du jury : { "p5-boul": [4,4,2,4,0,4], "p2-temp": 4, "c11": 15 }.
    -- Les tableaux correspondent aux critères notés par item.
    scores          JSON      DEFAULT NULL,
    -- Les critères éliminatoires : { "1-B1-tenue": true, "1-B1-mains": false }.
    -- Séparé de `scores` parce qu'un éliminatoire n'est pas une note : il ne s'additionne pas,
    -- il invalide.
    elims           JSON      DEFAULT NULL,

    -- Le verdict calculé au moment de la clôture, figé : total, seuil, compétences
    -- insuffisantes, éliminatoires manqués, acquis. Recalculé à chaque saisie tant que la
    -- session est ouverte, gelé ensuite.
    --
    -- Pourquoi le stocker alors qu'il se recalcule : le barème peut évoluer. Un candidat de
    -- 2026 doit garder le résultat obtenu sous le barème de 2026, pas celui que donnerait le
    -- barème de 2029. C'est la même raison qui fait conserver les PV dix ans.
    verdicts        JSON      DEFAULT NULL,

    decision        enum('EN_COURS','CERTIFIE','BLOCS_ACQUIS','AJOURNE','ABSENT','EXCLU')
                    NOT NULL DEFAULT 'EN_COURS',
    -- L'observation du jury. Obligatoire côté application quand la décision est AJOURNE ou
    -- EXCLU : une décision défavorable se motive, sinon elle n'est pas opposable au recours.
    observations    varchar(1000) DEFAULT NULL,

    created_at      timestamp NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),

    PRIMARY KEY (id),
    -- Un candidat ne se présente qu'une fois à une session donnée.
    UNIQUE KEY uq_exres_cand (exam_session_id, learner_id),
    -- L'index qui sert le suivi d'insertion : « tous les résultats de ce titulaire », toutes
    -- sessions confondues, pour reconstituer son parcours de blocs.
    KEY idx_exres_learner (learner_id, decision),
    CONSTRAINT fk_exres_session FOREIGN KEY (exam_session_id)
        REFERENCES exam_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_exres_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
