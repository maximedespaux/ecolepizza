# Plan qualité et de tests

## Vue globale du projet

- **Nom du projet :** Impasto
- **Client :** École Pizzaïolo Jean-Jacques Despaux (« École Pizza »)
- **Chef de projet :** Guillaume Despaux
- **Document créé le :** 06/07/2026
- **Dernière modification :** 06/07/2026

## Table des matières

- [Plan qualité et de tests](#plan-qualité-et-de-tests)
  - [Vue globale du projet](#vue-globale-du-projet)
  - [Table des matières](#table-des-matières)
  - [Objectif](#objectif)
  - [Suivi Qualiopi](#suivi-qualiopi)
    - [Pièces suivies par dossier](#pièces-suivies-par-dossier)
    - [Score de conformité](#score-de-conformité)
    - [Export d'audit](#export-daudit)
  - [Stratégie de tests](#stratégie-de-tests)
    - [Tests unitaires (domaine)](#tests-unitaires-domaine)
    - [Tests d'intégration (API)](#tests-dintégration-api)
    - [Tests documentaires](#tests-documentaires)
    - [Tests de bout en bout](#tests-de-bout-en-bout)
  - [Jeux de données de test](#jeux-de-données-de-test)
  - [Critères d'acceptation](#critères-dacceptation)

## Objectif

Garantir deux choses : la **conformité Qualiopi** des dossiers produits par
l'application, et la **fiabilité technique** des fonctions critiques (génération
documentaire, signature, calcul de conformité, API). Ce document décrit le suivi
Qualiopi intégré au produit et la stratégie de tests logiciels.

## Suivi Qualiopi

Pour chaque session/dossier, l'application suit la présence des pièces
justificatives (`QualiopiEvidence`).

### Pièces suivies par dossier

- Programme transmis
- Devis signé
- Contrat / convention signé
- Convocation envoyée
- Test de positionnement
- Droit à l'image
- Émargement
- Évaluation à chaud
- Évaluation à froid
- Certificat de réalisation
- Preuves financeur
- Réclamations
- Indicateurs qualité

### Score de conformité

Un service parcourt les pièces requises selon la formation (hygiène,
certifiante…) et met à jour le score `ConformiteScore` du dossier à chaque
changement de statut documentaire :

| Score | Signification |
|:-:|---|
| 🟢 **VERT** | Dossier complet. |
| 🟠 **ORANGE** | Pièces manquantes non bloquantes. |
| 🔴 **ROUGE** | Pièces obligatoires manquantes. |

### Export d'audit

L'export d'audit produit la liste des preuves d'un dossier ou d'une session avec
leurs liens de stockage, pour présentation lors d'un audit Qualiopi.

## Stratégie de tests

### Tests unitaires (domaine)

Les règles métier vivent dans des modules purs (sélection des modèles, calcul des
dates ISO, assemblage des jetons, calcul du score de conformité). Elles sont
testables sans lancer l'application. Cas prioritaires :

- **Choix des modèles** : Particulier → Contrat + Devis Particulier ;
  Professionnel → Convention + Devis Entreprise ; RS7404 → Devis RS7404 +
  Convocation examen.
- **Émargement** : nombre de jours correct ; NIV1H → `5J + hygiène`.
- **Score de conformité** : VERT/ORANGE/ROUGE selon les pièces présentes.
- **Assemblage des jetons** : chaque jeton attendu par un modèle est bien fourni.

### Tests d'intégration (API)

Pour chaque endpoint : validation des entrées, codes de retour, cloisonnement par
organisme, journalisation. Cas prioritaires :

- Création stagiaire : payload valide → 201 ; payload invalide → 422.
- Accès sans droit → 403 ; clé/API webhook invalide → 401.
- Un utilisateur ne peut jamais lire les dossiers d'un autre organisme.
- Webhook signature : signature HMAC valide acceptée, invalide rejetée.

### Tests documentaires

- Chaque modèle `.docx` se remplit sans jeton manquant ni jeton orphelin.
- Le PDF généré est produit, nommé et classé au bon emplacement.
- L'orthographe exacte des jetons est respectée (`Niveau suggérer`, `Siret`…).

### Tests de bout en bout

Parcours complet d'un dossier : création stagiaire → devis généré → devis signé →
contrat/convention → convocation → émargement → évaluation → certificat, en
vérifiant à chaque étape la mise à jour du statut documentaire et du score de
conformité.

## Jeux de données de test

Les données de démonstration (`db:seed`) créent l'organisme École Pizza et ses
9 formations. Elles servent de base reproductible pour les tests. Aucune donnée
personnelle réelle (photos, contrats) n'est utilisée dans les tests : seules des
données fictives sont employées, conformément au RGPD.

## Critères d'acceptation

- Un dossier « particulier » et un dossier « entreprise » produisent chacun le bon
  jeu de documents, générés et classés correctement.
- Un document envoyé en signature revient signé avec sa preuve, et son statut
  passe à `SIGNE`.
- Le score de conformité reflète fidèlement l'état des pièces.
- Aucune fuite inter-organisme n'est possible via l'API.
- Aucun secret n'est exposé au navigateur.
