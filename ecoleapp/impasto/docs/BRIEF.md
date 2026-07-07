# BRIEF — Projet « Impasto » (ERP École Pizza)

> **À lire en premier par Claude Code.** Ce fichier résume le contexte, les
> décisions et l'état du projet. Il remplace la mémoire d'une conversation
> menée ailleurs : tout ce qui suit fait autorité. Après lecture, suivre le
> prompt fourni par l'utilisateur.

---

## 1. Le projet en une phrase
ERP SaaS pour centres de formation, construit d'abord pour **l'École Pizzaïolo
Jean-Jacques Despaux** (Lannemezan, 65), puis destiné à être **revendu à
d'autres centres**. Objectif : dépasser Digiforma sur l'UX, l'automatisation,
la gestion documentaire et le suivi.

## 2. Interlocuteur
**Maxime Despaux**, non-développeur. Lui expliquer simplement, en français,
sans jargon inutile. **Poser des questions** en cas de doute plutôt que
supposer. Ne jamais supprimer de code sans expliquer avant. Être transparent
sur ce qui est réel vs simulé.

## 3. Stack (déjà en place, ne pas changer)
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Prisma** + **PostgreSQL** (multi-tenant : `organizationId` sur chaque modèle)
- Auth par rôles : **SECRETARIAT (admin)**, **FORMATEUR (co-admin)**, **ETUDIANT**
- UI maison dans `src/app/globals.css` (design tokens CSS : `--surface`,
  `--border`, `--ember1`, `--grad-ember`, `--muted`…). Classes réutilisables :
  `.card .btn .btn.primary .btn.ghost .pagehead .eyebrow .lead .modal .mhead
  .mbody .mfoot .overlay .field .inp .badge .kpi .empty .skel .toast`.
- Génération de documents **.docx** côté serveur (docxtemplater/Gotenberg
  scaffoldés) + moteur de tokens.
- Signature : **propriétaire, niveau simple (SES) + dossier de preuve**
  (hash SHA-256, horodatage, journal). PAS de niveau avancé/qualifié (illégal
  sans prestataire certifié). Connecteur Yousign prévu en option.

## 4. Identité de l'organisme (constantes officielles)
- ECOLE PIZZAIOLO Jean-Jacques DESPAUX — 101 rue Alsace Lorraine, 65300 Lannemezan
- SIRET 879 955 136 00012 · NAF 8559A · NDA 76 65 00989 65 · Qualiopi depuis 2021
- Tél 05 62 50 18 64 · contact@ecole-pizza.com · Responsable : Jean-Jacques Despaux

## 5. Formations (déjà dans `src/lib/ecole-pizza/catalogue.ts`)
Le catalogue utilise les **vrais noms** (NE PAS écrire « Annexe 1 ») :
`NIV1` Niveau I – Pizza Classique · `NIV1H` Niveau I + Hygiène · `NIV1PRO`
Niveau I Pro · `NIV2` Niveau II (Poolish/Biga) · `EXPERT` · `NAPO`
Napolitaine · `TEGLIA` In Teglia & In Pala · `RS7404` Fabriquer des pizzas
artisanales (certifiante, Répertoire Spécifique).

## 6. Modèles clés (schema.prisma)
- `Organization`, `User` (rôles), `Learner` (stagiaire), `Company`.
- `TrainingProgram` (code, titre, jours, heures, prix, rsCode…).
- `TrainingSession` (programId, annee, semaine ISO, dateDebut/Fin, status
  `SessionStatus` = PLANIFIEE|CONFIRMEE|EN_COURS|TERMINEE|ANNULEE).
- `Enrollment` (learnerId, sessionId, financement, prix, acompte, crmStage,
  conformite). `GeneratedDocument`, `SignatureRequest`, `AuditLog`, etc.

## 7. Décisions actées (ne pas re-discuter)
- **Webapp** (pas de logiciel installé). Hébergement cible : **sous-domaine
  `app.ecole-pizza.com`** (Vercel + Neon PostgreSQL + Brevo pour les e-mails).
- Ordre produit : **P0** Document Engine (23 documents fidèles) → **P1** login &
  rôles réels → mise en ligne → **P2** workflow/relances serveur → **P3**
  habillage premium → **P4** IA copilote.
