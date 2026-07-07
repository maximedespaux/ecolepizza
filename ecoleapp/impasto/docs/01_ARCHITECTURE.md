# 01 — Architecture

## Décision : application Next.js unique (pas de monorepo)

Application **Next.js unique** (App Router) avec les modules métier rangés dans
`src/lib/*`. Les imports passent par l'alias `@/*` → `src/*`, ce qui laisse la porte
ouverte à une future extraction en Turborepo sans réécriture.

## Couches

1. **Présentation** — `src/app/(app)/*/page.tsx` : Server Components qui lisent Prisma
   directement, associés à des `src/components/*Client.tsx` pour l'interactivité. Les
   écritures passent par les API Routes.
2. **API** — `src/app/api/*/route.ts` : REST scopé par organisme, validation Zod,
   journalisation `AuditLog`, réponses `{ data }` / `{ error }`.
3. **Domaine** — `src/lib/*` : règles métier pures (documents, signature, compta, pédago),
   testables hors app.
4. **Intégrations** — Gotenberg, Yousign, Google, Stripe : toujours côté serveur, secrets
   via `process.env`, jamais renvoyés au client.

## Arborescence

```txt
impasto/
├── prisma/
│   ├── schema.prisma          # 31 modèles + enums (cf. 02_DATABASE.md)
│   └── seed.ts                # organisme + 9 formations + 23 partenaires + démo (idempotent)
├── src/
│   ├── app/
│   │   ├── (app)/             # pages connectées, sous AppShell + garde de rôle
│   │   │   ├── dashboard/      stagiaires/   calendrier/  sessions/
│   │   │   ├── documents/      suivi/        comptabilite/ formations/
│   │   │   ├── partenaires/    carte/        ventes/       reglages/
│   │   │   ├── audit/          mon-espace/   (espace stagiaire)
│   │   ├── login/             # connexion (démo + stagiaire réel)
│   │   ├── signer/[token]/    # page publique de signature
│   │   └── api/               # 34 routes REST (cf. 07_API.md)
│   ├── components/
│   │   ├── AppShell.tsx        RoleProvider.tsx  Toaster.tsx
│   │   ├── *Client.tsx         # une par page (Comptabilite, Sessions, Carte, Documents…)
│   │   ├── calendrier/         # PipelineBoard, SessionDrawer, shared
│   │   ├── student/            # DoughCalculator
│   │   └── ui/                 # AnimatedNumber…
│   └── lib/
│       ├── db.ts               # client Prisma singleton + audit chaîné SHA-256
│       ├── audit.ts  toast.ts  pedago.ts
│       ├── auth/               # roles, profiles (démo), password
│       ├── compta/             # targets (cibles de gestion + couleurs)
│       ├── documents/          # rules, tokens, templates, template-files,
│       │                       # generate (Gotenberg), produce, conformite
│       ├── signature/          # proof (SHA-256/OTP), attestation (PDF preuve), yousign
│       ├── storage/            # local (mini-Drive app-managed), drive (stub Google)
│       └── ecole-pizza/        # organisme, catalogue(s), partenaires, assets (visuels)
├── templates/                 # 24 modèles Word (.docx) réels
├── public/ecole/              # visuels des niveaux + logo + qualiopi
├── docs/                      # documentation
├── docker-compose.yml         # PostgreSQL + Gotenberg
└── .storage/                  # fichiers générés/signés par stagiaire (non versionné)
```

## Chaîne documentaire (DOCX → PDF → signé)

```txt
Modèle .docx (templates/)  ──docxtemplater──►  DOCX rempli
        │                                          │
        │                                    Gotenberg (LibreOffice)
        │                                          ▼
   template-files.ts                           PDF fidèle ──┐
   (choix du modèle selon                                   │  Gotenberg (Chromium + merge)
    financement / RS / durée)      attestation.ts (HTML) ───┤
                                   + tracé + SHA-256         ▼
                                                       PDF SIGNÉ (document + attestation)
                                                             │
                                                      storage/local.ts (.storage/…)
```

## Sécurité (principes)

- Multi-tenant : tout est filtré par `organizationId`.
- **Audit inviolable** : `AuditLog` chaîné en SHA-256 (extension Prisma dans `db.ts`).
- **Contrôle d'accès étudiant côté serveur** : la route de téléchargement vérifie la
  propriété du document ET la complétude du dossier (devis signé + acompte reçu) avant
  de servir un fichier — pas seulement l'UI.
- Signature vérifiée par empreinte SHA-256 du PDF ; dossier de preuve (IP, horodatage, OTP).
- Secrets uniquement en variables d'environnement (`.env`, jamais commité).
- Webhooks vérifiés (HMAC Yousign, signature Stripe).
