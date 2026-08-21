# 08 — Logique de chaque page

Ce chapitre décrit, page par page, **ce que fait chaque écran**, **qui y a accès**
et **quels endpoints il utilise**. C'est la transposition, dans la pile `rewrite`
(React + Vite + Express + MySQL), de la logique décrite dans les docs `dev`.

## Modèle de rôles (3 niveaux internes + stagiaire)

| Groupe | Rôles | Portée |
|---|---|---|
| **Bureau** (`ADMIN_ROLES`) | `SUPER_ADMIN`, `ADMIN_ORGANISME`, `SECRETARIAT` | Accès complet. |
| **Formateur** | `FORMATEUR` | Accès **pédagogique restreint** (voir ci-dessous). |
| **Auditeur** | `AUDITEUR` | Consultation Suivi Qualiopi + Journal d'audit. |
| **Stagiaire** | `STAGIAIRE` | Espace stagiaire uniquement (autre interface). |

`STAFF_ROLES` = bureau + formateur ; `AUDIT_ROLES` = bureau + auditeur.

**Ce que le formateur peut faire** : consulter le tableau de bord, consulter les
sessions et **signer la feuille d'émargement**, consulter les **formations et leur
programme**, consulter les stagiaires (lecture seule), enregistrer un **produit
divers**. **Ce qu'il ne peut pas faire** : Pipeline CRM, Partenaires, Inventaire,
Ventes, Facturation, tableau Comptabilité, Réglages, Journal d'audit, gestion des
comptes, ni créer/modifier sessions, stagiaires ou documents.

Le choix de l'interface se fait dans `main.jsx` : `role === 'STAGIAIRE'` → espace
stagiaire (`StudentLayout`) ; sinon application bureau (`AppLayout`). Chaque route
est en plus protégée par `<RoleRoute roles={…}>`, et le menu latéral (`lib/nav.js`)
masque les entrées non autorisées.

---

## Application bureau

### Tableau de bord — `pages/Dashboard.jsx`
**Accès : STAFF (formateur inclus).** Vue d'ensemble : indicateurs clés (nombre de
stagiaires, formations, sessions, dossiers, ventes) et derniers événements. Charge
en parallèle et **tolère les refus** (`Promise.allSettled`) : `getStagiaires`,
`getFormations`, `getSessions`, `getEnrollments`, `getSales`, `getAudit`,
`getOrganisation`. Pour un formateur, les widgets alimentés par des endpoints
bureau restent simplement vides.

### Stagiaires — `pages/Stagiaires.jsx`
**Accès : STAFF en lecture ; écritures réservées au bureau.** Liste avec
**recherche en direct** (`GET /stagiaires?q=` à chaque frappe), bouton **« + »**
qui affiche/masque le formulaire d'ajout (fiche complète : identité, coordonnées,
parcours, financement, n° de sécu chiffré), et **édition en ligne** par un bouton à
droite de chaque nom. Endpoints : `getStagiaires`, `createStagiaire`,
`updateStagiaire`, `resetStagiairePassword`. Un compte de connexion stagiaire est
créé automatiquement (mot de passe généré, visible côté admin).

### Détail stagiaire — `pages/StagiaireDetail.jsx`
**Accès : bureau (lecture STAFF).** Fiche du stagiaire, ses **documents**
(préparer, prévisualiser en HTML, **envoyer**), ses **notes CRM**, ses dossiers.
Endpoints : `getStagiaire`, `getLearnerDocuments`, `createDocument`, `getDocument`,
`sendDocument`, `getNotes`/`createNote`/`deleteNote`.

### Pipeline CRM — `pages/Pipeline.jsx`
**Accès : bureau.** Kanban à 10 colonnes (`crm_stage`). Chaque carte = un dossier
(stagiaire, code formation, semaine/année, score de conformité). Flèches ◀ ▶ pour
faire reculer/avancer l'étape (`PATCH /enrollments/:id`), mise à jour **optimiste**
avec resynchronisation en cas d'erreur. Endpoints : `getEnrollments`,
`updateEnrollment`.

