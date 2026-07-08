import { startLoading, stopLoading } from "../lib/loading.js";

const API_BASE_URL = "http://localhost:3000/api";

async function request(path, options = {}) {
  const { silent, ...opts } = options; // `silent` = pas de barre de chargement (polls)
  if (!silent) startLoading();
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
    if (!silent) stopLoading();
  }
}

// --- Organisme (réglages) ---
export function getOrganisation() {
  return request("/organisation");
}
export function updateOrganisation(payload) {
  return request("/organisation", { method: "PATCH", body: JSON.stringify(payload) });
}

// --- Ventes de matériel ---
export function getSales() {
  return request("/ventes");
}
export function createSale(payload) {
  return request("/ventes", { method: "POST", body: JSON.stringify(payload) });
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
export function saveShopSettings(payload) {
  return request("/ventes/settings", { method: "PUT", body: JSON.stringify(payload) });
}

// --- Émargement ---
export function getAttendance(sessionId) {
  return request(`/attendance/${sessionId}`);
}
export function generateAttendance(sessionId) {
  return request(`/attendance/${sessionId}/generate`, { method: "POST" });
}
export function setPresence(recordId, present) {
  return request(`/attendance/record/${recordId}`, { method: "PATCH", body: JSON.stringify({ present }) });
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
export function sellItem(id, quantity) {
  return request(`/inventaire/${id}/sell`, { method: "POST", body: JSON.stringify({ quantity }) });
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
    throw new Error(d.message || d.error || "Téléchargement échoué");
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
export function downloadFacturX(id, number) {
  return download(`/factures/${id}/facturx`, `${number}.pdf`);
}
// Renvoie une URL blob du PDF (pour l'aperçu dans un onglet).
export async function facturXUrl(id) {
  startLoading();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/factures/${id}/facturx`, { credentials: "include" });
  } finally {
    stopLoading();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || d.error || "Aperçu impossible");
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
export function getComptabilite(annee) {
  return request(`/comptabilite?annee=${annee}`);
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
export function getRevenues(annee) {
  return request(`/comptabilite/revenus?annee=${annee}`);
}
export function createRevenue(payload) {
  return request("/comptabilite/revenus", { method: "POST", body: JSON.stringify(payload) });
}
export function deleteRevenue(id) {
  return request(`/comptabilite/revenus/${id}`, { method: "DELETE" });
}
export function saveComptaTargets(payload) {
  return request("/comptabilite/cibles", { method: "PUT", body: JSON.stringify(payload) });
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

// --- Authentification ---
export function login({ email, password, stayConnected }) {
  return request("/auth", {
    method: "POST",
    body: JSON.stringify({ email, password, stayConnected }),
  });
}

export function getCurrentUser() {
  return request("/auth/me");
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
}

// L'utilisateur connecté change son propre mot de passe.
export function changeMyPassword(payload) {
  return request("/auth/password", { method: "PATCH", body: JSON.stringify(payload) });
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

export function updateStagiaire(id, payload) {
  return request(`/stagiaires/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function resetStagiairePassword(id) {
  return request(`/stagiaires/${id}/reset-password`, { method: "POST" });
}

// --- Entreprises ---
export function getCompanies() {
  return request("/companies");
}

export function createCompany(payload) {
  return request("/companies", { method: "POST", body: JSON.stringify(payload) });
}

// --- Formations ---
export function getFormations() {
  return request("/formations");
}
export function updateFormation(id, payload) {
  return request(`/formations/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
// Réordonne les formations (glisser-déposer).
export function reorderFormations(ids) {
  return request("/formations/reorder", { method: "PUT", body: JSON.stringify({ ids }) });
}

// --- Parcours documentaire par formation ---
export function getFormationSteps(id) {
  return request(`/formations/${id}/steps`);
}
export function saveFormationSteps(id, steps) {
  return request(`/formations/${id}/steps`, { method: "PUT", body: JSON.stringify({ steps }) });
}

// --- Sessions ---
export function getSessions() {
  return request("/sessions");
}
// Tableau kanban d'une session (colonnes = documents, cartes = stagiaires).
export function getSessionBoard(id) {
  return request(`/sessions/${id}/board`);
}

export function getSession(id) {
  return request(`/sessions/${id}`);
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

export function createEnrollment(payload) {
  return request("/enrollments", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteEnrollment(id) {
  return request(`/enrollments/${id}`, { method: "DELETE" });
}

export function updateEnrollment(id, payload) {
  return request(`/enrollments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// --- Espace stagiaire ---
export function getMonEspace() {
  return request("/mon-espace");
}

export function getMyFormations() {
  return request("/mon-espace/formations");
}

export function getMyFormation(id) {
  return request(`/mon-espace/formations/${id}`);
}

// --- Documents ---
export function getLearnerDocuments(learnerId) {
  return request(`/documents?learner_id=${learnerId}`);
}

export function createDocument(payload) {
  return request("/documents", { method: "POST", body: JSON.stringify(payload) });
}

export function getDocument(id) {
  return request(`/documents/${id}`);
}

// Télécharge le vrai document Word (.docx) rempli (source, secours).
export function downloadDocumentDocx(id, filename = "document.docx") {
  return download(`/documents/${id}/docx`, filename);
}
// Document final PDF (non modifiable) — téléchargement.
export function downloadDocumentPdf(id, filename = "document.pdf") {
  return download(`/documents/${id}/pdf`, filename);
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
export function saveTemplate(slug, payload) {
  return request(`/templates/${slug}`, { method: "PUT", body: JSON.stringify(payload) });
}
export function resetTemplate(slug) {
  return request(`/templates/${slug}`, { method: "DELETE" });
}
// Réordonne les modèles (glisser-déposer).
export function reorderTemplates(slugs) {
  return request("/templates/reorder", { method: "PUT", body: JSON.stringify({ slugs }) });
}
export function downloadTemplateFile(slug) {
  return download(`/templates/${slug}/file`, `${slug}.docx`);
}
// Catalogue des jetons (regroupé par table) pour la palette de l'éditeur.
export function getTokenCatalog() {
  return request("/templates/tokens");
}
// Corps HTML d'un modèle (propre à l'organisme ou modèle par défaut).
export function getTemplateBody(slug) {
  return request(`/templates/${slug}/body`);
}
// Enregistre le contenu construit dans l'éditeur (corps + en-tête + pied de page).
export function saveTemplateBody(slug, payload) {
  return request(`/templates/${slug}`, { method: "PUT", body: JSON.stringify(payload) });
}
export async function uploadTemplate(slug, file) {
  const fd = new FormData();
  fd.append("file", file);
  startLoading();
  let res;
  try {
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
export function getPartenaires(category = "") {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return request(`/partenaires${query}`);
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
