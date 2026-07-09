# Impasto / ecolepizza — Security Audit (whitebox pentest)

**Date:** 2026-07-09
**Scope:** Full app — Express/MySQL API (`src/api`) + React SPA (`src/app/ui`).
**Method:** Whitebox code audit of every route → controller (authz, multi-tenant scoping, SQL safety), plus dynamic verification of the parts runnable without a live DB (JWT forgery resistance, the HTML/PDF token-render pipeline). A full live-DB DAST was not run: the sandbox has no MySQL/MariaDB and no root, and the package mirror is blocked. The **real DB was never touched.**

**Headline:** The app is, on the whole, well-built defensively — parameterized SQL everywhere, pinned-HS256 JWT, escaped document rendering, ownership checks on the learner portal, org-scoping on almost all controllers. **But `user.controller.js` is a serious hole:** it has *no* tenant scoping and lets a low-privilege admin (`SECRETARIAT`) read every tenant's users and escalate anyone to `SUPER_ADMIN`. Fix that first.

---

## Severity summary

| # | Severity | Class | Location | One-liner |
|---|----------|-------|----------|-----------|
| C1 | **Critical** | Cross-tenant IDOR / info-leak | `user.controller.js:11` | `GET /api/user/all` returns **every organisation's** users |
| C2 | **Critical** | Privilege escalation / cross-tenant takeover | `user.controller.js:63` + `user.routes.js:12` | `PATCH /api/user/:id` — no org scope, `role` + password mass-assignable, reachable by `SECRETARIAT` |
| C3 | **Critical** | Cross-tenant destructive IDOR | `user.controller.js:104` | `DELETE /api/user/:id` — no org scope |
| H1 | High | Reversible plaintext passwords | `learner.controller.js:21,55,71` | Learner passwords stored encrypted-reversible and returned decrypted by `GET /api/stagiaires` |
| H2 | High | Cross-tenant IDOR (read) | `attendance.controller.js:31` | `GET /api/attendance/:sessionId` — no org scope, leaks other tenant's learner PII |
| H3 | High | Cross-tenant IDOR (write) | `attendance.controller.js:158` | `PATCH /api/attendance/record/:id` — no org/session scope |
| H4 | High | Financial input validation | `invoice/sale/inventory` | Negative / NaN / huge amounts accepted → corrupts accounting |
| H5 | High | Cross-org object-reference injection | `invoice/sale/comptabilite` | `company_id`/`learner_id`/`enrollment_id`/`partner_id` trusted from body without ownership check |
| M1 | Medium | Broken auth-isolation | `learner.controller.js:260` | Password-reset fallback looks up user by email **without** org filter |
| M2 | Medium | Missing rate limits | `auth.routes.js` | No limiter on password-change / learner reset; login limiter is in-memory + `X-Forwarded-For`-spoofable |
| M3 | Medium | User enumeration | `auth.controller.js:55` | 409 "email in multiple orgs" + bcrypt-timing reveal account existence |
| M4 | Medium | Missing security headers | `server.js:59` | No Content-Security-Policy, no HSTS |
| M5 | Medium | IDOR in invoice export | `invoice.controller.js:24,35` | `loadInvoiceData` fetches company/lines without org scope (chains with H5) |
| L1 | Low | Token echoed in body | `auth.controller.js:93` | JWT returned in login JSON in addition to the httpOnly cookie |
| L2 | Low | Cookie flag env-dependent | `auth.controller.js:84` | `secure` only when `NODE_ENV==='production'` |
| L3 | Low | Fail-open middleware | `sectionAccess.middleware.js` | `enforceSectionMode` fails open and doesn't cover `/api/user` etc. |
| L4 | Low | Upload DoS | `template.controller.js:161` | `.docx` upload rendered by PizZip with no decompression cap (zip-bomb) |
| L5 | Low | Content sniffing | `suivi.controller.js:187` | Archived file served `inline` with attacker-influenced mime |
| L6 | Low | Invoice numbering race | `invoice.controller.js:145`, `sale.controller.js:183` | Non-atomic sequence → duplicate invoice numbers |
| L7 | Low | LIKE wildcard | `audit.controller.js:7` | `%`/`_` in `q` not escaped (minor DoS) |
| I1 | Info | Dev crypto fallback | `crypto.js:25` | Hardcoded `impasto-dev-key` — non-production only (prod refuses to boot without key) |

---

## Critical findings (fix immediately)