- **Monolithe modulaire** (pas de microservices). Modules découplés :
  `documents/ trust/ workflow/ crm/ compta/ parcours/`.
- Multi-tenant dès maintenant.

## 8. Déjà construit dans ce dépôt
- 10 routes sous `src/app/(app)/` avec `AppShell` (dashboard, stagiaires,
  sessions, documents, suivi Qualiopi, formations, partenaires, carte, réglages).
- **Calendrier** : `src/app/(app)/calendrier/page.tsx` +
  `src/components/CalendrierClient.tsx` — vue mois branchée sur `/api/sessions`
  (création de session, inscrits, détail). Entrée « Calendrier » dans AppShell.
- API : stagiaires, formations, sessions, enrollments, documents (generate 1→11),
  organisation, partenaires, webhook Yousign.
- **Données prêtes à utiliser** (dans `src/lib/ecole-pizza/`) :
  - `catalogue.ts` — les formations.
  - `catalogue-produits.ts` — **produits partenaires réels** (Le 5 Stagioni,
    Galbani Professionale, Mutti, Rovagnati, Noir de Bigorre, Gi.Metal…),
    fournisseurs, `parStagiaire` (marchandise reversée / stagiaire, comptée
    pour le récap annuel, JAMAIS sur le bon de commande). **Aucun prix
    renseigné** (à saisir / négocier).
  - `catalogue-ressources.ts` — **ressources pédagogiques par formation**,
    construites depuis le sommaire réel des manuels (modules + leçons).
  - `quiz-parcours.ts` — **banque de questions (1er jet)** du parcours façon
    Duolingo, sourcée des manuels, avec `ref` vers le chapitre. Certaines
    questions ont `aVerifier: true` (à valider par le formateur).
- `docs/09_SOMMAIRES_MANUELS.json` — sommaires bruts des 7 manuels techniques.

## 9. Règles métier importantes
- **Approvisionnement** : le **bon de commande** ne montre JAMAIS le nombre de
  stagiaires ; le **récapitulatif annuel** comptabilise les stagiaires
  (X marchandise × stagiaires) et sort le **listing annuel + droit à l'image**.
  Stock réel avec ruptures. Priorité aux **produits partenaires** ; alerte
  « un partenaire équivaut » quand un produit générique est choisi.
- **Comptabilité = tableau de GESTION**, pas de la compta légale (l'utilisateur
  a un expert-comptable). CA calculé depuis les inscriptions (prix × stagiaires)
  + ventes de matériel/commissions. Chaque poste de dépense en **% du CA** vs une
  **cible**, code couleur vert/orange/rouge. Cibles de départ (ajustables) :
  matières premières 25–30 %, salaires & charges 30 %, loyer 10 %, marketing/
  envois 5–10 %, énergie 5 %, divers 5 %, **dividendes visés 10 %**.
- **Espace étudiant** : documents rangés en deux temps — **inscription** (devis,
  convention/contrat, programme, règlement, CGV, droit à l'image) puis **fin**
  (attestation de fin, facture, et **certificat SEULEMENT s'il est obtenu**).
- **Parcours façon Duolingo** : carte de progression, niveaux qui se débloquent,
  mini-leçons issues des manuels, quiz avec `ref` manuel, XP/badges.

## 10. Style & conventions
- UI **en français**, ton chaleureux, artisanal (charte rouge #C1272D / crème).
- **Pas d'emojis « bruts »** dans l'UI : réutiliser le style d'icônes du projet.
- Réutiliser les composants/patterns existants (fetch → `json.data`, `toast`
  depuis `@/lib/toast`, classes CSS ci-dessus). Alias imports : `@/*` → `src/*`.
- Toute nouvelle table = **migration Prisma** + mise à jour du **seed** +
  entrée de menu dans `AppShell` si nouvelle page.
- Après chaque module : `npm run typecheck` puis `npm run build` doivent passer.

## 11. Idées validées à intégrer (au fil de l'eau)
Score de préparation **Qualiopi calculé** par dossier · **prévision de
trésorerie** (sessions + acomptes attendus) · **alertes intelligentes**
(session bientôt pleine, dossier bloqué en signature à J+8, financement non
validé à J-15) · **relance d'avis Google** post-formation · **stats débouchés
6 mois** (taux d'insertion, ventes générées).

---
*Fin du brief. Suivre ensuite les instructions du prompt de l'utilisateur.*
