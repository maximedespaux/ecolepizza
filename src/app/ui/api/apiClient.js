import { startLoading, stopLoading } from "../lib/loading.js";

/**
 * OÙ JOINDRE L'API — figée à la CONSTRUCTION, pas au chargement de la page.
 *
 * `import.meta.env` est remplacé par sa valeur littérale au moment du `vite build` : cette
 * adresse est donc cuite dans le paquet livré, elle ne se lit pas à l'exécution. Conséquence
 * concrète : changer d'adresse d'API impose de RECONSTRUIRE le front, pas de redémarrer quoi
 * que ce soit. C'est aussi pourquoi `VITE_API_URL` doit être posée sur la machine qui construit.
 *
 * Le repli sur localhost garde le développement fonctionnel sans aucun réglage, comme avant.
 *
 * La barre oblique finale est retirée : `VITE_API_URL=https://api.exemple.fr/api/` produirait
 * sinon des `//stagiaires` — que certains serveurs redirigent, et une redirection PERD le corps
 * d'une requête POST. Une faute de frappe dans une variable d'environnement ne doit pas se
 * traduire par des enregistrements qui disparaissent en silence.
 */
export const API_BASE_URL = String(import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/+$/, "");

/* Instant de la DERNIÈRE mutation faite depuis CE NAVIGATEUR (POST/PUT/PATCH/DELETE, uploads
   compris). Sert au Topbar à ne pas faire sonner une alerte qui n'est que l'ÉCHO de mon propre
   geste — signer un document à la place d'un stagiaire crée « Document signé » pour tout
   l'organisme. (L'ajout comme formateur créait « Émargement à signer » ; depuis le 2026-09-17
   cette alerte part le jour du cours, cf. lib/relancesEmargement.js côté API.)

   PARTAGÉ ENTRE LES ONGLETS, et c'est l'ajout du 2026-09-17. Le repère vivait dans une variable
   de module, donc PAR ONGLET : un geste dans l'onglet de devant sonnait dans celui de derrière,
   qui ne l'avait pas vu passer. Exactement « un son sans savoir d'où il vient ». Le stockage local
   est commun aux onglets d'un même navigateur ; il ne couvre pas un autre appareil — le téléphone
   ouvert à côté — et rien de raisonnable ne le peut sans que le serveur dise qui a agi, ce qu'il
   ne fait plus depuis le pentest.

   POSÉ À L'ENVOI ET À L'ARRIVÉE. À l'envoi seulement, une action lente — sceller un PDF signé
   prend plusieurs secondes — voyait sa diffusion arriver après la fenêtre de garde, et sonnait. */
const CLE_MUTATION = "impastio.derniereMutation";
let derniereMutationLocale = 0;
function marquerMutationLocale() { // interne (appelé ici même)
  derniereMutationLocale = Date.now();
  try { localStorage.setItem(CLE_MUTATION, String(derniereMutationLocale)); } catch { /* stockage indisponible */ }
}
export function msDepuisMutationLocale() {
  let t = derniereMutationLocale;
  try { t = Math.max(t, Number(localStorage.getItem(CLE_MUTATION)) || 0); } catch { /* stockage indisponible */ }
  return Date.now() - t;
}

async function request(path, options = {}) {
  const { silent, ...opts } = options; // `silent` = pas de barre de chargement (polls)
  if (!silent) startLoading();
  const methode = String(opts.method || "GET").toUpperCase();
  const mutation = methode !== "GET" && methode !== "HEAD";
  if (mutation) marquerMutationLocale();
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      ...opts,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || "Requête échouée");
    }

    return data;
  } finally {
    // À l'arrivée aussi : la diffusion du serveur part à la FIN de la requête (cf. plus haut).
    if (mutation) marquerMutationLocale();
    if (!silent) stopLoading();
  }
}

// --- Organisme (réglages) ---
export function getOrganisation() {
  return request("/organisation");
}
/* Le catalogue des informations transmissibles aux partenaires, la sélection de l'école, et
   L'APERÇU DE LA PHRASE que le stagiaire lira. L'aperçu vient du SERVEUR, produit par la même
   fonction que le texte réel : le recomposer ici donnerait une seconde rédaction à maintenir,
   donc une occasion de montrer à l'école une phrase que personne d'autre ne verra. */
export function getChampsPartenaires() {
  return request("/organisation/champs-partenaires");
}

export function updateOrganisation(payload) {
  return request("/organisation", { method: "PATCH", body: JSON.stringify(payload) });
}
// Lieux de formation de l'organisme.
export function getLocations() { return request("/organisation/locations"); }
export function saveLocations(locations) { return request("/organisation/locations", { method: "PUT", body: JSON.stringify({ locations }) }); }

