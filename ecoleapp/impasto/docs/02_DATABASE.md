# 02 — Base de données

PostgreSQL via Prisma. Le schéma complet est dans `prisma/schema.prisma`.

## Les 20 modèles métier

| Modèle | Rôle |
|---|---|
| **Organization** | L'organisme de formation (multi-tenant). Identité légale + intégrations. |
| **User** | Comptes (rôles ci-dessous). Compatible NextAuth (Account/Session/VerificationToken). |
| **Learner** | Stagiaire — champs de la feuille « Data ». |
| **Company** | Entreprise / financeur (+ représentant pour la convention). |
| **TrainingProgram** | Formation — feuille « Programmes » (code, durée, heures, prix, hygiène, rsCode). |
| **TrainingSession** | Session (année + semaine ISO, formateur, dates, statut, event Calendar). |
| **Enrollment** | Inscription stagiaire ↔ session = **le dossier** (financement, étape CRM, conformité). |
| **DocumentTemplate** | Modèle .docx + conditions d'application + jetons attendus. |
| **GeneratedDocument** | Document produit (DOCX/PDF, statut, numéro, clé Drive, mergeData). |
| **SignatureRequest** | Demande de signature Yousign (niveau, auth, statut, preuve). |
| **SignatureRecipient** | Signataire (stagiaire / entreprise / organisme). |
| **AttendanceSheet** | Feuille d'émargement par demi-journée. |
| **AttendanceRecord** | Présence signée (horodatage, IP, device, image de signature). |
| **Invoice** | Devis / acompte / facture / avoir (exonération TVA). |
| **Payment** | Paiement Stripe rattaché à une facture. |
| **Evaluation** | Positionnement, formative, satisfaction chaud/froid, financeur, manageur. |
| **QualiopiEvidence** | Pièce justificative Qualiopi par session/dossier + statut. |
| **AuditLog** | Journal des actions sensibles. |
| **Notification** | Notifications utilisateur. |
| **WebhookEvent** | Événements entrants (Yousign/Stripe/Google/Zapier) + validité HMAC. |

Modèles support : `EnrollmentNote` (CRM), `ApiKey` (API publique), et les modèles
NextAuth.

## Rôles (`Role`)

`SUPER_ADMIN · ADMIN_ORGANISME · SECRETARIAT · FORMATEUR · STAGIAIRE · ENTREPRISE · FINANCEUR · AUDITEUR`

## Énumérations clés

- `Financement` : PARTICULIER / PROFESSIONNEL → pilote Devis et Contrat/Convention.
- `CrmStage` : pipeline prospect → archivé.
- `DocumentType` / `DocumentStatus` : type et avancement (A_FAIRE → GENERE → ENVOYE → SIGNE).
- `SignatureLevel` / `SignatureAuth` : niveau eIDAS + OTP email/SMS.
- `ConformiteScore` : VERT / ORANGE / ROUGE (suivi Qualiopi).

## Commandes

```bash
npm run db:push      # synchronise le schéma (dev)
npm run db:migrate   # migration versionnée
npm run db:seed      # données École Pizza
npm run db:studio    # explorateur
```
