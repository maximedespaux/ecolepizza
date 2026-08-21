import { API_BASE_URL } from "../api/apiClient.js";

// Client temps réel (SSE). Ouvre UN seul flux `EventSource` partagé par toute l'appli
// et notifie les abonnés quand le serveur signale un changement (« refresh »).
// L'EventSource se reconnecte tout seul en cas de coupure. Les événements sont
// « débouncés » : une rafale de modifications ne déclenche qu'un seul rechargement.

let es = null;
const subscribers = new Set();
let debounce = null;

function notify() {
  if (debounce) return;
  debounce = setTimeout(() => {
    debounce = null;
    subscribers.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  }, 350);
}

function connect() {
  if (es || typeof EventSource === "undefined") return;
  try {
    es = new EventSource(`${API_BASE_URL}/events`, { withCredentials: true });
    es.addEventListener("refresh", notify);
    // onerror : l'EventSource tente de se reconnecter automatiquement ; rien à faire.
  } catch {
    es = null;
  }
}

function disconnect() {
  if (es) { try { es.close(); } catch { /* ignore */ } es = null; }
}

/**
 * Abonne une fonction aux notifications temps réel. Renvoie la fonction de désabonnement.
 * Le flux SSE s'ouvre au premier abonné et se ferme quand il n'en reste plus.
 */
export function subscribeRealtime(fn) {
  subscribers.add(fn);
  connect();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) disconnect();
  };
}
