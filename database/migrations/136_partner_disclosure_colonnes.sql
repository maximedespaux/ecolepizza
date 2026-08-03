/* 136_partner_disclosure_colonnes.sql
   RATTRAPAGE : les colonnes manquantes de `partner_disclosure`.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI CE FICHIER EXISTE, ET C'EST UNE LEÇON SUR `CREATE TABLE IF NOT EXISTS`.

   La migration 130 crée `partner_disclosure` avec `CREATE TABLE IF NOT EXISTS`. Écrit ainsi pour
   être rejouable — et il l'est, au sens où le rejouer ne casse rien. Mais « ne rien casser » n'est
   pas « rattraper » : si la table EXISTE DÉJÀ, ne serait-ce que sous une forme antérieure ou
   incomplète, l'instruction est intégralement ignorée. Aucune colonne n'est ajoutée, aucune erreur
   n'est levée, et l'on croit la migration passée.

   C'est exactement ce qui s'est produit : `champs_envoyes` manquait, et l'export échouait au
   moment de journaliser l'envoi — donc APRÈS avoir composé la liste, ce qui rendait le
   diagnostic d'autant moins évident.

   `ADD COLUMN IF NOT EXISTS`, lui, agit colonne par colonne : il ajoute ce qui manque et laisse le
   reste tranquille. C'est la seule forme réellement rejouable, et celle que ce fichier emploie
   pour TOUTES les colonnes — pas seulement celle qui manquait, puisque rien ne garantit que les
   autres soient là.

   ⚠ SI LA TABLE N'EXISTE PAS DU TOUT, jouer la 130 d'abord : ce fichier ne la crée pas, il la
   complète.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   AUCUNE DONNÉE N'EST TOUCHÉE. Les colonnes ajoutées sont nullables ou ont un défaut : les lignes
   déjà présentes restent lisibles, avec un `champs_envoyes` vide qui signifie honnêtement « on ne
   sait pas ce qui est parti ce jour-là ». Le renseigner après coup serait inventer. */

ALTER TABLE partner_disclosure
    ADD COLUMN IF NOT EXISTS session_id     uuid         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS learner_ids    TEXT         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS learners_count INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS champs_envoyes varchar(255) DEFAULT NULL
        COMMENT 'Les champs réellement transmis ce jour-là : nom, email, telephone…',
    ADD COLUMN IF NOT EXISTS envoye_par     uuid         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS sent_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP;
