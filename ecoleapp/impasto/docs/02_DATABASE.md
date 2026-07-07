# 02 — Base de données

PostgreSQL via Prisma. Schéma complet : `prisma/schema.prisma` (**31 modèles**).

## Modèles

### Cœur métier
| Modèle | Rôle |
|---|---|
| **Organization** | Organisme de formation (multi-tenant). Identité légale + intégrations. |
| **User** | Comptes (rôles). Compatible NextAuth (Account/Session/VerificationToken). |
| **Learner** | Stagiaire (feuille « Data ») — dont `niveauRealise`, `lat`/`lng`, `departement`. |
| **Company** | Entreprise / financeur (+ représentant pour la convention). |
| **TrainingProgram** | Formation (code, durée, heures, prix, hygiène, rsCode). **+ `ordre`** (glisser-déposer) **+ `image`** (visuel du niveau). |
| **TrainingSession** | Session (année + semaine ISO, formateur, dates, statut, event Calendar). |
| **Enrollment** | Inscription stagiaire ↔ session = **le dossier**. financement, prix, acompte, `crmStage`, `conformite`. **+ jalons pipeline `devisSigne` / `acompteRecu`** **+ `priseEnCharge`** (financement tiers). |
| **EnrollmentNote** | Notes CRM (rappels). |

### Documents & signature
| Modèle | Rôle |
|---|---|
| **DocumentTemplate** | Modèle .docx + conditions d'application + jetons attendus. |
| **GeneratedDocument** | Document produit (type, statut, numéro, `docxKey`/`pdfKey`, `mergeData`). |
| **SignatureRequest** | Demande de signature (token, statut, OTP, `docHash`, `signatureDataUrl`, `proof`). |
| **SignatureRecipient** | Signataire (stagiaire / entreprise / organisme). |

### Émargement · facturation · évaluation · Qualiopi
| Modèle | Rôle |
|---|---|
| **AttendanceSheet / AttendanceRecord** | Émargement par demi-journée (horodatage, IP, image). |
| **Invoice / Payment** | Devis/acompte/facture/avoir + paiement Stripe. |
| **Evaluation** | Positionnement, satisfaction chaud/froid, financeur, manageur. |
| **QualiopiEvidence** | Pièce justificative Qualiopi par session/dossier + statut. |

### Comptabilité / gestion (module A)
| Modèle | Rôle |
|---|---|
| **Expense** | Dépense (poste `ExpenseCategory`, libellé, montant HT, fournisseur optionnel). |
| **RevenueExtra** | Produit divers hors inscriptions et hors ventes matériel (commission, subvention). |
| **AccountingSettings** | Cibles de gestion éditables par organisme (JSON) + cible dividendes. |
| **MaterialSale** | Ventes de matériel (fours, pétrins, matières premières…). |

### Développement & système
| Modèle | Rôle |
|---|---|
| **Partner / PartnerContract** | Annuaire partenaires + contrats. |
| **AuditLog** | Journal des actions sensibles, **chaîné en SHA-256** (tamper-evident). |
| **Notification** | Notifications destinées à un rôle. |
| **WebhookEvent** | Événements entrants (Yousign/Stripe/Google) + validité HMAC. |
| **ApiKey** | Clés d'API publiques (hashées). |
| Support NextAuth | **Account · Session · VerificationToken**. |

## Énumérations clés

- `Role` : SECRETARIAT · FORMATEUR · STAGIAIRE · SUPER_ADMIN · ADMIN_ORGANISME · ENTREPRISE · FINANCEUR · AUDITEUR.
- `Financement` : PARTICULIER / PROFESSIONNEL → pilote Devis et Contrat/Convention.
- `CrmStage` : pipeline PROSPECT → … → ARCHIVE (colonnes affichées : cf. 03_WORKFLOWS.md).
- `DocumentType` / `DocumentStatus` : type et avancement (A_FAIRE → GENERE → ENVOYE → SIGNE → ARCHIVE).
- `SignatureLevel` / `SignatureAuth` / `SignatureStatus` : niveau eIDAS + OTP + état.
- `ExpenseCategory` : MATIERES_PREMIERES · SALAIRES · LOYER · MARKETING · ENERGIE · DIVERS.
- `ConformiteScore` : VERT / ORANGE / ROUGE (suivi Qualiopi).
- Autres : `SessionStatus`, `InvoiceType/Status`, `PaymentStatus`, `EvaluationType`,
  `QualiopiStatus`, `NotificationType`, `WebhookSource`, `PartnerCategory`, `AttendanceSlot`.

## Nouveautés de schéma (depuis la Phase 1)

- `TrainingProgram.ordre` + `.image` — réordonnancement et visuels du catalogue Formations.
- `Enrollment.devisSigne` + `.acompteRecu` + `.priseEnCharge` — jalons du pipeline (blocage
  strict avant « Inscrit ») et financement paramétrable.
- Modèles `Expense`, `RevenueExtra`, `AccountingSettings` + enum `ExpenseCategory` — module Comptabilité.

## Commandes

```bash
npm run db:push      # synchronise le schéma (dev)
npm run db:migrate   # migration versionnée
npm run db:seed      # données de démonstration (idempotent)
npm run db:studio    # explorateur
```
