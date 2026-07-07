# 03 — Workflows & cycle de vie d'un dossier

Un **dossier** = une ligne `enrollment` (stagiaire ↔ session). Il avance le long
des étapes `crm_stage` et déclenche la production documentaire. Dans `rewrite`,
les transitions sont **manuelles et explicites** (pas de file d'événements ni de
Google Calendar) : le secrétariat fait avancer le dossier dans le **Pipeline
CRM** et prépare/envoie les documents ; le stagiaire les signe depuis son espace.

## Cycle de vie

```txt
Prospect / Contacté
  → saisie du stagiaire (page Stagiaires) et création du dossier (Sessions › détail)

Devis / Contrat / Convention
  → l'admin PRÉPARE le jeu de documents (documentSetFor) sur le dossier
  → l'admin ENVOIE le document (status A_FAIRE → ENVOYE)
  → le stagiaire SIGNE depuis « Mon espace » (tracé)  → status SIGNE
  → notification « Document signé » créée pour l'organisme

Acompte / Inscrit
  → l'admin fait avancer le crm_stage (Pipeline) ; facture d'acompte possible

En formation
  → génération/regroupement de la feuille d'émargement
  → émargement par demi-journée (présent/absent) pendant la session

Terminé
  → certificat de réalisation, évaluation
  → facture (Factur-X) émise

Archivé
  → dossier clôturé (dernière colonne du pipeline)
```

## Étapes du pipeline (`crm_stage`)

`PROSPECT` → `CONTACTE` → `DEVIS_ENVOYE` → `DEVIS_SIGNE` → `ACOMPTE_PAYE` →
`INSCRIT` → `EN_FORMATION` → `TERMINE` → `EVALUATION_ENVOYEE` → `ARCHIVE`.

La page **Pipeline** (`pages/Pipeline.jsx`) affiche une colonne par étape et
permet de faire avancer/reculer un dossier (`PATCH /enrollments/:id` avec
`crm_stage`). L'appel est optimiste (la carte se déplace immédiatement) et se
resynchronise en cas d'erreur.

## Choix des documents (règles réelles — `src/api/lib/documents.js`)

`documentSetFor({ hygiene, rsCode, jours, financing })` renvoie la liste ordonnée
du dossier :

- **Devis** : `rs_code` (RS7404) → « Devis RS7404 » ; sinon Particulier → « Devis
  particulier » ; sinon « Devis entreprise ».
- **Contrat vs Convention** : Particulier → **Contrat de formation** ;
  Professionnel → **Convention de formation**.
- **Convocation vs Invitation** : formation certifiante (`rs_code`) → « Convocation
  à l'examen » ; sinon « Invitation ».
- **Émargement** : « Feuille d'émargement {jours}J », ou « 5J + hygiène » si la
  formation est hygiène (NIV1H).
- **Hygiène** : ajoute « Attestation Hygiène » et un « Test Hygiène » au lieu du
  test de positionnement standard.
- Toujours présents : Programme, Fiche d'expression de besoin, Droit à l'image,
  Certificat de réalisation, Évaluations (manageur/financeur).

Les documents `stagiaireSign: true` (Devis, Contrat/Convention, Droit à l'image)
sont ceux que le **stagiaire** doit signer depuis son espace.

## Automatisations réelles

Volontairement légères et synchrones :

- À la **signature** d'un document → `notification` créée pour l'organisme.
- Au **checkout** de ventes → décrément du stock + **facture automatique**.
- Sur stock sous le seuil ou facture impayée → **pastille** de navigation mise à
  jour (`/api/badges`, rafraîchie via `lib/events.js`).

Pas de relances programmées ni d'envoi d'e-mail dans cette branche (ce sont des
pistes d'évolution, pas des dépendances).