### Sessions — `pages/Sessions.jsx`
**Accès : lecture STAFF ; création/suppression bureau.** Calendrier mensuel. On
**ajoute une session** en choisissant une formation puis le premier jour : la durée
se colore automatiquement sur les jours ouvrés. Chaque session affiche son nombre
de stagiaires. Suppression de session possible (garde-fou côté API). Endpoints :
`getSessions`, `createSession`, `deleteSession`.

### Détail session — `pages/SessionDetail.jsx`
**Accès : STAFF pour l'émargement ; inscriptions réservées au bureau.**
Détail d'une session : liste des inscrits, **ajout/retrait** de stagiaires
(recherche + « + Ajouter »), et **émargement** (`components/Emargement.jsx`) par
demi-journée. Un clic sur un stagiaire ouvre sa fiche. Endpoints : `getSession`,
`createEnrollment`/`deleteEnrollment` (bureau), `getAttendance`,
`generateAttendance`, `setPresence`.

### Suivi Qualiopi — `pages/Suivi.jsx`
**Accès : bureau + auditeur.** Dossiers **incomplets en premier**, chacun
dépliable, avec une **feuille de route** (`Roadmap.jsx` : gris/orange/vert) et le
score de conformité. Endpoint : `getSuivi`. Voir `06_QUALIOPI.md`.

### Formations — `pages/Formations.jsx`
**Accès : STAFF (le formateur consulte les programmes).** Catalogue des formations
en cartes (code, titre, durée, heures, prix, hygiène, certifiante). Endpoint :
`getFormations`.

### Produit divers — `pages/ProduitDivers.jsx`
**Accès : STAFF — surface pensée pour le formateur.** Écran allégé pour
**enregistrer un produit divers** (commission, subvention, remboursement) sans
ouvrir tout le tableau Comptabilité : formulaire (libellé, type, montant, date) +
liste de l'année avec total et suppression. Endpoints : `getRevenues`,
`createRevenue`, `deleteRevenue`.

### Partenaires — `pages/Partenaires.jsx`
**Accès : bureau.** Annuaire des partenaires (filtrage par catégorie), création.
Endpoints : `getPartenaires`, `createPartenaire`.

### Inventaire — `pages/Inventaire.jsx`
**Accès : bureau.** Stock de matériel en cartes : quantité (boutons +/−), prix HT,
taux de TVA, seuil d'alerte, création et **modification** d'un article existant,
suppression. Une **pastille** de navigation signale les articles sous le seuil.
Endpoints : `getInventory`, `createItem`, `adjustItem`, `updateItem`, `deleteItem`,
`sellItem`.

### Ventes de matériel — `pages/Ventes.jsx`
**Accès : bureau.** Point de vente : **panier** avec menu déroulant des produits
**groupés par catégorie**, ajout d'un acheteur (stagiaire ou nom libre), **remise**
en % (décimale). À la validation (`checkout`), le stock est décrémenté et une
**facture est créée automatiquement** avec les infos de l'acheteur. Endpoints :
`getSales`, `checkoutSale`, `deleteSale`.

### Facturation — `pages/Factures.jsx`
**Accès : bureau.** Liste des factures (statut, montant), enregistrement de
paiements, **aperçu** et **téléchargement Factur-X** (PDF/A-3 + XML), export du XML
seul. Une **pastille** signale les impayés. Endpoints : `getInvoices`,
`createInvoice`, `updateInvoice`, `recordPayment`, `deleteInvoice`,
`downloadFacturX`, `facturXUrl`, `downloadInvoiceXml`. Voir `04_DOCUMENTS.md`.

