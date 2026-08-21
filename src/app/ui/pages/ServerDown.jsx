import { Icon } from "../components/Icon.jsx";

/**
 * SERVEUR INDISPONIBLE — affichée quand l'API ne répond pas au chargement.
 *
 * À NE PAS CONFONDRE AVEC « DÉCONNECTÉ » : un 401 signifie « le serveur va bien, vous n'êtes pas
 * identifié » → écran de connexion. Une panne réseau ou un 5xx signifie « le serveur ne répond
 * pas » → cette page. UserContext les distingue en pingant /api/health.
 *
 * ELLE NE DÉPEND DE RIEN : ni contexte, ni route, ni appel réseau au rendu — c'est justement quand
 * tout le reste est en panne qu'elle doit s'afficher. Le seul geste offert est de réessayer.
 */
function ServerDown() {
  return (
    <div className="nf-wrap">
      <div className="nf-visual nf-pizza"><Icon name="alert-triangle" size={64} /></div>
      <h1 className="nf-title" style={{ marginTop: 18 }}>Service momentanément indisponible</h1>
      <p className="nf-text">
        Le serveur ne répond pas pour l'instant. Ce n'est pas votre connexion : c'est de notre
        côté, et c'est généralement passager. Réessayez dans un instant.
      </p>
      <button className="btn primary" onClick={() => window.location.reload()}>
        <Icon name="refresh" size={15} /> Réessayer
      </button>
    </div>
  );
}

export default ServerDown;
