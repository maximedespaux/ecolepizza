# Impasto — logiciel de gestion pour organisme de formation

Impasto est le logiciel de secrétariat de l'**École Pizzaïolo Jean-Jacques
Despaux** (« École Pizza »). Il remplace l'ancienne solution bricolée sur la
suite Google (Sheets, Docs, Forms) par une application unique qui gère les
stagiaires, produit automatiquement les documents administratifs, les fait
signer électroniquement, suit l'émargement et prépare les preuves Qualiopi.

> Ce dépôt contient uniquement la **documentation projet**, organisée selon la
> même architecture que le projet `doc_gestionary`. Le contenu provient de
> l'application `impasto` existante, réécrit pour être clair et cohérent.

## Documentation

| Document | Contenu |
|---|---|
| [`document/management/call_for_tender.md`](document/management/call_for_tender.md) | Cadrage, besoin métier, périmètre de l'appel d'offre. |
| [`document/functional/functional_specification.md`](document/functional/functional_specification.md) | Ce que fait l'application, pour qui, et ce qui est hors périmètre. |
| [`document/technical/technical_specification.md`](document/technical/technical_specification.md) | Architecture, stack, base de données, API, génération documentaire, signature, sécurité. |
| [`document/quality/test_plan.md`](document/quality/test_plan.md) | Suivi Qualiopi, score de conformité, stratégie de tests. |

## En bref

- **Client** : École Pizzaïolo Jean-Jacques Despaux — centre de formation
  pizzaïolo certifié Qualiopi (Lannemezan, 65).
- **Utilisateurs** : secrétariat, formateur, stagiaires, entreprises,
  financeurs, auditeurs.
- **Objectif** : automatiser le secrétariat (dossiers, documents, signatures,
  Qualiopi) pour gagner du temps et fiabiliser la conformité.
- **Stack** : React + Vite (front) · Node.js + Express (API REST) · MySQL ·
  docxtemplater (documents) · Yousign v3 (signature) · Google APIs · Stripe.
  Stack volontairement simple : pas de Next.js, pas de Prisma, pas de Docker.

## Structure du projet (application)

```txt
src/
├── app/   # front React + Vite (+ Tailwind, React Router)
└── api/   # API Node.js + Express (routes, controllers, config, middlewares)
```

## Démarrage rapide (application)

```bash
# API (src/api)
cd src/api
npm install
cp config/.env.example config/.env   # renseigner DB_* et JWT_SECRET
npm run dev                           # http://localhost:3000

# Front (src/app)
cd src/app
npm install
npm run dev:react                     # http://localhost:5173
```

La base MySQL est créée à partir du script SQL fourni ; aucune conteneurisation
n'est nécessaire.
