/* ============================================================================================
   203 — NOMBRE DE DOCUMENTS PAR TYPE DE REMISE (demandé le 2026-10-06).

   POURQUOI. Une remise (AGEFICE, diplôme…) acceptait déjà plusieurs fichiers sous un seul type,
   sans limite, avec un seul accusé de réception. L'école veut pouvoir CADRER ce nombre, au lieu de
   créer quatre ou cinq types distincts pour un même envoi :

     · `nb_mode = 'PLAFOND'` (défaut) : « au plus N documents ». On dépose de 1 à N ; l'étape est
       faite dès l'accusé de réception, quel que soit le nombre. `nb_documents = 0` = pas de limite,
       c'est-à-dire le comportement d'avant cette migration.
     · `nb_mode = 'REQUIS'` : « il en faut N ». L'étape ne se termine QUE lorsque N documents sont
       déposés : le destinataire ne peut pas accuser réception tant qu'il en manque (le serveur le
       refuse), et le dépôt plafonne à N. La complétion reste « accusé de réception » (parcours,
       conformité, groupe INCHANGÉS) — on ne la franchit simplement qu'une fois les N déposés.

   L'ACCUSÉ RESTE UNIQUE, pour toute la remise (choix de l'école) : on ne confirme pas document par
   document. Un seul accusé vaut pour les N fichiers.

   Le CODE MARCHE AVANT ET APRÈS : sans ces colonnes, tout type est « PLAFOND, 0 » — aucune limite,
   aucun requis —, soit exactement le comportement d'avant. `ADD COLUMN IF NOT EXISTS` → rejouable.
   ============================================================================================ */

ALTER TABLE remise_type
    ADD COLUMN IF NOT EXISTS nb_documents smallint NOT NULL DEFAULT 0,
    /* 0 = pas de limite (illimité). Sinon le nombre visé (plafond ou requis selon `nb_mode`). */
    ADD COLUMN IF NOT EXISTS nb_mode varchar(10) NOT NULL DEFAULT 'PLAFOND';
    /* 'PLAFOND' (au plus) ou 'REQUIS' (il en faut). Varchar et non enum : un mode de plus ne
       demandera pas de migration. */
