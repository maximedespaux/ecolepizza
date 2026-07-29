// Bus d'erreurs global — jumeau de `loading.js`.
//
// POURQUOI. Une quarantaine d'appels du front attrapent l'erreur d'une requête et la jettent
// (`catch { /* ignore */ }`), plusieurs avec le commentaire « la barre d'erreur globale
// s'affiche »… alors qu'aucune barre d'erreur n'existait. Résultat : on cliquait « J'aime »,
// « Enregistrer dans mes fiches » ou « Supprimer », rien ne se passait, et rien n'expliquait
// pourquoi. Une liste vide par panne réseau était indiscernable d'une liste réellement vide.
//
// CHOIX. Plutôt que de corriger 40 blocs `catch` un par un — fragile, et le 41ᵉ écrit demain
// repartira du mauvais pied —, on pose ici l'infrastructure manquante : `apiClient` publie
// CHAQUE requête en échec, `ErrorBar` l'affiche. Les appelants n'ont rien à changer, et un
// futur `catch` distrait sera couvert d'office.
//
// L'événement passe par `window` plutôt que par un contexte React : ce module est du JS
// ordinaire, il ne doit rien savoir de React ni du routeur.

const EVT = "app:error";

/**
 * Signale une erreur à l'interface.
 * @param {string} message  Le message réel — jamais un texte générique inventé.
 * @param {object} [meta]   Contexte facultatif : { status, path }.
 */
export function reportError(message, meta = {}) {
  if (!message) return;
  window.dispatchEvent(new CustomEvent(EVT, { detail: { message, ...meta } }));
}

export function onError(handler) {
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
