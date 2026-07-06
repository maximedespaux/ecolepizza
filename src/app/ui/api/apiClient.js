const API_BASE_URL = "http://localhost:3000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Requête échouée");
  }

  return data;
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

// --- Sessions ---
export function getSessions() {
  return request("/sessions");
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

export function sendDocument(id) {
  return request(`/documents/${id}/send`, { method: "POST" });
}

export function signDocument(id, payload) {
  return request(`/documents/${id}/sign`, { method: "POST", body: JSON.stringify(payload) });
}

export function deleteDocument(id) {
  return request(`/documents/${id}`, { method: "DELETE" });
}

// --- Partenaires ---
export function getPartenaires(category = "") {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return request(`/partenaires${query}`);
}

export function createPartenaire(payload) {
  return request("/partenaires", { method: "POST", body: JSON.stringify(payload) });
}
