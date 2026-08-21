# Spécification technique

## Vue globale du projet

- **Nom du projet :** Impastio
- **Client :** École Pizzaïolo Jean-Jacques Despaux (« École Pizza »)
- **Chef de projet :** Guillaume Despaux
- **Document créé le :** 06/07/2026
- **Dernière modification :** 06/07/2026

## Table des matières

- [Spécification technique](#spécification-technique)
  - [Vue globale du projet](#vue-globale-du-projet)
  - [Table des matières](#table-des-matières)
  - [Stack technique](#stack-technique)
  - [Architecture](#architecture)
    - [Principe : simple et découplé](#principe--simple-et-découplé)
    - [Arborescence](#arborescence)
    - [Couches](#couches)
  - [Base de données](#base-de-données)
    - [Tables métier](#tables-métier)
    - [Rôles](#rôles)
    - [Champs à valeurs contraintes](#champs-à-valeurs-contraintes)
  - [Génération documentaire](#génération-documentaire)
    - [Pipeline](#pipeline)
    - [Choix des modèles](#choix-des-modèles)
    - [Jetons](#jetons)
    - [Classement des sorties](#classement-des-sorties)
  - [Signature électronique](#signature-électronique)
  - [API REST](#api-rest)
  - [Intégrations](#intégrations)
  - [Sécurité](#sécurité)
  - [Environnement et commandes](#environnement-et-commandes)

## Stack technique

Stack volontairement **simple**, alignée sur le projet `doc_gestionary` : pas de
Next.js, pas de Prisma, pas de Docker.

- **Front** : **React + Vite** avec **React Router**. Style via un **design
  system CSS maison** (charte École Pizza : bleu marine + rouge tomate, police
  Mulish, thème clair/sombre) — pas de framework CSS, pour rester simple.
  Empaquetable en application de bureau via Electron (optionnel).
- **API** : **Node.js + Express** (REST).
- **Base de données** : **MySQL**, accédée directement via le pilote `mysql2`
  (pool de connexions, requêtes SQL) — sans ORM.
- **Authentification** : **JWT** (`jsonwebtoken`) + mots de passe hashés avec
  **bcrypt**, cookies via `cookie-parser`.
- **Documents** : **docxtemplater** pour remplir les modèles `.docx`, conversion
  PDF via LibreOffice en ligne de commande (headless), sans conteneur.
- **Signature** : **Yousign v3** (simple API HTTP).
- **Intégrations** : Google APIs (Gmail, Drive, Calendar), Stripe.

## Architecture

### Principe : simple et découplé

Deux applications indépendantes dans un même dépôt : un **front React (Vite)** et
une **API Node/Express**. Elles communiquent en HTTP (JSON). Ce découplage reste
léger à maintenir pour un développeur seul et se déploie simplement (front
statique + serveur Node), sans orchestration de conteneurs.

### Arborescence

```txt
impastio/
├── src/
│   ├── app/                     # Front React + Vite
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   ├── public/brand/        # logo, Qualiopi (charte École Pizza)
│   │   └── ui/
│   │       ├── main.jsx         # routeur + providers
│   │       ├── api/             # client HTTP vers l'API (apiClient.js)
│   │       ├── layouts/         # coquille de page (AppLayout : sidebar + topbar)
│   │       ├── components/      # UI réutilisable (Sidebar, Topbar, Card, Kpi,
│   │       │                    #  Badge, Field, PageHead, ThemeToggle…)
│   │       ├── pages/           # écrans : dashboard, stagiaires, sessions,
│   │       │                    #  formations, suivi, partenaires, login, 404
│   │       ├── context/         # état global (UserContext, ThemeContext)
│   │       ├── lib/             # helpers (nav, format, couleurs)
│   │       └── styles/          # design system CSS (app.css)
│   └── api/                     # API Node.js + Express
│       ├── server.js            # point d'entrée Express
│       ├── config/
│       │   ├── database.js      # pool MySQL (mysql2)
│       │   └── .env             # secrets (jamais commité)
│       ├── routes/              # définition des routes REST
│       ├── controllers/         # logique par ressource
│       └── middlewares/         # auth (JWT), validation
├── templates/                   # 24 modèles Word (.docx) réels
├── database/                    # scripts SQL (schéma + données de démo)
└── docs/
```

### Couches

1. **Présentation** — React + Vite. Les pages appellent l'API via un client HTTP
   (`ui/api/apiClient.js`) ; l'état partagé passe par des Contexts React.
2. **API** — Express (`src/api`) : routes REST par ressource, contrôleurs,
   validation et journalisation. Cloisonnement par organisme.
3. **Domaine** — modules métier réutilisables côté API (règles de sélection des
   modèles, dates ISO, assemblage des jetons, calcul du score de conformité).
4. **Intégrations** — Yousign, Google, Stripe : toujours côté API, secrets via
   variables d'environnement, jamais renvoyés au front.

## Base de données

MySQL, via le pilote `mysql2` (pool de connexions, requêtes SQL). Le schéma et les
données de démonstration sont fournis sous forme de **scripts SQL** dans
`database/` (pas de migration ORM).

### Tables métier

| Table | Rôle |
|---|---|
| **organization** | L'organisme de formation (multi-organisme) : identité légale + intégrations. |
| **user** | Comptes utilisateurs (rôles ci-dessous), mot de passe hashé (bcrypt). |
| **learner** | Stagiaire. |
| **company** | Entreprise / financeur (+ représentant pour la convention). |
| **training_program** | Formation (code, durée, heures, prix, hygiène, code RS). |
| **training_session** | Session (année + semaine ISO, formateur, dates, statut). |
| **enrollment** | Inscription stagiaire ↔ session = **le dossier** (financement, étape CRM, conformité). |
| **document_template** | Modèle `.docx` + conditions d'application + jetons attendus. |
| **generated_document** | Document produit (DOCX/PDF, statut, numéro, données de fusion). |
| **signature_request** | Demande de signature Yousign (niveau, auth, statut). |
| **signature_recipient** | Signataire (stagiaire / entreprise / organisme). |
| **attendance_sheet** | Feuille d'émargement par demi-journée. |
| **attendance_record** | Présence signée (horodatage). |
| **invoice** | Devis / acompte / facture / avoir (exonération TVA). |
| **payment** | Paiement (Stripe) rattaché à une facture. |
| **evaluation** | Positionnement, formative, satisfaction chaud/froid, financeur, manageur. |
| **qualiopi_evidence** | Pièce justificative Qualiopi par session/dossier + statut. |
| **audit_log** | Journal des actions sensibles (action + entité). |
| **notification** | Notifications utilisateur. |
| **material_sale** | Ventes de matériel (fours, pétrins, matières premières…). |

Tables support : `enrollment_note` (CRM), `partner` / `partner_contract`
(partenaires).

> **Simplification volontaire.** Le schéma reprend la fondation Prisma du projet
> `ecolepizza`, mais **retire tout ce qui relève des jetons / secrets** : modèles
> NextAuth (`Account`, `Session`, `VerificationToken`), `ApiKey`, `WebhookEvent`,
> ainsi que les champs OTP, hash et JSON de preuve de la signature. On garde le
> métier utile, pas la plomberie de sécurité externe.

### Rôles

`SUPER_ADMIN · ADMIN_ORGANISME · SECRETARIAT · FORMATEUR · STAGIAIRE ·
ENTREPRISE · FINANCEUR · AUDITEUR`

L'accès aux pages est piloté côté front (navigation conditionnelle) et vérifié
côté API par un middleware d'autorisation.

### Champs à valeurs contraintes

Représentés par des colonnes `ENUM` MySQL (ou des tables de référence) :

- **financement** : `PARTICULIER` / `PROFESSIONNEL` → pilote le choix du Devis et
  du Contrat/Convention.
- **crm_stage** : pipeline du prospect à l'archivage.
- **document_type** / **document_status** : type et avancement
  (`A_FAIRE → GENERE → ENVOYE → SIGNE`).
- **signature_level** / **signature_auth** : niveau eIDAS + OTP e-mail/SMS.
- **conformite_score** : `VERT` / `ORANGE` / `ROUGE` (suivi Qualiopi).

## Génération documentaire

### Pipeline

1. `assembleVariables()` construit la table `{ Jeton: valeur }` à partir de
   l'organisme, du stagiaire, de la formation, de la session et de l'entreprise.
2. `renderDocx(templateBuffer, mergeData)` remplit le `.docx` via **docxtemplater**
   (délimiteurs `{ }`).
3. Conversion en PDF via **LibreOffice** en ligne de commande headless
   (`libreoffice --headless --convert-to pdf`), appelée depuis Node — sans Docker.
4. Le fichier est nommé, classé, puis enregistré dans `generated_document`
   (statut `GENERE`).

Le registre des **24 modèles** regroupe les documents par type : Devis ×3,
Contrat/Convention ×3, Convocation, Invitation, Droit à l'image, Émargement ×5,
Attestation hygiène, Certificat, CGV, Fiche semaine, Évaluations. Chaque entrée
porte ses fichiers, ses jetons et, si le document est signable, ses signataires +
niveau + mode OTP par défaut.

### Choix des modèles

- **Devis** : RS7404 → « Devis RS7404 » ; sinon particulier → « Devis
  Particulier » ; sinon « Devis Entreprise ».
- **Contrat vs Convention** : particulier → Contrat ; professionnel → Convention.
- **Émargement** : `Feuille d'émargement {jours}J` (ou `5J + hygiène` pour NIV1H).
- **Convocation** : RS7404 → Convocation examen ; sinon Invitation.

### Jetons

Les modèles utilisent l'orthographe exacte des `.docx` (à conserver telle quelle,
y compris les fautes historiques comme `Niveau suggérer` ou `Siret` sans accent) :

```
{Personne} {Adresse} {Téléphone} {Email}
{Semaine de la formation} {Niveau suggérer} {Date} {endDate} {Today}
{Heures} {Jours} {DuréeDétail} {Déroulé} {Objectifs} {ObjectifG} {Public}
{Prix} {Offre} {Acompte}
{Nom entreprise} {Siret} {Civ représentant} {Nom représentant}
{D_Naissance}
```

### Classement des sorties

```
Documents formation/{annee}/SEM {semaine}/{NOM Prénom}/{num}. {Type}.pdf
```

## Signature électronique

**La signature s'exécute exclusivement côté API** ; la clé Yousign ne doit jamais
atteindre le navigateur.

Flux :

1. `createSignatureRequest(name, level)` → demande en brouillon.
2. `uploadDocument(requestId, pdf, filename)` → attache le PDF.
3. `addSigner(requestId, documentId, signer)` → ajoute chaque signataire avec son
   mode d'authentification (`otp_email` / `otp_sms`).
4. `activate(requestId)` → envoie les invitations.
5. `providerRequestId` est sauvegardé dans `signature_request`.
6. **Webhook** `signature_request.done` (HMAC SHA-256, en-tête
   `X-Yousign-Signature-256`) : vérification → téléchargement du PDF signé +
   dossier de preuve → stockage Drive → statut `SIGNEE` → e-mail automatique.

Réglages par défaut :

| Document | Niveau | Auth |
|---|---|---|
| Devis | simple | OTP e-mail/SMS |
| Contrat / Convention | avancée | OTP SMS |
| Droit à l'image | simple | OTP e-mail |
| Certificat | signature organisme (cachet) | — |

Sandbox : `https://api-sandbox.yousign.app/v3`. Niveaux eIDAS : simple, avancé,
qualifié.

## API REST

API Express cloisonnée par organisme. Authentification : **JWT** (session interne)
ou clé d'API hashée (`api_key`) pour l'accès externe. Rate limit + `audit_log`.
CORS restreint aux origines autorisées (front local et déploiement).

```
POST   /api/auth/login            # connexion (JWT)
GET    /api/stagiaires            # liste (filtre ?q=)
POST   /api/stagiaires            # création
GET    /api/formations
POST   /api/sessions
POST   /api/documents/generate    # génère DOCX/PDF d'un dossier
POST   /api/signatures/send       # envoie en signature (Yousign)
GET    /api/documents/:id/download
POST   /api/webhooks/yousign      # HMAC SHA-256
POST   /api/webhooks/stripe
```

Conventions :

- Réponses : `{ "data": ... }` (succès) ou `{ "error": ..., "details": ... }`.
- Codes : 200/201 succès, 400 requête invalide, 401 non authentifié/clé invalide,
  403 permission, 422 validation, 429 rate limit.
- Sécurité : `Authorization: Bearer <token|api_key>`, permissions par rôle
  (middleware), journalisation systématique.

## Intégrations

- **Google** : Gmail (envoi d'e-mails), Drive (classement des documents),
  Calendar (événement de session), import Sheets/Forms (reprise de l'existant).
- **Yousign v3** : signature électronique et preuve.
- **Stripe** : paiements et relances.

Toutes les intégrations sont côté API ; les secrets vivent en variables
d'environnement (`src/api/config/.env`).

## Sécurité

- **Multi-organisme** : toute requête est filtrée par `organization_id`.
- **Secrets** uniquement en variables d'environnement (`.env`, jamais commité).
- **Mots de passe** hashés avec bcrypt ; sessions signées par JWT.
- **Données personnelles sensibles** : le n° de sécurité sociale est chiffré au
  repos (AES-256-GCM, clé `SSN_ENC_KEY`) ; il est déchiffré uniquement à la
  lecture d'un dossier par un rôle autorisé, jamais renvoyé dans les listes.
- **Webhooks** vérifiés (HMAC Yousign, signature Stripe).
- **audit_log** sur chaque action sensible.
- **Clés d'API** publiques hashées en base.
- **CORS** restreint aux origines autorisées.
- **RGPD** : les données personnelles réelles (photos stagiaires, contrats)
  restent dans la base MySQL du client et le Drive privé, jamais dans le dépôt.

## Environnement et commandes

```bash
# --- API (src/api) ---
cd src/api
npm install
cp config/.env.example config/.env   # DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
mysql -u root -p impasto < ../../database/schema.sql   # créer les tables
mysql -u root -p impasto < ../../database/seed.sql     # organisme + 9 formations
npm run dev                           # nodemon → http://localhost:3000

# --- Front (src/app) ---
cd src/app
npm install
npm run dev:react                     # Vite → http://localhost:5173
npm run build                         # build de production
npm run lint                          # ESLint
```
