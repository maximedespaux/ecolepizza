/* 194_enrollment_reglement.sql

   LE SUIVI DU RÈGLEMENT D'UN DOSSIER — l'acompte est-il payé ? et le reste ? (demandé le
   2026-09-30). Deux dates sur `enrollment` : le jour où l'acompte a été encaissé, et le jour où le
   solde l'a été.

   POURQUOI DEUX DATES, ET RIEN D'AUTRE. L'école suit ses encaissements de DEUX façons, qu'on
   réunit sur la fiche stagiaire (carte « Règlement »), en logique HYBRIDE :
     · quand une FACTURE existe (un ACOMPTE ou une FACTURE de solde), c'est ELLE qui fait foi : le
       paiement se lit dans la table `payment` (somme des règlements REUSSI), rien à saisir ici ;
     · quand il n'y a pas de facture — l'argent est venu en espèces, en chèque, hors du logiciel —,
       l'école COCHE « payé le … ». Ce sont ces deux dates.
   La facture l'emporte sur la coche : si une facture dit « payé », la carte l'affiche, quoi qu'il
   arrive à la coche. Les deux ne peuvent donc pas se contredire en silence.

   POURQUOI PAS DE COLONNE POUR LE MONTANT DE L'ACOMPTE. `enrollment.acompte` EXISTE DÉJÀ
   (decimal(10,2), depuis toujours) mais n'avait AUCUN chemin d'écriture — l'application ne la
   remplissait nulle part. La carte « Règlement » lui en donne un enfin : c'est le montant de
   l'acompte CONVENU du dossier, saisi à la main quand aucun ACOMPTE n'a été facturé. Le reste à
   payer se calcule (prix − acompte), comme le jeton {Reste à payer} des documents. Effet de bord
   assumé : un modèle qui emploie le jeton {Acompte} (le champ, pas le jeton personnalisé de
   l'organisme) imprimera désormais ce montant au lieu d'un blanc.

   LE CODE MARCHE AVANT ET APRÈS. Sans ces colonnes, la carte lit le règlement uniquement d'après
   les factures (la coche manuelle répond « migration 194 non jouée »), et le montant de l'acompte
   reste saisissable (colonne `acompte` déjà là). DATE et non DATETIME : on suit le JOUR d'un
   encaissement, pas l'heure — comme une date de naissance, sans fuseau.

   VÉRIFICATION (par l'API, sans SQL) : cocher « acompte payé le … » sur un dossier sans facture
   répond 200 (et non 503), puis GET /api/stagiaires/:id/reglements rend `acompte.date` rempli et
   `acompte.source: "manuel"`. Ou une requête, qui doit rendre 2 :
   SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='enrollment' AND column_name IN ('acompte_paye_le','solde_paye_le')

   REVERT : efface les deux dates cochées à la main (les paiements portés par des factures restent,
   ils vivent dans `payment`). La colonne `acompte` n'est pas touchée : elle préexiste. */

ALTER TABLE enrollment
    ADD COLUMN IF NOT EXISTS acompte_paye_le DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS solde_paye_le   DATE DEFAULT NULL;