// --- Modèles de feuille d'émargement ---
export function getEmargementTemplates() {
  return request("/emargement-templates");
}
export function createEmargementTemplate(payload) {
  return request("/emargement-templates", { method: "POST", body: JSON.stringify(payload) });
}
export function updateEmargementTemplate(id, payload) {
  return request(`/emargement-templates/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteEmargementTemplate(id) {
  return request(`/emargement-templates/${id}`, { method: "DELETE" });
}

// --- Rôles d'accès personnalisés (profils de menu) ---
export function getAccessProfiles() {
  return request("/access-profiles");
}
export function createAccessProfile(payload) {
  return request("/access-profiles", { method: "POST", body: JSON.stringify(payload) });
}
export function updateAccessProfile(id, payload) {
  return request(`/access-profiles/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteAccessProfile(id) {
  return request(`/access-profiles/${id}`, { method: "DELETE" });
}
export function upsertSystemRole(role, payload) {
  return request(`/access-profiles/system/${role}`, { method: "PUT", body: JSON.stringify(payload) });
}

// --- OPCO / financeurs (référentiel) ---
export function getOpcos() {
  return request("/opcos");
}
export function createOpco(payload) {
  return request("/opcos", { method: "POST", body: JSON.stringify(payload) });
}
export function updateOpco(id, payload) {
  return request(`/opcos/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteOpco(id) {
  return request(`/opcos/${id}`, { method: "DELETE" });
}

// --- Ventes de matériel ---
export function getSales() {
  return request("/ventes");
}
export function deleteSale(id) {
  return request(`/ventes/${id}`, { method: "DELETE" });
}
export function checkoutSale(payload) {
  return request("/ventes/checkout", { method: "POST", body: JSON.stringify(payload) });
}
export function getShopSettings() {
  return request("/ventes/settings");
}
/* `saveShopSettings` a été retiré : les ENTITÉS ÉMETTRICES ont supplanté `shop_settings`.
   Préfixe de numéro, prochain numéro, moyens de paiement et TVA s'éditent désormais par entité
   (cf. BillingProfiles) ; `shop_settings` ne sert plus que de repli quand aucune entité n'est
   choisie — cas qui ne se produit pas, l'entité « organisme » étant semée et par défaut.
   La route serveur reste : elle est la dernière à écrire cette table, et la supprimer
   demanderait de décider du sort de la table elle-même. */

// --- Entités émettrices (identités de facturation) ---
export function getEmitters() {
  return request("/emetteurs");
}
export function createEmitter(payload) {
  return request("/emetteurs", { method: "POST", body: JSON.stringify(payload) });
}
export function updateEmitter(id, payload) {
  return request(`/emetteurs/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
/* `setDefaultEmitter` a été retiré : le bouton « Par défaut » a été ôté de l'écran Facturation
   (décision consignée dans CLAUDE.md §5 — l'entité « organisme » est semée et reste le défaut).
   La fonction survivait à son bouton. La route serveur reste, `is_default` pilotant toujours le
   choix de l'entité : c'est l'ÉCRAN qui ne le change plus, pas le concept qui a disparu. */
export function deleteEmitter(id) {
  return request(`/emetteurs/${id}`, { method: "DELETE" });
}

// --- Émargement ---
export function getAttendance(sessionId) {
  return request(`/attendance/${sessionId}`);
}
export function generateAttendance(sessionId) {
  return request(`/attendance/${sessionId}/generate`, { method: "POST" });
}
// Régénère les feuilles d'émargement de tous les dossiers de la session.
export function regenerateEmargement(sessionId) {
  return request(`/attendance/${sessionId}/regenerate`, { method: "POST" });
}
// Formateurs d'une session (affectation depuis l'équipe).
export function getAssignableTrainers() {
  return request("/sessions/trainers");
}
export function setSessionTrainers(id, user_ids) {
  return request(`/sessions/${id}/trainers`, { method: "PUT", body: JSON.stringify({ user_ids }) });
}
// Signature de la feuille d'émargement par le formateur.
export function signAttendanceSheet(sheetId, payload) {
  return request(`/attendance/sheet/${sheetId}/sign`, { method: "POST", body: JSON.stringify(payload) });
}
// Émargement du stagiaire (espace) : liste + signature d'une demi-journée.
export function getMyEmargement() {
  return request("/mon-espace/emargement");
}
export function signMyEmargement(recordId, payload) {
  return request(`/mon-espace/emargement/${recordId}/sign`, { method: "POST", body: JSON.stringify(payload) });
}

// --- Journal d'audit ---
export function getAudit(q = "") {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return request(`/audit${query}`);
}

// --- Notes CRM (dossier) ---
export function getNotes(enrollmentId) {
  return request(`/enrollments/${enrollmentId}/notes`);
}
export function createNote(enrollmentId, payload) {
  return request(`/enrollments/${enrollmentId}/notes`, { method: "POST", body: JSON.stringify(payload) });
}
export function deleteNote(enrollmentId, noteId) {
  return request(`/enrollments/${enrollmentId}/notes/${noteId}`, { method: "DELETE" });
}

// --- Pastilles de navigation ---
export function getBadges() {
  return request("/badges", { silent: true });
}

// --- Inventaire ---
export function getInventory() {
  return request("/inventaire");
}
export function createItem(payload) {
  return request("/inventaire", { method: "POST", body: JSON.stringify(payload) });
}
export function adjustItem(id, delta) {
  return request(`/inventaire/${id}/adjust`, { method: "PATCH", body: JSON.stringify({ delta }) });
}
export function updateItem(id, payload) {
  return request(`/inventaire/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteItem(id) {
  return request(`/inventaire/${id}`, { method: "DELETE" });
}

// --- Facturation ---
export function getInvoices() {
  return request("/factures");
}
export function createInvoice(payload) {
  return request("/factures", { method: "POST", body: JSON.stringify(payload) });
}
export function updateInvoice(id, payload) {
  return request(`/factures/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function recordPayment(id, amount) {
  return request(`/factures/${id}/payments`, { method: "POST", body: JSON.stringify({ amount }) });
}
export function deleteInvoice(id) {
  return request(`/factures/${id}`, { method: "DELETE" });
}

// Téléchargement binaire (Factur-X PDF / XML) avec authentification par cookie.
async function download(path, filename) {
  startLoading();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  } finally {
    stopLoading();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const err = new Error(d.message || d.error || "Téléchargement échoué");
    err.status = res.status;
    if (d.missing) err.missing = d.missing;
    if (d.forcable) err.forcable = true; // le serveur accepte ?force=1 malgré les manques
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
// `force` : émet malgré les informations manquantes (cf. avertirConformite, côté serveur).
export function downloadFacturX(id, number, force) {
  return download(`/factures/${id}/facturx${force ? "?force=1" : ""}`, `${number}.pdf`);
}
// Renvoie une URL blob du PDF (pour l'aperçu dans un onglet).
export async function facturXUrl(id, force) {
  startLoading();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/factures/${id}/facturx${force ? "?force=1" : ""}`, { credentials: "include" });
  } finally {
    stopLoading();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    // `missing` était PERDU ici : l'aperçu ne rendait qu'une phrase, alors que le serveur
    // envoyait déjà la liste de ce qu'il faut compléter. Le téléchargement, lui, la propageait.
    const err = new Error(d.message || d.error || "Aperçu impossible");
    err.status = res.status;
    if (d.missing) err.missing = d.missing;
    if (d.forcable) err.forcable = true;
    throw err;
  }
  return URL.createObjectURL(await res.blob());
}
export function downloadInvoiceXml(id, number) {
  return download(`/factures/${id}/xml`, `${number}.xml`);
}

// --- Carte des stagiaires ---
export function getCarte() {
  return request("/carte");
}
// Géocode par lots les stagiaires sans coordonnées (API adresse gouv).
export function geocodeCarte(limit = 80) {
  return request("/carte/geocode", { method: "POST", body: JSON.stringify({ limit }) });
}

// --- Comptabilité / Gestion ---
export function getComptabilite(annee, mois) {
  // `mois` : 1-12 pour un mois, 0 pour l'année entière. On envoie même 0 (sinon le serveur
  // retomberait sur le mois courant) ; seul `undefined` laisse le serveur choisir le défaut.
  const m = Number.isFinite(mois) ? `&mois=${mois}` : "";
  return request(`/comptabilite?annee=${annee}${m}`);
}
export function getComptaPerformance(annee) {
  return request(`/comptabilite/performance?annee=${annee}`);
}
export function createExpense(payload) {
  return request("/comptabilite/depenses", { method: "POST", body: JSON.stringify(payload) });
}
export function deleteExpense(id) {
  return request(`/comptabilite/depenses/${id}`, { method: "DELETE" });
}
export function createRevenue(payload) {
  return request("/comptabilite/revenus", { method: "POST", body: JSON.stringify(payload) });
}
export function updateRevenue(id, payload) {
  return request(`/comptabilite/revenus/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteRevenue(id) {
  return request(`/comptabilite/revenus/${id}`, { method: "DELETE" });
}
export function saveComptaTargets(payload) {
  return request("/comptabilite/cibles", { method: "PUT", body: JSON.stringify(payload) });
}

// --- Mémos du personnel (migration 176) ---
/* `data: null` : la migration 176 n'est pas jouée, l'écran le dit au lieu d'une liste vide. */
export function getMemos() {
  return request("/memos");
}
/* Le chiffre du bouton de la barre du haut. SILENCIEUX : il se relit toutes les minutes et à chaque
   écriture de l'équipe, et ne doit pas allumer la barre de chargement à chaque fois. */
export function getMemosCompte() {
  return request("/memos/compte", { silent: true });
}
export function createMemo(payload) {
  return request("/memos", { method: "POST", body: JSON.stringify(payload) });
}
/* `{ fait }` pour cocher ou décocher, `{ partage }` pour partager ou reprendre (l'auteur seul). */
export function updateMemo(id, payload) {
  return request(`/memos/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteMemo(id) {
  return request(`/memos/${id}`, { method: "DELETE" });
}
/* Ce que @ et # proposent (migration 177) : six par type au plus, et seulement les rubriques que
   la personne peut ouvrir. Silencieux : il se rappelle à chaque lettre tapée. */
export function chercherCiblesMemo(q, genre) {
  return request(`/memos/cibles?q=${encodeURIComponent(q || "")}&genre=${encodeURIComponent(genre || "")}`, { silent: true });
}
/* « J'ai ouvert mon mémo » : les mentions qui me visent cessent d'être neuves. Un GESTE, pas un
   rafraîchissement — sinon la pastille s'éteindrait toute seule, sans que personne n'ait rien lu. */
export function marquerMemosVus() {
  return request("/memos/vus", { method: "POST", silent: true });
}
/* Efface MES mémos cochés, jamais ceux des autres. */
export function clearMemosFaits() {
  return request("/memos/faits", { method: "DELETE" });
}

// --- Notifications ---
export function getNotifications() {
  return request("/notifications", { silent: true });
}
export function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: "PATCH" });
}
export function markAllNotificationsRead() {
  return request("/notifications/read-all", { method: "POST" });
}
export function deleteNotification(id) {
  return request(`/notifications/${id}`, { method: "DELETE" });
}

// --- Authentification ---
export function login({ email, password, org_code, stayConnected }) {
  return request("/auth", {
    method: "POST",
    body: JSON.stringify({ email, password, org_code, stayConnected }),
  });
}

// --- Plateforme (propriétaire de plateforme) ---
export function getOrganizations() {
  return request("/platform/organizations");
}
export function createOrganization(payload) {
  return request("/platform/organizations", { method: "POST", body: JSON.stringify(payload) });
}

export function getCurrentUser() {
  return request("/auth/me");
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
}

// « Mot de passe oublié » : demande d'un lien de réinitialisation. La réponse est toujours la
// même (le serveur ne dit jamais si l'adresse existe), donc `silent` — pas de barre de chargement
// qui trahirait quoi que ce soit, et l'appelant affiche un message générique.
export function forgotPassword({ email, org_code }) {
  return request("/auth/forgot", { method: "POST", silent: true, body: JSON.stringify({ email, orgCode: org_code }) });
}

// Pose du nouveau mot de passe depuis le jeton du lien reçu par e-mail.
export function resetPassword({ token, password }) {
  return request("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
}

// « Ce n'était pas moi » : annule un changement d'e-mail/mot de passe depuis le lien reçu.
export function annulerModification({ token }) {
  return request("/auth/annuler", { method: "POST", body: JSON.stringify({ token }) });
}

// L'utilisateur connecté change son propre mot de passe.
export function changeMyPassword(payload) {
  return request("/auth/password", { method: "PATCH", body: JSON.stringify(payload) });
}
// L'utilisateur connecté change sa propre adresse e-mail (mot de passe actuel requis).
export function changeMyEmail(payload) {
  return request("/auth/email", { method: "PATCH", body: JSON.stringify(payload) });
}
// Infos personnelles du stagiaire (modifiables, visibles de l'organisme).
export function getMyInfos() { return request("/mon-espace/infos", { silent: true }); }
export function updateMyInfos(payload) { return request("/mon-espace/infos", { method: "PUT", body: JSON.stringify(payload) }); }
/* Consentements du stagiaire (migration 130). `data` vaut `null` quand la migration n'est pas
   jouée ou quand le compte n'a pas de fiche stagiaire : l'écran ne propose alors rien, plutôt que
   d'afficher une demande qu'il ne pourrait pas enregistrer. */
export function getMyConsents() {
  return request("/mon-espace/consentements");
}
/* `conserver` : la personne à qui l'on propose une liste ÉLARGIE et qui préfère garder la sienne.
   Ce n'est PAS un refus — elle maintient son consentement, sur son périmètre d'origine, et le
   serveur refige cette liste-là. Envoyer `accorde: false` l'aurait exclue de toute transmission
   alors qu'elle consent toujours. */
export function setMyConsent(finalite, accorde, conserver) {
  return request(`/mon-espace/consentements/${finalite}`,
    { method: "PUT", body: JSON.stringify(conserver ? { accorde, conserver: true } : { accorde }) });
}

export function updateMyVisibility(visibility) { return request("/mon-espace/visibility", { method: "PUT", body: JSON.stringify({ visibility }) }); }

/* CÔTÉ ORGANISME — le registre des consentements d'une session, et la liste destinée à un
   partenaire (migration 130).

   `produireTransmission` N'EST PAS UNE SIMPLE LECTURE : le serveur compose la liste, en écarte
   ceux qui n'ont pas consenti, et inscrit l'envoi au journal. L'écran ne choisit personne — il
   affiche ce que le serveur a retenu. C'est ce qui le distingue du courriel écrit à la main, où
   rien n'empêchait d'ajouter quelqu'un. */
/* `finalite` : la question suivie — les partenaires par défaut, ou le droit à l'image. */
export function getSessionConsents(sessionId, finalite = "partenaires") {
  return request(`/sessions/${sessionId}/consentements?finalite=${encodeURIComponent(finalite)}`);
}
/* COMBIEN RESTENT À SOLLICITER, PAR SESSION — ce qui permet au calendrier de dire OÙ sont les
   gens que la pastille de navigation compte. `silent` : c'est un indicateur d'ambiance, pas une
   action ; il ne doit pas allumer la barre de chargement à chaque affichage du planning.
   Bureau uniquement côté serveur : chez le formateur, l'appel échoue et le calendrier reste nu. */
export function getConsentsManquants() {
  return request("/sessions/consentements-manquants", { silent: true });
}
export function setSessionConsent(sessionId, learnerId, accorde, source, finalite = "partenaires") {
  return request(`/sessions/${sessionId}/consentements/${learnerId}`,
    { method: "PUT", body: JSON.stringify({ accorde, source, finalite }) });
}
/* Le journal des envois d'UN PARTENAIRE. Par partenaire et non par session, depuis que l'export
   l'est aussi : c'est lui qui permet de répondre à « à qui mes coordonnées ont-elles été
   communiquées ? » (art. 15). */
export function getTransmissionsPartenaire(id) {
  return request(`/partenaires/${id}/transmissions`, { silent: true });
}

// --- Stagiaires ---
export function getStagiaires(q = "") {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return request(`/stagiaires${query}`);
}

export function getStagiaire(id) {
  return request(`/stagiaires/${id}`);
}

export function createStagiaire(payload) {
  return request("/stagiaires", { method: "POST", body: JSON.stringify(payload) });
}

// Porteurs des cadres exclusifs, pour le panneau « Distinctions » de la Communauté (bureau).
export function getDistinctions() {
  return request("/stagiaires/distinctions");
}
/** Les fiches « à recontacter » (migration 169), la plus ancienne attente en tête. Silencieux : la
    liste se charge en fond sur le tableau de bord et la page des stagiaires. */
export function getARecontacter() {
  return request("/stagiaires/a-recontacter", { silent: true });
}
export function updateStagiaire(id, payload) {
  return request(`/stagiaires/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteStagiaire(id) {
  return request(`/stagiaires/${id}`, { method: "DELETE" });
}

export function resetStagiairePassword(id) {
  return request(`/stagiaires/${id}/reset-password`, { method: "POST" });
}
// Supprime uniquement le compte de connexion (la fiche est conservée).
export function deleteStagiaireAccount(id) {
  return request(`/stagiaires/${id}/account`, { method: "DELETE" });
}

// --- Entreprises ---
export function getCompanies() {
  return request("/companies");
}

export function createCompany(payload) {
  return request("/companies", { method: "POST", body: JSON.stringify(payload) });
}
/* L'IMPORT CSV (2026-09-22) : `essai` par défaut — sans `false` explicite, le serveur n'écrit rien. */
export function importStagiaires(lignes, essai = true) {
  return request("/stagiaires/import", { method: "POST", body: JSON.stringify({ lignes, essai }) });
}
export function importEntreprises(lignes, essai = true) {
  return request("/companies/import", { method: "POST", body: JSON.stringify({ lignes, essai }) });
}
export function getCompany(id) {
  return request(`/companies/${id}`);
}
export function updateCompany(id, payload) {
  return request(`/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteCompany(id) {
  return request(`/companies/${id}`, { method: "DELETE" });
}
export function registerCompanyStagiaires(id, payload) {
  return request(`/companies/${id}/register`, { method: "POST", body: JSON.stringify(payload) });
}
export function detachCompanyLearner(id, learnerId) {
  return request(`/companies/${id}/learners/${learnerId}`, { method: "DELETE" });
}
// Parcours documentaire COMPLET du groupe (même style « timeline » que la fiche stagiaire).
export function getCompanyParcours(id, sessionId) {
  return request(`/companies/${id}/parcours${sessionId ? `?session_id=${sessionId}` : ""}`, { silent: true });
}
// Génère (et envoie) un document du parcours pour tout le groupe.
export function generateGroupDocuments(id, payload) {
  return request(`/companies/${id}/group-documents`, { method: "POST", body: JSON.stringify(payload) });
}
// Documents des stagiaires du groupe à signer par le représentant (à leur place).
export function getCompanyLearnerDocuments(id, sessionId) {
  return request(`/companies/${id}/learner-documents${sessionId ? `?session_id=${sessionId}` : ""}`, { silent: true });
}
// Crée / réinitialise le compte de connexion du représentant de l'entreprise → { email, password }.
export function createRepresentativeAccount(id) {
  return request(`/companies/${id}/representative-account`, { method: "POST" });
}

// --- Espace représentant d'entreprise ---
export function getRepDocuments() { return request("/rep/documents"); }
export function previewRepDocument(id) { return request(`/rep/documents/${id}/preview`, { silent: true }); }
export function signRepDocument(id, payload) { return request(`/rep/documents/${id}/sign`, { method: "POST", body: JSON.stringify(payload) }); }
export function setRepStamp(stamp) { return request("/rep/stamp", { method: "PUT", body: JSON.stringify({ stamp }) }); }
// Génère un document « entreprise » (un doc par groupe, listant tous les stagiaires).
export function createCompanyDocument(id, payload) {
  return request(`/companies/${id}/documents`, { method: "POST", body: JSON.stringify(payload) });
}
// Modèles de documents de GROUPE (company_level) disponibles pour une session.
export function getCompanyDocTemplates(id, sessionId) {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return request(`/companies/${id}/doc-templates${qs}`);
}
// Documents « entreprise » déjà générés (optionnellement filtrés par session).
export function listCompanyDocuments(id, sessionId) {
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return request(`/companies/${id}/documents${qs}`);
}
// Lien de signature partageable (représentant entreprise). createSignLink → { token }.
/* DOCUMENTS DE SESSION signés par un intervenant externe (contrat d'hygiène…). Distincts du
   lien de signature ci-dessous : l'intervenant A un compte, il signe depuis son espace. */
export function getDocumentsSession(sessionId) {
  return request(`/sessions/${sessionId}/documents-externes`);
}
export function envoyerDocumentSession(sessionId, payload) {
  return request(`/sessions/${sessionId}/documents-externes`, { method: "POST", body: JSON.stringify(payload) });
}
/* LES CADRES QU'ON M'A ATTRIBUÉS sur les documents d'une session (« Formateur », « Jury 1 »…) :
   un formateur les lit et les signe depuis la page de la session, comme ses émargements. */
export function getMesCasesSession(sessionId) { return request(`/sessions/${sessionId}/mes-cases`); }
export function signerMesCases(documentId, payload = {}) {
  return request(`/documents/${documentId}/mes-cases/sign`, { method: "POST", body: JSON.stringify(payload) });
}
export function getMesDocumentsIntervenant() { return request("/intervenant/documents"); }
export function signerMonDocumentIntervenant(id, payload = {}) {
  return request(`/intervenant/documents/${id}/signer`, { method: "POST", body: JSON.stringify(payload) });
}

export function createSignLink(documentId, payload = {}) {
  return request(`/documents/${documentId}/sign-link`, { method: "POST", body: JSON.stringify(payload) });
}
// Signature publique par le représentant de l'entreprise (page /signer/:token).
export function getPublicSignDoc(token) { return request(`/public/sign/${token}`, { silent: true }); }
export function submitPublicSign(token, payload) { return request(`/public/sign/${token}`, { method: "POST", body: JSON.stringify(payload) }); }

// --- Formations ---
export function getFormations() {
  return request("/formations");
}
export function createFormation(payload) {
  return request("/formations", { method: "POST", body: JSON.stringify(payload) });
}
export function updateFormation(id, payload) {
  return request(`/formations/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteFormation(id) {
  return request(`/formations/${id}`, { method: "DELETE" });
}
// Réordonne les formations (glisser-déposer).
export function reorderFormations(ids) {
  return request("/formations/reorder", { method: "PUT", body: JSON.stringify({ ids }) });
}

// --- QCM ---
export function getQuizzes() { return request("/quizzes"); }
export function getQuiz(id) { return request(`/quizzes/${id}`); }
export function createQuiz(payload) { return request("/quizzes", { method: "POST", body: JSON.stringify(payload) }); }
export function saveQuiz(id, payload) { return request(`/quizzes/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteQuiz(id) { return request(`/quizzes/${id}`, { method: "DELETE" }); }
export function duplicateQuiz(id) { return request(`/quizzes/${id}/duplicate`, { method: "POST" }); }
export function sendQuiz(id, session_id) { return request(`/quizzes/${id}/send`, { method: "POST", body: JSON.stringify({ session_id: session_id || null }) }); }
export function sendQuizToEnrollment(id, enrollmentId) { return request(`/quizzes/${id}/send/${enrollmentId}`, { method: "POST" }); }
export function takeQuiz(documentId) { return request(`/quizzes/take/${documentId}`); }
export function submitQuiz(documentId, answers) { return request(`/quizzes/take/${documentId}/submit`, { method: "POST", body: JSON.stringify({ answers }) }); }
// Résultats QCM (Qualité & conformité) : vue d'ensemble + détail par question d'un QCM.
/* `semaine` = la clé de `lib/sessions.js` (« 2026-38 »). Filtrée CÔTÉ SERVEUR : les écrans lisent
   des moyennes et des taux de réussite, et deux moyennes ne se combinent pas en les moyennant. */
function qcmFiltreQuery(session, year, semaine) {
  const p = new URLSearchParams();
  if (session) p.set("session", session);
  if (year) p.set("year", year);
  if (semaine) p.set("semaine", semaine);
  const s = p.toString();
  return s ? `?${s}` : "";
}
export function getQcmResultats(session, year, semaine) { return request(`/quizzes/resultats${qcmFiltreQuery(session, year, semaine)}`); }
export function getQcmResultatDetail(id, session, year, semaine) { return request(`/quizzes/resultats/${id}${qcmFiltreQuery(session, year, semaine)}`); }
export function getPreuveReponse(id) {
  return request(`/quizzes/resultats/reponse/${id}`);
}
export function deleteQcmResponse(id) { return request(`/quizzes/reponse/${id}`, { method: "DELETE" }); }

// --- Parcours documentaire par formation ---
export function getFormationSteps(id) {
  return request(`/formations/${id}/steps`);
}
export function saveFormationSteps(id, steps, break_slug, company_steps, company_break_slug) {
  const body = { steps };
  if (break_slug !== undefined) body.break_slug = break_slug;
  if (company_steps !== undefined) body.company_steps = company_steps;
  if (company_break_slug !== undefined) body.company_break_slug = company_break_slug;
  return request(`/formations/${id}/steps`, { method: "PUT", body: JSON.stringify(body) });
}
/* ---- Pizza Quest : structure (thèmes, paliers, prérequis) ---------------------------- */
export function getQuestStructure() { return request("/quest/structure"); }
export function createQuestCategory(payload) {
  return request("/quest/categories", { method: "POST", body: JSON.stringify(payload) });
}
export function updateQuestCategory(id, payload) {
  return request(`/quest/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteQuestCategory(id) {
  return request(`/quest/categories/${id}`, { method: "DELETE" });
}
export function setProgramQuestCategories(id, payload) {
  return request(`/quest/programs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function addQuestPrerequisite(payload) {
  return request("/quest/prerequisites", { method: "POST", body: JSON.stringify(payload) });
}
export function deleteQuestPrerequisite(id) {
  return request(`/quest/prerequisites/${id}`, { method: "DELETE" });
}

/* ---- Pizza Quest : banque de questions ----------------------------------------------- */
export function getQuestContent(programId) {
  return request(`/quest/content${programId ? `?program_id=${encodeURIComponent(programId)}` : ""}`);
}
export function createQuestDifficulty(p) { return request("/quest/difficulties", { method: "POST", body: JSON.stringify(p) }); }
export function updateQuestDifficulty(id, p) { return request(`/quest/difficulties/${id}`, { method: "PUT", body: JSON.stringify(p) }); }
export function deleteQuestDifficulty(id) { return request(`/quest/difficulties/${id}`, { method: "DELETE" }); }

/* Bilan d'usage de Pizza Quest — à la demande : la requête monte la banque entière pour
   rattacher chaque partie à son chapitre. */
export function getQuestUsage() { return request("/quest/usage"); }
export function createQuestChapter(p) { return request("/quest/chapters", { method: "POST", body: JSON.stringify(p) }); }
export function updateQuestChapter(id, p) { return request(`/quest/chapters/${id}`, { method: "PUT", body: JSON.stringify(p) }); }
export function deleteQuestChapter(id) { return request(`/quest/chapters/${id}`, { method: "DELETE" }); }

export function createQuestQuestion(p) { return request("/quest/questions", { method: "POST", body: JSON.stringify(p) }); }
export function updateQuestQuestion(id, p) { return request(`/quest/questions/${id}`, { method: "PUT", body: JSON.stringify(p) }); }
export function deleteQuestQuestion(id) { return request(`/quest/questions/${id}`, { method: "DELETE" }); }

// Chapitres jouables d'une formation (espace stagiaire). Vide = rien en base.
export function getPlayableChapters(programId) {
  return request(`/mon-espace/quest/${programId}/chapitres`, { silent: true });
}
// Cœurs : le capital est tenu par le serveur, jamais calculé côté client.
/* Les VIES de Pizza Quest n'existent plus — la mécanique d'XP et de cœurs a été remplacée par
   les cadres. Ces deux fonctions pointaient vers `/mon-espace/quest/vies`, une route qui n'existe
   dans AUCUN fichier de routes : elles auraient renvoyé une 404 si quelqu'un les avait appelées.
   Du code mort qui désigne du vide. */
// ⚠️ DÉBOGAGE — remet à zéro SA propre progression Pizza Quest. À retirer avec le bouton
// correspondant (PizzaQuest.jsx) avant la mise en service.

export function getFormation(id) {
  return request(`/formations/${id}`);
}
export function saveArchiveTree(id, tree, company_tree) {
  const body = { tree };
  if (company_tree !== undefined) body.company_tree = company_tree;
  return request(`/formations/${id}/archive-tree`, { method: "PUT", body: JSON.stringify(body) });
}

// --- Sessions ---
export function getSessions() {
  return request("/sessions");
}
// Tableau kanban d'une session (colonnes = étapes du parcours, cartes = stagiaires).
export function getSessionBoard(id) {
  return request(`/sessions/${id}/board`);
}
// Parcours (cycle de vie) d'un dossier stagiaire.
export function getEnrollmentParcours(id) {
  return request(`/enrollments/${id}/parcours`);
}

// --- Intervenants externes (affectation à une session) ---
export function getSessionIntervenants(sessionId) {
  return request(`/sessions/${sessionId}/intervenants`);
}
export function addSessionIntervenant(sessionId, payload) {
  return request(`/sessions/${sessionId}/intervenants`, { method: "POST", body: JSON.stringify(payload) });
}
export function setIntervenantSlots(sessionId, siId, slots) {
  return request(`/sessions/${sessionId}/intervenants/${siId}/slots`, { method: "PUT", body: JSON.stringify({ slots }) });
}
export function removeSessionIntervenant(sessionId, siId) {
  return request(`/sessions/${sessionId}/intervenants/${siId}`, { method: "DELETE" });
}
// Espace intervenant (rôle INTERVENANT).
export function getMyIntervenantSheets() {
  return request("/intervenant/emargement");
}
export function signMyIntervenantSheet(payload) {
  return request("/intervenant/emargement/sign", { method: "POST", body: JSON.stringify(payload) });
}
export function getMyIntervenantProfile() {
  return request("/intervenant/me");
}
export function setMyIntervenantSignature(signature_data) {
  return request("/intervenant/signature", { method: "PUT", body: JSON.stringify({ signature_data }) });
}

export function getSession(id) {
  return request(`/sessions/${id}`);
}

export function updateSession(id, payload) {
  return request(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function createSession(payload) {
  return request("/sessions", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteSession(id) {
  return request(`/sessions/${id}`, { method: "DELETE" });
}

// --- Dossiers (inscriptions) ---
export function getEnrollments() {
  return request("/enrollments");
}

export function getSuivi() {
  return request("/suivi");
}
// Coffre documentaire : documents partagés/signés (année → semaine → formation → stagiaire).
export function getArchives() {
  return request("/suivi/archives");
}
/**
 * Import de PDF historiques. `files` = File[], `paths` = chemins relatifs alignés.
 *
 * `dossier` (facultatif) range les fichiers dans un CLASSEUR libre au lieu de l'arbre
 * année / semaine / formation / stagiaire : le serveur met alors tout le classement par session
 * en sommeil. Sert aux pièces qui n'appartiennent à aucune promotion — assurance, agrément,
 * certificat Qualiopi.
 */
export async function importArchives(files, paths, dossier) {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("paths", JSON.stringify(paths));
  if (dossier) fd.append("dossier", dossier);
  startLoading();
  try {
    marquerMutationLocale();
    const res = await fetch(`${API_BASE_URL}/suivi/archives/import`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Import échoué");
    return data;
  } finally {
    stopLoading();
  }
}

/**
 * Rattache un document REÇU (courriel, scan) à une étape du dossier.
 *
 * `FormData` sans `Content-Type` explicite, comme l'import d'archives : le navigateur doit poser
 * lui-même la frontière multipart, et la fixer à la main casse l'envoi de façon illisible côté
 * serveur (« Unexpected end of form »).
 */
export async function importDocumentFile(fd) {
  startLoading();
  try {
    marquerMutationLocale();
    const res = await fetch(`${API_BASE_URL}/documents/import`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Import échoué");
    return data;
  } finally {
    stopLoading();
  }
}
export function archiveFileUrl(id) {
  return `${API_BASE_URL}/suivi/archives/${id}/file`;
}
export function downloadArchiveFile(id, filename) {
  return download(`/suivi/archives/${id}/file`, filename);
}
// Suppression groupée (semaine / formation / stagiaire / fichiers) — supprime en base.
/* L'INVENTAIRE DU COFFRE : ce qu'il occupe, où, et ce qui est en double. Lourd par nature (le
   serveur lit tous les blobs pour en calculer les empreintes), donc jamais appelé au chargement
   — seulement quand on ouvre le panneau. */
export function getArchiveStockage() {
  return request("/suivi/archives/stockage");
}
export function bulkDeleteArchives(archive_ids, document_ids) {
  return request("/suivi/archives/delete", { method: "POST", body: JSON.stringify({ archive_ids, document_ids }) });
}

export function createEnrollment(payload) {
  return request("/enrollments", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteEnrollment(id) {
  return request(`/enrollments/${id}`, { method: "DELETE" });
}

// --- Espace stagiaire ---
export function getMonEspace() {
  return request("/mon-espace");
}

export function getMyAccess() {
  return request("/mon-espace/access", { silent: true });
}
// Remet la pastille Communauté à zéro. `silent` : rater ce marquage laisse une pastille de
// trop, ce qui ne vaut pas un message d'erreur au stagiaire.
// « J'ai ouvert cette fiche » : éteint son halo « nouveaux commentaires ».
export function markRecipeRead(id) {
  return request(`/recipes/${id}/read`, { method: "POST", silent: true });
}
export function markCommunitySeen() {
  return request("/mon-espace/communaute/vue", { method: "POST", silent: true });
}
export function getMyFormations() {
  return request("/mon-espace/formations");
}

export function getMyFormation(id) {
  return request(`/mon-espace/formations/${id}`);
}

// Profil ludique du stagiaire (avatar + progression Pizza Quest), persisté en base.
export function getMyProfile() {
  return request("/mon-espace/profile", { silent: true });
}
export function saveMyAvatar(avatar) {
  return request("/mon-espace/avatar", { method: "PUT", body: JSON.stringify({ avatar }), silent: true });
}
/* Efface TOUTE la progression Pizza Quest — la sienne, jamais celle d'un autre : le serveur
   prend l'identité du compte connecté et ignore ce qu'on lui passerait.  n'écrit
   qu'à la hausse, il n'existait donc aucun chemin de retour. */
export function resetMyQuest() {
  return request("/mon-espace/quest", { method: "DELETE" });
}
export function saveMyQuest(progress) {
  return request("/mon-espace/quest", { method: "PUT", body: JSON.stringify({ progress }), silent: true });
}

// --- Boutique stagiaire ---
// Deux sources DIFFÉRENTES, à ne pas fusionner : `getBoutique` = le stock que l'école achète
// et revend (elle est le marchand) ; `getBoutiquePartenaires` = ce que vendent nos partenaires
// (l'école présente et met en relation). Prix, responsabilité et SAV n'ont rien à voir.
export function getBoutique() {
  return request("/mon-espace/boutique");
}
export function getBoutiquePartenaires() {
  return request("/mon-espace/boutique/partenaires");
}
// Le panier validé devient une DEMANDE (pas une commande payée) : le stagiaire retire à
// l'école et paie sur place. Les prix sont relus en base côté serveur — on n'envoie que les ids.
// Annulation par le stagiaire — refusée par le serveur dès que la demande a avancé.
export function cancelMyShopRequest(id) {
  return request(`/mon-espace/boutique/demande/${id}/annuler`, { method: "PUT" });
}
export function createShopRequest(lines, note, pickup_at) {
  return request("/mon-espace/boutique/demande", { method: "POST", body: JSON.stringify({ lines, note, pickup_at }) });
}
// Les créneaux viennent de l'API, jamais d'une table recopiée dans le front : sinon les deux
// divergent et on propose un créneau que le serveur refuse (cf. api/lib/horaires.js).
export function getPickupSlots(textile) {
  return request(`/mon-espace/boutique/creneaux${textile ? "?textile=1" : ""}`);
}
export function getMyShopRequests() {
  return request("/mon-espace/boutique/mes-demandes");
}

// --- Boutique côté école (zone « Demandes ») ---
export function getShopRequests(status) {
  return request(`/boutique/demandes${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}
export function updateShopRequest(id, patch) {
  return request(`/boutique/demandes/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}
// `choix` (facultatif) : { bill_to, billing_profile_id, template_slug }. Sans lui, la facture
// reprend ce qui a été figé à la commande — comportement d'avant.
export function invoiceShopRequest(id, choix) {
  return request(`/boutique/demandes/${id}/facture`, { method: "POST", body: JSON.stringify(choix || {}) });
}
export function deleteShopRequest(id) {
  return request(`/boutique/demandes/${id}`, { method: "DELETE" });
}
export function deleteAllShopRequests() {
  return request(`/boutique/demandes`, { method: "DELETE" });
}
// Retraits de matériel prévus sur une plage de dates (page d'une session).
export function getPickups(from, to) {
  return request(`/boutique/retraits?from=${from}&to=${to}`);
}

// --- Fiches techniques (recettes) + catalogue d'ingrédients ---
export function searchCatalog(arg) {
  const p = typeof arg === "string" ? { q: arg } : (arg || {});
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "") qs.set(k, v);
  return request(`/recipes/catalog?${qs.toString()}`, { silent: true });
}
export function getCatalogFamilies() { return request("/recipes/catalog/families", { silent: true }); }
export function getCatalogBrands() { return request("/recipes/catalog/brands", { silent: true }); }

// --- Mercuriale (liste de prix curée par utilisateur) ---
export function getMercuriale() { return request("/mercuriale", { silent: true }); }
export function addMercurialeItem(item) { return request("/mercuriale", { method: "POST", body: JSON.stringify(item) }); }
export function updateMercurialeItem(id, patch) { return request(`/mercuriale/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); }
export function deleteMercurialeItem(id) { return request(`/mercuriale/${id}`, { method: "DELETE" }); }
// Cadre porté (migration 113) : jusqu'ici le choix ne vivait qu'en localStorage, donc
// personne d'autre ne pouvait le voir. Best-effort, comme l'avatar.
export function saveMyCadre(cadre) { return request("/mon-espace/cadre", { method: "PUT", body: JSON.stringify({ cadre }) }); }

// --- Espace d'échange : questions, réponses, photos (migration 114) ---
export function getPosts() { return request("/community/posts", { silent: true }); }
export function getPost(id) { return request(`/community/posts/${id}`); }
export function createPost(p) { return request("/community/posts", { method: "POST", body: JSON.stringify(p) }); }
export function updatePost(id, patch) { return request(`/community/posts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); }
export function deletePost(id) { return request(`/community/posts/${id}`, { method: "DELETE" }); }
export function addAnswer(id, body) { return request(`/community/posts/${id}/answers`, { method: "POST", body: JSON.stringify({ body }) }); }
export function deleteAnswer(id) { return request(`/community/answers/${id}`, { method: "DELETE" }); }
/** URL de la photo — servie par une route authentifiée, donc utilisable directement en `src`. */
export function postImageUrl(id) { return `${API_BASE_URL}/community/posts/${id}/image`; }
/** Envoi de la photo. Le fichier est DÉJÀ redimensionné et compressé par le navigateur. */
export async function uploadPostImage(id, blob) {
  const fd = new FormData();
  fd.append("image", blob, "photo.webp");
  startLoading();
  try {
    marquerMutationLocale();
    const res = await fetch(`${API_BASE_URL}/community/posts/${id}/image`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Envoi de la photo échoué");
    return data;
  } finally {
    stopLoading();
  }
}
// --- Pièces justificatives (dossier d'une inscription : à fournir / déposée / validée / refusée) ---
// Accessible au stagiaire pour SON dossier (garde de propriété serveur) et au personnel.
export function getDossierPieces(enrollmentId) { return request(`/pieces/dossier/${enrollmentId}`, { silent: true }); }
export async function deposerPiece(enrollmentId, pieceTypeId, file) {
  const fd = new FormData();
  fd.append("fichier", file); // doit matcher depot.single('fichier') côté route
  startLoading();
  try {
    marquerMutationLocale();
    const res = await fetch(`${API_BASE_URL}/pieces/dossier/${enrollmentId}/${pieceTypeId}`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Envoi du fichier échoué");
    return data;
  } finally { stopLoading(); }
}
// URL directe du fichier (déchiffré à la volée côté serveur) — pour un aperçu inline.
export function pieceFichierUrl(fichierId) { return `${API_BASE_URL}/pieces/fichier/${fichierId}`; }
// Personnel : valider ou refuser (motif requis si REFUSEE).
export function verifierPiece(depotId, statut, motif_refus) { return request(`/pieces/depot/${depotId}`, { method: "PATCH", body: JSON.stringify({ statut, motif_refus }) }); }

// --- Référentiel des TYPES de pièces (géré depuis Modèles de documents) ---
// Un type de pièce = ce que l'école PEUT demander (libellé, consigne, nb de fichiers, taille max,
// formats acceptés). Distinct des dépôts ci-dessus, qui sont ce qu'un dossier a fourni.
export function getPieceTypes() { return request("/pieces"); }
export function createPieceType(payload) { return request("/pieces", { method: "POST", body: JSON.stringify(payload) }); }
export function updatePieceType(id, payload) { return request(`/pieces/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deletePieceType(id) { return request(`/pieces/${id}`, { method: "DELETE" }); }

/* --- REMISES : ce que l'ORGANISME remet au stagiaire (migration 160) ---
   Le miroir des pièces ci-dessus, dans l'autre sens. Deux asymétries qui se lisent dans les
   fonctions : seul le personnel dépose et retire (le serveur refuse le stagiaire), et seul le
   stagiaire accuse réception (le serveur refuse le personnel). C'est ce qui donne sa valeur à
   l'accusé : une preuve signée par celui qu'elle engage. */
export function getDossierRemises(enrollmentId) { return request(`/remises/dossier/${enrollmentId}`, { silent: true }); }
export async function deposerRemise(enrollmentId, remiseTypeId, file) {
  const fd = new FormData();
  fd.append("fichier", file); // doit matcher depot.single('fichier') côté route
  startLoading();
  try {
    marquerMutationLocale();
    const res = await fetch(`${API_BASE_URL}/remises/dossier/${enrollmentId}/${remiseTypeId}`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Envoi du fichier échoué");
    return data;
  } finally { stopLoading(); }
}
// URL directe du fichier (déchiffré à la volée côté serveur). La consulter NE VAUT PAS
// réception : le serveur ne touche ni au statut ni à la date. Cf. remise.controller.js.
export function remiseFichierUrl(fichierId) { return `${API_BASE_URL}/remises/fichier/${fichierId}`; }
export function supprimerRemiseFichier(fichierId) { return request(`/remises/fichier/${fichierId}`, { method: "DELETE" }); }
// Le STAGIAIRE confirme avoir reçu. Le serveur refuse quiconque n'est pas le stagiaire du dossier.
export function accuserRemise(remiseId) { return request(`/remises/${remiseId}/accuser`, { method: "POST" }); }
// PERSONNEL : écarter cette remise pour CE stagiaire (migration 161) — elle sort du décompte.
export function basculerRemiseSansObjet(enrollmentId, remiseTypeId, sansObjet) {
  return request(`/remises/dossier/${enrollmentId}/${remiseTypeId}/sans-objet`,
    { method: "PATCH", body: JSON.stringify({ sans_objet: sansObjet }) });
}

// --- Référentiel des TYPES de remises (géré depuis Modèles de documents) ---
export function getRemiseTypes() { return request("/remises"); }
export function createRemiseType(payload) { return request("/remises", { method: "POST", body: JSON.stringify(payload) }); }
export function updateRemiseType(id, payload) { return request(`/remises/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteRemiseType(id) { return request(`/remises/${id}`, { method: "DELETE" }); }

export function getMyRecipes(kind) { return request(`/recipes/mine${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`); }
export function getSharedRecipes() { return request("/recipes/shared"); }
export function getComponents(q) { return request(`/recipes/components${q ? `?q=${encodeURIComponent(q)}` : ""}`, { silent: true }); }
// Dépublier une fiche : elle quitte le fil, son auteur la garde. Voir `unshareRecipe`.
export function unshareRecipe(id) { return request(`/recipes/${id}/retirer`, { method: "POST" }); }
export function getAuthorProfile(userId) { return request(`/recipes/author/${userId}`, { silent: true }); }
export function likeRecipe(id) { return request(`/recipes/${id}/like`, { method: "POST" }); }
export function addRecipeComment(id, body) { return request(`/recipes/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) }); }
export function updateRecipeComment(id, cid, body) { return request(`/recipes/${id}/comments/${cid}`, { method: "PUT", body: JSON.stringify({ body }) }); }
export function deleteRecipeComment(id, cid) { return request(`/recipes/${id}/comments/${cid}`, { method: "DELETE" }); }
export function getRecipe(id) { return request(`/recipes/${id}`); }
export function createRecipe(payload) { return request("/recipes", { method: "POST", body: JSON.stringify(payload) }); }
export function updateRecipe(id, payload) { return request(`/recipes/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteRecipe(id) { return request(`/recipes/${id}`, { method: "DELETE" }); }

// --- Documents ---
export function getLearnerDocuments(learnerId) {
  return request(`/documents?learner_id=${learnerId}`);
}

export function createDocument(payload) {
  return request("/documents", { method: "POST", body: JSON.stringify(payload) });
}

// Vérifie qu'un modèle s'applique aux dossiers choisis. -> { ok, failed:[{slug,label}] }
export function checkDocumentConditions(payload) {
  return request("/documents/check-conditions", { method: "POST", body: JSON.stringify(payload), silent: true });
}

export function getDocument(id) {
  return request(`/documents/${id}`);
}

// Document final PDF (non modifiable) — téléchargement.
export function downloadDocumentPdf(id, filename = "document.pdf") {
  return download(`/documents/${id}/pdf`, filename);
}

/** Ouvre le document IMPORTÉ d'une étape (déchiffré par le serveur à la volée). */
export function downloadDocumentImporte(id, filename) {
  return download(`/documents/${id}/fichier`, filename || "document-recu");
}
// Aperçu HTML fidèle du document (rendu identique au PDF), affichable en ligne
// sans dépendre du lecteur PDF du navigateur. Renvoie { html }. Propage err.missing.
export async function documentPreviewHtml(id) {
  startLoading();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/documents/${id}/preview`, { credentials: "include" });
  } finally {
    stopLoading();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || "Aperçu impossible");
    err.status = res.status;
    if (data.missing) err.missing = data.missing;
    throw err;
  }
  return data.data.html;
}
// URL blob du PDF pour l'aperçu (iframe). Lève une erreur si indisponible (LibreOffice manquant).
export async function documentPdfUrl(id) {
  startLoading();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/documents/${id}/pdf`, { credentials: "include" });
  } finally {
    stopLoading();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const err = new Error(d.message || d.error || "Aperçu PDF impossible");
    err.status = res.status;
    if (d.missing) err.missing = d.missing;
    throw err;
  }
  return URL.createObjectURL(await res.blob());
}

export function sendDocument(id) {
  return request(`/documents/${id}/send`, { method: "POST" });
}

export function signDocument(id, payload) {
  return request(`/documents/${id}/sign`, { method: "POST", body: JSON.stringify(payload) });
}

export function deleteDocument(id) {
  return request(`/documents/${id}`, { method: "DELETE" });
}

// --- Modèles de documents (par organisme) ---
export function getTemplates() {
  return request("/templates");
}
// --- Conditions personnalisées d'application des documents ---
export function getConditionCatalog() {
  return request("/conditions/catalog");
}
export function getFieldValues(field) {
  return request(`/conditions/field-values?field=${encodeURIComponent(field)}`);
}
export function getConditions() {
  return request("/conditions");
}
export function createCondition(payload) {
  return request("/conditions", { method: "POST", body: JSON.stringify(payload) });
}
export function updateCondition(id, payload) {
  return request(`/conditions/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteCondition(id) {
  return request(`/conditions/${id}`, { method: "DELETE" });
}
// --- Équivalences de documents (« OU ») ---
export function getEquivalences() {
  return request("/equivalences");
}
export function createEquivalence(payload) {
  return request("/equivalences", { method: "POST", body: JSON.stringify(payload) });
}
export function updateEquivalence(id, payload) {
  return request(`/equivalences/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function deleteEquivalence(id) {
  return request(`/equivalences/${id}`, { method: "DELETE" });
}
// Champs du dossier : colonnes éligibles + activation.
export function getFieldSettings() {
  return request("/conditions/fields");
}
export function saveFieldSettings(fields) {
  return request("/conditions/fields", { method: "PUT", body: JSON.stringify({ fields }) });
}
export function saveTemplate(slug, payload) {
  return request(`/templates/${slug}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function resetTemplate(slug) {
  return request(`/templates/${slug}`, { method: "DELETE" });
}
// Supprime DÉFINITIVEMENT un modèle (tombstone pour les étapes du socle).
export function deleteTemplate(slug) {
  return request(`/templates/${slug}?permanent=1`, { method: "DELETE" });
}
export function duplicateTemplate(slug) {
  return request(`/templates/${slug}/duplicate`, { method: "POST" });
}
// Renomme l'identifiant (slug) d'un modèle, en répercutant partout où il est référencé.
// Réordonne les modèles (glisser-déposer).
export function reorderTemplates(orders) {
  // orders : [{ slug, sort_order }] (position globale) ; rétro-compat : tableau de slugs.
  const body = Array.isArray(orders) && orders.length && typeof orders[0] === "string"
    ? { slugs: orders } : { orders };
  return request("/templates/reorder", { method: "PUT", body: JSON.stringify(body) });
}
export function reorderEmargementTemplates(orders) {
  return request("/emargement-templates/reorder", { method: "PUT", body: JSON.stringify({ orders }) });
}
// Catalogue des jetons (regroupé par table) pour la palette de l'éditeur.
export function getTokenCatalog(slug) {
  return request(slug ? `/templates/tokens?slug=${encodeURIComponent(slug)}` : "/templates/tokens");
}
// Corps HTML d'un modèle (propre à l'organisme ou modèle par défaut).
export function getTemplateBody(slug) {
  return request(`/templates/${slug}/body`);
}
// Enregistre le contenu construit dans l'éditeur (corps + en-tête + pied de page).
export function saveTemplateBody(slug, payload) {
  return request(`/templates/${slug}`, { method: "PUT", body: JSON.stringify(payload) });
}
// Jetons personnalisés de l'organisme (calculés à partir d'autres jetons).
export function getCustomTokens() { return request("/templates/custom-tokens"); }
export function saveCustomTokens(tokens) { return request("/templates/custom-tokens", { method: "PUT", body: JSON.stringify({ tokens }) }); }
// Marges réservées (en-tête/pied) du modèle en cours d'édition — pour le repère de fin
// de page. Calcul serveur identique au rendu PDF. { topMm, bottomMm, contentMm }.
export function templatePageMetrics(slug, payload) {
  return request(`/templates/${slug}/page-metrics`, { method: "POST", body: JSON.stringify(payload), silent: true });
}
// Aperçu PDF fidèle du modèle en cours d'édition. Renvoie une URL blob (à révoquer).
export async function templatePreviewPdfUrl(slug, payload) {
  const res = await fetch(`${API_BASE_URL}/templates/${slug}/preview-pdf`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let m = "Aperçu PDF impossible";
    try { m = (await res.json()).message || m; } catch { /* ignore */ }
    throw new Error(m);
  }
  return URL.createObjectURL(await res.blob());
}
export async function uploadTemplate(slug, file) {
  const fd = new FormData();
  fd.append("file", file);
  startLoading();
  let res;
  try {
    marquerMutationLocale();
    res = await fetch(`${API_BASE_URL}/templates/${slug}`, { method: "POST", credentials: "include", body: fd });
  } finally {
    stopLoading();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || data.error || "Téléversement échoué");
  return data;
}

// --- Équipe (comptes ayant accès au panneau) ---
export function getTeam() {
  return request("/equipe");
}
export function createMember(payload) {
  return request("/equipe", { method: "POST", body: JSON.stringify(payload) });
}
export function updateMember(id, payload) {
  return request(`/equipe/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteMember(id) {
  return request(`/equipe/${id}`, { method: "DELETE" });
}

// --- Partenaires ---
/* Produits d'un partenaire — le catalogue montré aux stagiaires (« Offres partenaires »).
   La table existait et l'espace stagiaire l'affichait déjà ; rien ne permettait de la remplir. */
export function getPartenaireProduits(id) {
  return request(`/partenaires/${id}/produits`);
}
export function createPartenaireProduit(id, payload) {
  return request(`/partenaires/${id}/produits`, { method: "POST", body: JSON.stringify(payload) });
}
export function updatePartenaireProduit(pid, payload) {
  return request(`/partenaires/produits/${pid}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deletePartenaireProduit(pid) {
  return request(`/partenaires/produits/${pid}`, { method: "DELETE" });
}

export function getPartenaires(category = "") {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return request(`/partenaires${query}`);
}

/* DESTINATAIRE DES COORDONNÉES (migration 131) — route SÉPARÉE de `updatePartenaire`, pour que
   modifier une adresse ne puisse pas décocher au passage une autorisation de transmettre des
   données personnelles. Un 409 signifie que la migration n'est pas jouée. */
export function setPartenaireDestinataire(id, recoit) {
  return request(`/partenaires/${id}/destinataire`,
    { method: "PATCH", body: JSON.stringify({ recoit }) });
}

/* L'export des stagiaires consentants d'un partenaire, sur une période. Le serveur compose la
   liste, écarte ceux qui n'ont pas consenti, n'envoie que les champs annoncés à CHACUN, et
   inscrit l'envoi au journal. L'écran ne choisit personne — il affiche. */
export function exporterPartenaire(id, depuis, jusquA) {
  return request(`/partenaires/${id}/transmission`,
    { method: "POST", body: JSON.stringify({ depuis, jusqu_a: jusquA }) });
}

export function createPartenaire(payload) {
  return request("/partenaires", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePartenaire(id, payload) {
  return request(`/partenaires/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deletePartenaire(id) {
  return request(`/partenaires/${id}`, { method: "DELETE" });
}
/* Catégories de partenaires (migration 129). Elles étaient écrites en dur dans l'écran ; le
   serveur renvoie la liste de l'organisme, ou la liste d'origine tant que la migration n'est pas
   jouée — auquel cas les entrées n'ont pas d'`id` et ne sont donc pas modifiables. */
export function getPartenaireCategories() {
  return request("/partenaires/categories");
}
export function createPartenaireCategorie(payload) {
  return request("/partenaires/categories", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePartenaireCategorie(cid, payload) {
  return request(`/partenaires/categories/${cid}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deletePartenaireCategorie(cid) {
  return request(`/partenaires/categories/${cid}`, { method: "DELETE" });
}
// Apports en nature (matériel/équipement) — distincts des commissions cash.
export function createContribution(payload) {
  return request("/partenaires/contributions", { method: "POST", body: JSON.stringify(payload) });
}
export function deleteContribution(id) {
  return request(`/partenaires/contributions/${id}`, { method: "DELETE" });
}


/* ÉVALUATION PRATIQUE (migration 148) — la grille d'une formation, les notes d'une session.
   Les POINTS ne sont jamais envoyés : on transmet la MESURE (un temps, une note, un geste
   acquis) et le serveur applique le barème. Cf. api/lib/bareme.js. */
/* Pose les modèles de document du jury. N'écrase jamais un modèle existant : le corps livré
   n'est qu'un point de départ, et l'organisme le retouche ensuite. */
export function poserModelesJury() {
  return request("/templates/modeles-jury", { method: "POST" });
}
/* NOTATION — l'addition de ce qui a été saisi ailleurs (QCM, évaluation pratique, jury). */
export function getSessionsANoter() {
  return request("/notation/sessions");
}
export function getNotationSession(sessionId) {
  return request(`/notation/session/${sessionId}`);
}

/* PROCÈS-VERBAL DE JURY — la commission de délibération d'une session (migration 150). */
export function getCommission(sessionId) {
  return request(`/examens/session/${sessionId}`);
}
export function saveCommission(sessionId, payload) {
  return request(`/examens/session/${sessionId}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function saveDecisionJury(payload) {
  return request("/examens/decision", { method: "PUT", body: JSON.stringify(payload) });
}
export function cloturerCommission(sessionId) {
  return request(`/examens/session/${sessionId}/cloturer`, { method: "POST" });
}
/* Le PV est un PDF rendu à la demande depuis les données FIGÉES de la commission : il n'est pas
   rangé dans le parcours d'un stagiaire, puisqu'il n'appartient à aucun.
   PAS UN SIMPLE LIEN `href` : la route est en POST (elle journalise l'édition), et un lien nu
   avalerait l'erreur — « modèle introuvable » s'afficherait en page blanche au lieu d'un
   message. On passe donc par `fetch`, comme les factures. */
export async function ouvrirPvJury(sessionId) {
  startLoading();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/examens/session/${sessionId}/pv`, { method: "POST", credentials: "include" });
  } finally {
    stopLoading();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || d.error || "Édition du procès-verbal impossible.");
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  /* On révoque APRÈS un délai : révoquer tout de suite couperait le chargement de l'onglet qui
     vient de s'ouvrir, et la page resterait blanche. */
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function getGrilleEvaluation(programId, role) {
  /* Une formation porte DEUX grilles : celle du formateur (notation continue) et celle du jury
     (examen). Le rôle dit laquelle on demande. */
  return request(`/evaluations/formation/${programId}${role ? `?role=${encodeURIComponent(role)}` : ""}`);
}
export function saveGrilleEvaluation(programId, payload) {
  return request(`/evaluations/formation/${programId}`, { method: "PUT", body: JSON.stringify(payload) });
}
/* ESPACE INTERVENANT — les mêmes gestes, sous une porte de plus : le serveur y revérifie que
   le membre du jury est AFFECTÉ à la session avant de déléguer aux contrôleurs d'évaluation. */
export function getMaGrilleJury(sessionId, silent) {
  return request(`/intervenant/evaluation/${sessionId}`, { silent });
}
export function noterJury(payload) {
  return request("/intervenant/evaluation/note", { method: "PUT", body: JSON.stringify(payload) });
}
export function verdictJury(payload) {
  return request("/intervenant/evaluation/verdict", { method: "PUT", body: JSON.stringify(payload) });
}
export function cloturerJury(payload) {
  return request("/intervenant/evaluation/cloturer", { method: "POST", body: JSON.stringify(payload) });
}
export function getEvaluationSession(sessionId, silent, role) {
  /* `silent` : la relecture qui suit CHAQUE note ne doit pas faire clignoter la barre de
     chargement — le formateur saisit en rafale, et l'écran passerait son temps à scintiller. */
  return request(`/evaluations/session/${sessionId}${role ? `?role=${encodeURIComponent(role)}` : ""}`, { silent });
}
export function saveNoteEvaluation(payload) {
  return request("/evaluations/note", { method: "PUT", body: JSON.stringify(payload) });
}
