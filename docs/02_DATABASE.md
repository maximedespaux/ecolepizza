# 02 — Base de données

MySQL / MariaDB, **SQL brut** (pas d'ORM). Schéma complet : `database/schema.sql`.
Conventions : identifiants `uuid` (`DEFAULT uuid()`, MariaDB 10.7+), noms de
colonnes en `snake_case`, énumérations natives, `organization_id` sur presque
toutes les tables (multi-tenant). Les ajouts se font par fichiers de migration
dans `database/migrations/` (exécutés à la main — voir la note en bas).

## Tables

### Cœur métier
| Table | Rôle |
|---|---|
| **organization** | Organisme de formation (identité légale, SIRET, `vat_number`, Qualiopi). |
| **user** | Comptes de connexion + rôle. Mot de passe `bcrypt`. |
| **learner** | Stagiaire (fiche « Data » complète). N° de sécu chiffré (`social_security`). Lié à un `user` (compte stagiaire) et à une `company`. |
| **company** | Entreprise / financeur (représentant pour la convention). |
| **training_program** | Formation (code, titre, `days`, `hours`, `price`, `hygiene`, `rs_code`). |
| **training_session** | Session (`year` + `week` ISO, dates, `status`, formateur). |
| **enrollment** | Inscription stagiaire ↔ session = **le dossier**. `financing`, `price`, `acompte`, `crm_stage`, `conformite_score`. |
| **enrollment_note** | Notes de suivi CRM. |

### Documents & signature
| Table | Rôle |
|---|---|
| **generated_document** | Document préparé pour un stagiaire (`type`, `title`, `status`, `sent_at`, `signed_at`, `signer_name`, `signature_data`). Le tracé de signature est stocké ici (cf. `05_SIGNATURE.md`). |
| **document_formation** | Table de liaison document ↔ inscription(s) (regroupement de formations sur un même document). |

### Émargement · facturation · Qualiopi
| Table | Rôle |
|---|---|
| **attendance_sheet / attendance_record** | Émargement par demi-journée (présence). |
| **invoice / payment** | Devis/facture/avoir + paiements. Champs `buyer_name`, `description`, `tva_exoneree`. |
| Suivi Qualiopi | Le score de conformité (`enrollment.conformite_score`) est calculé depuis l'état documentaire — pas de table de preuves dédiée (cf. `06_QUALIOPI.md`). |

### Comptabilité de gestion (migration 005)
| Table | Rôle |
|---|---|
| **expense** | Dépense (`category` = poste, `label`, `amount_ht`, `supplier_id`?). |
| **revenue_extra** | Produit divers hors inscriptions/ventes (`category` = COMMISSION/SUBVENTION/AUTRE, `amount`). |
| **accounting_settings** | Cibles de gestion (JSON `targets`) + `dividende_cible`, un enregistrement par organisme. |
| **material_sale** | Ventes de matériel (`product`, `category`, `quantity`, `amount`, `learner_id`?). |

### Développement & système
| Table | Rôle |
|---|---|
| **partner** | Annuaire partenaires (fournisseurs). |
| **inventory_item** | Stock de matériel à vendre (`quantity`, `unit_price`, `tax_rate`, `threshold`). |
| **audit_log** | Journal des actions sensibles (`action`, `entity`, `entity_id`, `user_id`). |
| **notification** | Notifications destinées à l'organisme (`type`, `title`, `body`, `read_at`). |

## Énumérations clés

- **`user.role`** : `SUPER_ADMIN` · `ADMIN_ORGANISME` · `SECRETARIAT` ·
  `FORMATEUR` · `STAGIAIRE` · `ENTREPRISE` · `FINANCEUR` · `AUDITEUR`.
  Regroupées côté API en `STAFF_ROLES`, `ADMIN_ROLES`, `AUDIT_ROLES`
  (voir `08_PAGES.md`).
- **`financing`** (learner & enrollment) : `PARTICULIER` / `PROFESSIONNEL` →
  pilote le choix Devis et Contrat/Convention.
- **`enrollment.crm_stage`** : `PROSPECT` · `CONTACTE` · `DEVIS_ENVOYE` ·
  `DEVIS_SIGNE` · `ACOMPTE_PAYE` · `INSCRIT` · `EN_FORMATION` · `TERMINE` ·
  `EVALUATION_ENVOYEE` · `ARCHIVE` (colonnes du pipeline).
- **`enrollment.conformite_score`** : `VERT` / `ORANGE` / `ROUGE` (suivi Qualiopi).
- **`generated_document.status`** : `A_FAIRE` → `ENVOYE` → `SIGNE`.
- **`training_session.status`** : `PLANIFIEE` · `CONFIRMEE` · `EN_COURS` ·
  `TERMINEE` · `ANNULEE`.
- **`expense.category`** : `MATIERES_PREMIERES` · `SALAIRES` · `LOYER` ·
  `MARKETING` · `ENERGIE` · `DIVERS`.

## Différences assumées vs `dev` (Prisma/PostgreSQL)

Le schéma `dev` compte ~31 modèles Prisma dont plusieurs propres à sa pile qui
**n'existent pas ici** volontairement : support NextAuth (`Account`, `Session`,
`VerificationToken`), `ApiKey`, `WebhookEvent`, ainsi que les champs de preuve
Yousign (OTP, hash, JSON de preuve). La « Carte des stagiaires » est portée mais
au niveau **département** (agrégée depuis `learner.zip_code`), sans colonnes de
géolocalisation par stagiaire (voir `08_PAGES.md`).

## Nettoyage (migration 007)

Six tables héritées de la fondation Prisma d'ecolepizza n'étaient référencées par
aucun contrôleur et ont été supprimées : `document_template`, `signature_request`,
`signature_recipient`, `evaluation`, `qualiopi_evidence`, `partner_contract`
(ainsi que la colonne `generated_document.template_id`). Voir
`database/migrations/007_drop_unused_tables.sql`.

## Note sur les migrations

Les modifications de structure sont fournies sous forme de fichiers SQL dans
`database/migrations/` et **exécutées manuellement** par l'exploitant :

```bash
mysql -u root -p gds_doc_gestionary < database/migrations/005_comptabilite.sql
```

Le processus ne modifie jamais la base en production automatiquement.
