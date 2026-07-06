# 01 — Architecture

## Décision : application Next.js unique (pas de monorepo apps/api en Phase 1)

Le cahier des charges proposait un monorepo `apps/web` + `apps/api` (NestJS) +
`packages/*`. Pour la Phase 1, on choisit volontairement une **application
Next.js unique** (App Router) avec les modules métier rangés dans `src/lib/*`.

Pourquoi : moins de surface à maintenir pour un seul développeur, déploiement
plus simple, et les API Routes de Next suffisent largement au backend visé.
Les « packages » du cahier des charges existent sous forme de dossiers de
modules — la séparation en Turborepo reste possible plus tard sans réécriture
(les imports passent déjà par l'alias `@/lib/...`).

## Arborescence

```txt
impasto/
├── prisma/
│   ├── schema.prisma          # 20 modèles + NextAuth + enums métier
│   └── seed.ts                # organisme + 9 formations + démo
├── src/
│   ├── app/
│   │   ├── layout.tsx, page.tsx
│   │   ├── dashboard/page.tsx          # 1re page connectée (Prisma)
│   │   └── api/
│   │       ├── stagiaires/route.ts     # GET/POST + Zod + AuditLog
│   │       └── webhooks/yousign/route.ts
│   └── lib/
│       ├── db.ts                       # client Prisma singleton
│       ├── ecole-pizza/                # identité + catalogue (= packages/shared)
│       ├── documents/                  # rules, tokens, templates, generate
│       ├── signature/                  # client Yousign v3
│       └── storage/                    # Google Drive
├── docs/
├── docker-compose.yml          # PostgreSQL + Gotenberg (LibreOffice → PDF)
└── .env.example
```

## Couches

1. **Présentation** — Server/Client Components (App Router). Les pages serveur
   lisent Prisma directement ; les actions d'écriture passent par les API Routes
   ou des Server Actions.
2. **API** — `src/app/api/*` : REST scopé par organisme, validation Zod,
   journalisation `AuditLog`.
3. **Domaine** — `src/lib/*` : règles métier pures, testables hors app
   (génération documentaire, dates ISO, sélection des templates).
4. **Intégrations** — Yousign, Google, Stripe : toujours côté serveur, secrets
   via `process.env`, jamais renvoyés au client.

## Sécurité (principes)

- Multi-tenant : tout est filtré par `organizationId`.
- Secrets uniquement en variables d'environnement (`.env.local`, jamais commité).
- Webhooks vérifiés (HMAC Yousign, signature Stripe).
- `AuditLog` sur chaque action sensible.
- Clés d'API publiques hashées en base (`ApiKey.keyHash`).
