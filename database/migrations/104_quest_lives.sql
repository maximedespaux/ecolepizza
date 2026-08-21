/* 104_quest_lives.sql
   Vies de Pizza Quest : un capital de cœurs par stagiaire, qui se reconstitue avec le temps.

   Perdre un cœur coûte quelque chose (échouer un chapitre, ou l'abandonner en cours) et le
   récupérer demande d'attendre : c'est ce qui donne du poids à une tentative. Sans cela, on
   relance un chapitre en boucle jusqu'à tomber sur les bonnes cases.

   DEUX cœurs différents dans le jeu, à ne pas confondre :
     · les 3 cœurs À L'INTÉRIEUR d'un chapitre (dans le QCM), qui ne sont pas stockés et
       repartent à chaque tentative ;
     · les cœurs de CETTE table, persistants, communs à tout Pizza Quest.

   On stocke le nombre de cœurs ET la date de dernière modification, pas un journal des
   pertes : la régénération se calcule à la lecture (temps écoulé ÷ délai), ce qui évite
   une tâche planifiée pour recréditer les stagiaires. Personne n'a besoin de savoir QUAND
   un cœur a été perdu, seulement combien il en reste et depuis quand.

   Commentaires en blocs et type uuid : mêmes raisons qu'en 101/102. */

CREATE TABLE IF NOT EXISTS learner_quest_life (
    learner_id      uuid      NOT NULL,
    organization_id uuid      NOT NULL,
    hearts          TINYINT   NOT NULL DEFAULT 5,
    /* Repère de la régénération : à la lecture, on ajoute (maintenant − updated_at) ÷ délai.
       Mis à jour à chaque perte ET à chaque crédit effectivement accordé. */
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    /* Une ligne par stagiaire : les cœurs sont communs à toutes ses formations. */
    PRIMARY KEY (learner_id),
    KEY idx_qlife_org (organization_id),
    CONSTRAINT fk_qlife_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE,
    CONSTRAINT fk_qlife_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Réglages de l'organisme. Sur `organization` plutôt que dans une table dédiée : deux
   entiers valables pour tout l'organisme ne justifient pas une table de plus.
   quest_regen_minutes = 0 -> régénération immédiate (cœurs toujours pleins), ce qui permet
   de neutraliser la mécanique sans toucher au code. */
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS quest_max_hearts     TINYINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS quest_regen_minutes  SMALLINT NOT NULL DEFAULT 5;
