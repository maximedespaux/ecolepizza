# 06 — Suivi Qualiopi

Pour chaque dossier (`enrollment`), on suit la présence des pièces attendues et on
en déduit un **score de conformité**. La page **Suivi** (`pages/Suivi.jsx`,
`suivi.controller.js`) liste d'abord les dossiers **incomplets**, chacun dépliable,
avec une **feuille de route** visuelle (composant `Roadmap.jsx` : gris → orange →
vert).

## Pièces suivies

Programme transmis · devis signé · contrat/convention signé · convocation/invitation
envoyée · test de positionnement · droit à l'image · émargement · évaluation à
chaud · évaluation à froid · certificat de réalisation. Le suivi s'appuie sur
l'état des documents (`generated_document`) du dossier — il n'y a pas de table de
preuves dédiée (l'ancienne `qualiopi_evidence`, inutilisée, a été retirée à la
migration 007).

## Score de conformité (`enrollment.conformite_score`)

- **VERT** — dossier complet.
- **ORANGE** — pièces manquantes non bloquantes.
- **ROUGE** — pièces obligatoires manquantes.

Le score est calculé à partir des pièces requises selon la formation (hygiène,
certifiante…) et de l'état documentaire du dossier. Il est mis à jour au fil des
transitions (préparation/envoi/signature des documents, émargement, évaluations).

## Feuille de route (Roadmap)

`Roadmap.jsx` matérialise l'avancement du dossier par étapes colorées :

- **gris** — étape non commencée / pièce à faire ;
- **orange** — en cours ;
- **vert** — pièce obtenue / étape terminée.

Cela donne au secrétariat une lecture immédiate de ce qu'il reste à produire pour
rendre le dossier auditable.

## Accès

La page Suivi est ouverte au **bureau** et à l'**auditeur** (`AUDIT_ROLES`),
mais **pas au formateur** (voir `08_PAGES.md`).
