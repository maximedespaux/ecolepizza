-- 103_hygiene_suite.sql
-- Suite « Maîtrise sanitaire (HACCP) » de l'espace stagiaire — le plan de maîtrise sanitaire
-- (PMS) numérique que le paquet hygiène (règl. CE 852/2004, arrêté du 8 oct. 2013) impose et
-- qu'AKTO identifie comme compétence métier à acquérir (« traçabilité des ingrédients, plan de
-- maîtrise sanitaire »). Sert de preuve d'usage d'un outil numérique métier pour le dossier RNCP.
--
-- Choix de modélisation : 3 tables, pas 8. La plupart des registres HACCP sont « des entrées
-- datées avec une valeur, un seuil, un statut » — un vrai PMS SaaS les range dans un journal
-- unique. On garde donc :
--   · hs_equipment      — le référentiel des points de contrôle (chambre froide, four, friteuse…)
--   · hs_cleaning_task  — le PLAN de nettoyage (le modèle : zone + tâche + fréquence)
--   · hs_entry          — le JOURNAL universel : une ligne par relevé / livraison / tâche cochée /
--                         étiquette / contrôle d'huile / non-conformité / pesée de biodéchet /
--                         intervention équipement. Colonnes typées (value_num, status, occurred_at,
--                         due_at) pour trier, alerter et exporter ; `meta` JSON pour le spécifique.
--
-- Tout est scellé par stagiaire (user_id) ET organisme (organization_id), comme la mercuriale et
-- les recettes. Préfixe de contraintes « fk_hs_ » : les noms de contraintes sont uniques dans TOUTE
-- la base (pas par table) — un préfixe dédié évite l'errno 121 « Duplicate key ».