### Comptabilité — `pages/Comptabilite.jsx`
**Accès : bureau.** Deux onglets. **Gestion** : CA calculé automatiquement
(inscriptions + ventes de matériel + produits divers), dépenses par **poste en %
du CA vs cible** (vert/orange/vert), **camemberts** (répartition CA et dépenses),
simulation de **dividendes** plafonnée par la marge, saisie de dépenses et de
produits divers, cibles éditables. **Performance** : récapitulatif annuel comparé à
**N-1** (CA, stagiaires, ticket moyen, marge, dépenses par poste). Endpoints :
`getComptabilite`, `getComptaPerformance`, `createExpense`/`deleteExpense`,
`createRevenue`/`deleteRevenue`, `saveComptaTargets`. Logique des cibles dans
`lib/compta.js`.

### Organisme (Réglages) — `pages/Reglages.jsx`
**Accès : bureau.** Formulaire d'identité de l'organisme (raison sociale, SIRET,
n° TVA, NDA, NAF/APE, coordonnées, Qualiopi) — ces valeurs alimentent les documents
et les factures. Endpoints : `getOrganisation`, `updateOrganisation`.

### Journal d'audit — `pages/Audit.jsx`
**Accès : bureau + auditeur.** Historique des actions sensibles avec recherche.
Endpoint : `getAudit`.

### Notifications — `pages/Notifications.jsx`
**Accès : tout utilisateur connecté du bureau.** Liste des notifications (dont
« Document signé »), marquage lu / tout lu. La cloche du bandeau (`Topbar.jsx`)
affiche le nombre de non-lues. Endpoints : `getNotifications`,
`markNotificationRead`, `markAllNotificationsRead`.

---

## Espace stagiaire

Interface distincte (`StudentLayout` : en-tête simple, pas de barre latérale
bureau). Navigation : Mes documents · Mes formations · Atelier pâte.

### Mon espace — `pages/MonEspace.jsx`
**Accès : stagiaire.** Situation documentaire du stagiaire connecté : checklist des
documents à remplir/**signer** (signature par tracé, `SignatureModal.jsx`). Le
stagiaire ne voit que **ses** documents (contrôle de propriété côté serveur).
Endpoints : `getMonEspace`, `getDocument`, `signDocument`.

### Mes formations — `pages/MesFormations.jsx`
**Accès : stagiaire.** **Toutes** les formations du catalogue affichées en cartes,
**verrouillées par défaut**. Une carte devient cliquable quand la formation est
terminée (documents signés + dernier jour passé). Endpoint : `getMyFormations`.

### Détail formation (stagiaire) — `pages/StudentFormationDetail.jsx`
**Accès : stagiaire.** Une fois débloquée, donne accès aux **documents vus pendant
la formation**. Endpoint : `getMyFormation`.

### Atelier pâte — `pages/Atelier.jsx`
**Accès : stagiaire.** Outil autonome (sans base de données) : **calculateur de
pâte** en pourcentage boulanger (préréglages Napolitaine/Classique/In Teglia/
Contemporaine, curseurs hydratation/sel/levure, quantités par pâton). Purement
côté client.

---

## Pages transverses

### Connexion — `pages/Login.jsx`
Formulaire e-mail + mot de passe, option « rester connecté » (durée du JWT).
Endpoint : `POST /auth` (limiteur anti-force brute). Après connexion, `UserContext`
charge la session (`/auth/me`) et `main.jsx` route vers l'espace adéquat selon le
rôle.

### Page introuvable — `pages/NotFound.jsx`
Route inconnue de l'application bureau.

---

## Non porté depuis `dev` (et pourquoi)

- **Carte des stagiaires** — nécessiterait des colonnes de géolocalisation
  (`lat`, `lng`, `departement`) absentes du schéma actuel + un géocodage. À
  ajouter via une migration si souhaité.
- **Signature Yousign (OTP/webhook)** — remplacée par la signature locale par
  tracé (`05_SIGNATURE.md`).
- **Parcours façon Duolingo / quiz** — hors périmètre de cette branche.