### C1 — `GET /api/user/all` leaks every organisation's users
`getUsers` runs `SELECT ... FROM user` with **no `WHERE organization_id`**. Any admin-tier user of org A receives the full staff list — including user IDs, emails, roles — of **all tenants**.

```
GET /api/user/all           (cookie: any SUPER_ADMIN/ADMIN_ORGANISME/SECRETARIAT)
→ 200 [ ...every user in every organisation... ]
```
**Fix:** `SELECT ${PUBLIC_FIELDS} FROM user WHERE organization_id = ?` with `[req.user.organization_id]`.

### C2 — `PATCH /api/user/:id`: privilege escalation + cross-tenant account takeover
`updateUser` (a) has **no org scope** (`WHERE id = ?` only), and (b) lists `role` in `allowedFields` with **no actor check**, and (c) accepts `password`. The route is guarded only by `authorizeRoles(...ADMIN_ROLES)` — i.e. **`SECRETARIAT` can reach it.**

Chained with C1 (which hands the attacker every user's UUID), a single `SECRETARIAT` account becomes full-platform compromise:

```
1. GET  /api/user/all                     → collect any target user id (any org)
2. PATCH /api/user/<target-id>            body {"role":"SUPER_ADMIN"}     → escalate
   PATCH /api/user/<target-id>            body {"password":"Attacker1!"}  → take over
   PATCH /api/user/<own-id>               body {"role":"SUPER_ADMIN"}     → self-escalate
```
**Fix:** scope the UPDATE with `AND organization_id = req.user.organization_id`; remove `role` from the generic whitelist and gate role changes through the same `canAssignRole` / last-owner logic used in `equipe.controller.js`; don't allow arbitrary password set here (or require the actor be admin **and** same-org).

### C3 — `DELETE /api/user/:id` deletes across tenants
`deleteUser` runs `DELETE FROM user WHERE id = ?` — no org filter. An admin of org A can delete org B's users (and cascade their data). Guarded by `SUPER_ADMIN`/`ADMIN_ORGANISME` but still cross-tenant.
**Fix:** `DELETE FROM user WHERE id = ? AND organization_id = ?`.

> Note: `createUser` in the same file is **safe** (org from token, role restricted) — the regression is only in read/update/delete. `equipe.controller.js` does all of this correctly and is the model to copy.

---

## High findings

### H1 — Reversible plaintext password storage & exposure
`createStagiaireAccount` stores `password_plain_enc = encrypt(password)` (AES-GCM, reversible) next to the bcrypt hash, and `getLearners` returns `account_password: decrypt(...)` for **every learner** to any staff role (incl. `FORMATEUR`). Anyone with staff access — or a DB dump plus the env key — recovers live learner passwords in cleartext. (Org-scoped, so not cross-tenant.)
**Fix:** stop persisting recoverable passwords; show a generated password once at creation, force change-on-first-login, and drop `password_plain_enc` from the schema and from `getLearners`.

### H2 / H3 — Attendance controller has no tenant scoping
`getAttendance` filters records only by `session_id`; `setPresence` updates `attendance_record ... WHERE id = ?` with no org/session check. A staff user who learns a foreign `sessionId`/`recordId` (UUIDs, so not enumerable, but they leak via logs, URLs, exports) can read another tenant's learners' presence + names, or flip presence and wipe `signed_at`. `signSheet` already does the correct join — copy it.
**Fix:** join `attendance_sheet → training_session` and add `AND ts.organization_id = req.user.organization_id`; 404 otherwise.

### H4 — Financial mutations accept junk values
`recordPayment` (`invoice.controller.js:199`), `createInvoice` (`:123`), `createSale` (`sale.controller.js:32`) and `inventory.updateItem` (`:84`) insert `amount`/`quantity`/`unit_price` with only a presence check. Negative, `NaN`-ish, or `1e308` values are stored and flow into the `comptabilite` aggregates.

```
POST /api/factures/<id>/payments   {"amount": -5000}     → ledger goes negative
POST /api/ventes                   {"amount": -999, "quantity": -5}
```
**Fix:** coerce with `Number()`, reject `!Number.isFinite || <0` (and sane upper bounds) before insert. `comptabilite.controller.js` already validates like this — reuse it.

### H5 — Cross-org foreign-key injection
`company_id` / `learner_id` / `enrollment_id` / `partner_id` are taken from the request body and inserted without verifying they belong to `req.user.organization_id`. Combined with M5 (unscoped `loadInvoiceData`), an attacker can attach another org's company to their own invoice and render that company's name/SIRET/address in the exported Factur-X PDF/XML.
**Fix:** validate every referenced id with `SELECT 1 ... WHERE id=? AND organization_id=?` before insert.

---

## Medium findings

- **M1** `resetStagiairePassword` fallback `SELECT id FROM user WHERE email = ?` (`learner.controller.js:260`) is not org-scoped; an email colliding across tenants lets an admin reset a foreign account. Add `AND organization_id = ?`.
- **M2** Login *is* rate-limited (10/min/IP) but the limiter is in-memory (resets on restart, useless across instances) and keys on a spoofable `X-Forwarded-For`. `PATCH /api/auth/password` and learner reset have **no** limiter. Use a shared store keyed on a proxy-validated IP.
- **M3** The 409 "plusieurs organismes utilisent cet e-mail" response and bcrypt-only-when-user-exists timing allow account enumeration. Return a generic 401.
- **M4** No `Content-Security-Policy` and no `Strict-Transport-Security`. Add a strict CSP (`default-src 'self'; object-src 'none'; frame-ancestors 'none'`) and HSTS in production (consider `helmet`).
- **M5** `loadInvoiceData` sub-queries (`company`, `invoice_line`, enrollment/learner) omit org scope; safe only because the top-level invoice fetch is scoped — but H5 defeats that. Scope them too.

## Low / Info

L1 drop the `token` field from the login response (rely on the httpOnly cookie). L2 force `secure: true` outside local dev. L3 treat `enforceSectionMode` as UX only; ensure every mutating route has an explicit role guard (it doesn't cover `/api/user`). L4 cap uncompressed size/entry count before PizZip renders an uploaded `.docx`. L5 serve archived files with `Content-Type: application/pdf` (or `octet-stream`) and validate magic bytes. L6 allocate invoice numbers inside a transaction with `SELECT ... FOR UPDATE`. L7 escape `%`/`_`/`\` in the audit `LIKE`. I1 dev-only fallback key — fine, prod refuses to boot without `SSN_ENC_KEY`.

---

## Verified OK (good news)

- **SQL injection:** none found. Every query is parameterized; the only dynamic SQL builds column lists from **hard-coded whitelists** (`allowedFields`, `LEARNER_FIELDS`, `COMPANY_FIELDS`, `TEAM_ROLES`), never from user input. No dynamic table/ORDER BY from requests.
- **JWT:** HS256 pinned; forged `alg=none`, tampered-payload, and wrong-secret tokens are all rejected (verified dynamically). Token claims (`role`, `organization_id`) come from the DB at login, never from the client. Strong secret (~255 bits est.), no insecure fallback.
- **Document/PDF XSS:** the token renderer escapes every value via `escapeHtml`; only the two signature tokens are raw, and `signatureBox` rejects any non-`data:image/` URL (verified — hostile names/addresses and a `data:text/html` signature were neutralised).
- **Learner portal:** every `espace`/document/quiz endpoint enforces ownership (`learner.user_id = req.user.id`), not just authentication.
- **Tenant scoping:** correct on the large majority of controllers (documents, sessions, enrollments, formations, quizzes, suivi/archives, invoices' top-level fetch, comptabilite, sales, inventory, partners, opcos, notifications, notes). The exceptions are the ones listed above (`user.*`, `attendance.get/setPresence`, a few FK lookups).
- **CORS:** explicit allow-list with `credentials:true` (no wildcard-with-credentials, no origin reflection).
- **Secrets:** `.env` and `seed.sql` are gitignored and untracked; DB creds and keys read from env; no hardcoded secrets in tracked files.
- **Frontend:** no JWT/password in `localStorage` (only a theme key); the two `dangerouslySetInnerHTML` uses render server-escaped or admin-authored HTML.
- **Passwords:** bcrypt (cost 10); min-length enforced on change.

---

## Recommended fix order

1. **C1–C3** — rewrite `user.controller.js` to scope by `req.user.organization_id` and remove `role`/password mass-assignment (≈15 lines; `equipe.controller.js` is the template). Highest impact, smallest change.
2. **H2/H3** — org-scope the attendance controller.
3. **H4/H5 + M5** — validate amounts and foreign-key ownership.
4. **H1** — remove reversible password storage.
5. **M1–M4, then the Low items.**

None of these require touching the database *data*; C1–C3, H2–H5, M-series are pure controller code changes. H1 and L6 involve a schema tweak (drop a column / add a transaction) which you'd apply via a migration.