-- ── Référentiel des points de contrôle ────────────────────────────────────────────────────────
-- Un frigo, une chambre froide, un four, une friteuse… Porte les seuils par équipement (un
-- congélateur vise ≤ -18 °C, une chambre froide positive ≤ 4 °C) : le relevé se juge contre CE
-- seuil, pas contre une constante codée en dur. Sert aussi de « carnet d'équipement » (fiche de vie).
CREATE TABLE IF NOT EXISTS hs_equipment (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    user_id         uuid         NOT NULL,
    name            varchar(160) NOT NULL,                  -- « Chambre froide 1 », « Four Moretti »
    type            enum('FROID','CONGELATEUR','CHAUD','FOUR','PETRIN','FRITEUSE','AUTRE')
                    NOT NULL DEFAULT 'FROID',
    target_min      decimal(5,2) DEFAULT NULL,              -- seuil bas (NULL si non pertinent)
    target_max      decimal(5,2) DEFAULT NULL,              -- seuil haut
    unit            varchar(16)  NOT NULL DEFAULT '°C',
    location        varchar(160) DEFAULT NULL,              -- « labo », « réserve »
    note            varchar(500) DEFAULT NULL,
    active          tinyint(1)   NOT NULL DEFAULT 1,        -- désactivé = masqué mais historique gardé
    sort_order      int          NOT NULL DEFAULT 0,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_hsequip_user (user_id, active, sort_order),
    KEY idx_hsequip_org (organization_id),
    CONSTRAINT fk_hs_equip_org  FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_hs_equip_user FOREIGN KEY (user_id)         REFERENCES user (id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── Plan de nettoyage-désinfection (le modèle, pas les exécutions) ─────────────────────────────
-- « Sol du labo — quotidien — dégraissant », « Chambre froide — hebdo — désinfectant ». Chaque
-- tâche cochée devient une hs_entry (register=CLEANING) qui pointe ce task_id. Le plan vit ici,
-- l'historique du « fait / par qui / quand » vit dans le journal.
CREATE TABLE IF NOT EXISTS hs_cleaning_task (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    user_id         uuid         NOT NULL,
    zone            varchar(120) NOT NULL,                  -- « Plan de travail », « Sol », « Trancheur »
    task            varchar(255) NOT NULL,                  -- « Dégraisser et désinfecter »
    frequency       enum('QUOTIDIEN','HEBDO','MENSUEL','TRIMESTRIEL','APRES_USAGE')
                    NOT NULL DEFAULT 'QUOTIDIEN',
    product         varchar(160) DEFAULT NULL,              -- le produit à utiliser
    method          varchar(500) DEFAULT NULL,              -- dilution, temps de contact
    active          tinyint(1)   NOT NULL DEFAULT 1,
    sort_order      int          NOT NULL DEFAULT 0,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_hstask_user (user_id, active, sort_order),
    KEY idx_hstask_org (organization_id),
    CONSTRAINT fk_hs_task_org  FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_hs_task_user FOREIGN KEY (user_id)         REFERENCES user (id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── Préréglages (paramétrage anti-re-saisie) ─────────────────────────────────────────────────
-- L'argument massue des logiciels HACCP du marché : « en quelques clics ». On y arrive en évitant
-- de retaper les mêmes réponses. On mémorise donc les valeurs récurrentes du stagiaire :
--   · SUPPLIER  → ses fournisseurs (Metro, Transgourmet…) — proposés en autocomplétion à la réception
--   · PRODUCT   → ses produits fréquents, avec une DLC secondaire par défaut (`dlc_days`) et un type
--                 (`meta.type`) : choisir « Sauce tomate maison » sur une étiquette REMPLIT la DLC (+3 j)
--                 tout seul. Zéro question répétée.
CREATE TABLE IF NOT EXISTS hs_preset (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    user_id         uuid         NOT NULL,
    kind            enum('SUPPLIER','PRODUCT') NOT NULL,
    label           varchar(160) NOT NULL,
    dlc_days        int          DEFAULT NULL,          -- produit : durée de vie secondaire par défaut (jours)
    meta            longtext     DEFAULT NULL,          -- ex. { "type": "FABRICATION" }
    sort_order      int          NOT NULL DEFAULT 0,
    active          tinyint(1)   NOT NULL DEFAULT 1,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_hspreset_user (user_id, kind, active, sort_order),
    CONSTRAINT fk_hs_preset_org  FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_hs_preset_user FOREIGN KEY (user_id)         REFERENCES user (id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── Journal universel ─────────────────────────────────────────────────────────────────────────
-- Une ligne = un événement daté, quel que soit le registre. Les colonnes communes portent ce
-- qu'on trie/alerte/exporte ; `meta` (JSON) porte le reste, propre à chaque registre :
--   TEMPERATURE → { }                (equipment_id + value_num suffisent)
--   REFROIDISSEMENT → { t_debut, duree_min }  (value_num = T° à cœur finale ; conforme si ≤10°C en ≤2h)
--   REMISE_TEMP → { }                (value_num = T° atteinte ; conforme si ≥63°C)
--   AUDIT       → { type }           (title=objet, note=constats, corrective=actions)
--   RECEPTION   → { supplier, temp_livraison, lot, dlc, etat_emballage }
--   CLEANING    → { }                (task_id + status=FAIT)
--   LABEL       → { produit, type: 'OUVERTURE'|'DECONGELATION'|'FABRICATION', lot }
--   OIL         → { polaires }        (value_num = %polaires ; equipment_id = la friteuse)
--   NONCONF     → { categorie }       (title=constat, corrective=action, status ouvert/résolu)
--   BIOWASTE    → { type_dechet, destination }  (value_num = kg)
--   EQUIPMENT   → { intervention: 'MAINTENANCE'|'PANNE'|'PROG_NUIT', prog }  (carnet d'équipement)
CREATE TABLE IF NOT EXISTS hs_entry (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    user_id         uuid         NOT NULL,
    register        enum('TEMPERATURE','REFROIDISSEMENT','REMISE_TEMP','RECEPTION','CLEANING','LABEL','OIL','NONCONF','BIOWASTE','EQUIPMENT','AUDIT')
                    NOT NULL,
    equipment_id    uuid         DEFAULT NULL,              -- point de contrôle concerné (temp/huile/équip.)
    task_id         uuid         DEFAULT NULL,              -- tâche de nettoyage cochée
    title           varchar(255) DEFAULT NULL,             -- nom produit / fournisseur / constat…
    value_num       decimal(10,2) DEFAULT NULL,            -- °C, kg, % — la valeur mesurée
    unit            varchar(16)  DEFAULT NULL,             -- '°C', 'kg', '%'
    status          enum('CONFORME','NON_CONFORME','A_VERIFIER','FAIT','OUVERT','RESOLU','NA')
                    DEFAULT NULL,
    occurred_at     datetime     NOT NULL DEFAULT current_timestamp(),  -- quand ça s'est passé
    due_at          datetime     DEFAULT NULL,             -- DLC / prochaine échéance (alerte)
    note            varchar(1000) DEFAULT NULL,
    corrective      varchar(1000) DEFAULT NULL,            -- action corrective (hors seuil, non-conf.)
    meta            longtext     DEFAULT NULL,             -- JSON spécifique au registre
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_hsentry_user_reg (user_id, register, occurred_at),
    KEY idx_hsentry_org_reg (organization_id, register, occurred_at),
    KEY idx_hsentry_due (due_at),                          -- balayage des DLC à venir
    KEY idx_hsentry_equip (equipment_id),
    CONSTRAINT fk_hs_entry_org   FOREIGN KEY (organization_id) REFERENCES organization (id)   ON DELETE CASCADE,
    CONSTRAINT fk_hs_entry_user  FOREIGN KEY (user_id)         REFERENCES user (id)           ON DELETE CASCADE,
    CONSTRAINT fk_hs_entry_equip FOREIGN KEY (equipment_id)    REFERENCES hs_equipment (id)   ON DELETE SET NULL,
    CONSTRAINT fk_hs_entry_task  FOREIGN KEY (task_id)         REFERENCES hs_cleaning_task (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
