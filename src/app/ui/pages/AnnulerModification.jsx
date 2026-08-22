import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { annulerModification } from "../api/apiClient.js";

/**
 * « CE N'ÉTAIT PAS MOI » — annulation d'un changement d'e-mail ou de mot de passe.
 *
 * L'annulation s'exécute AU CHARGEMENT (le lien de l'e-mail EST l'intention). Pas de formulaire :
 * la personne a cliqué « ce n'était pas moi », il n'y a rien de plus à demander. On lui montre le
 * résultat, puis on l'oriente vers la reconnexion — toutes les sessions ayant été coupées.
 */
function AnnulerModification() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [etat, setEtat] = useState(token ? "en-cours" : "sans-jeton"); // en-cours | ok | erreur | sans-jeton
  const lance = useRef(false);

  useEffect(() => {
    if (!token || lance.current) return;
    lance.current = true; // n'exécuter qu'une fois (StrictMode monte deux fois en dev)
    annulerModification({ token })
      .then(() => setEtat("ok"))
      .catch(() => setEtat("erreur"));
  }, [token]);

  return (
    <div className="login-panel" style={{ minHeight: "100vh" }}>
      <div className="login-card">
        {etat === "en-cours" && (
          <>
            <div className="eyebrow">Sécurité</div>
            <h1>Annulation en cours…</h1>
            <p className="login-sub"><span className="login-spinner" aria-hidden="true" /> Un instant.</p>
          </>
        )}
        {etat === "ok" && (
          <>
            <div className="eyebrow">C’est annulé</div>
            <h1>Modification annulée</h1>
            <p className="login-sub">
              L’ancienne valeur a été rétablie et <b>toutes les sessions ont été déconnectées</b>.
              Reconnectez-vous, puis changez votre mot de passe par précaution.
            </p>
            <Link to="/login" className="btn primary login-submit">Me reconnecter</Link>
          </>
        )}
        {etat === "erreur" && (
          <>
            <div className="eyebrow">Lien expiré</div>
            <h1>Impossible d’annuler</h1>
            <p className="login-sub">
              Ce lien est invalide ou a dépassé 24 heures. Si vous pensez que votre compte est
              compromis, réinitialisez votre mot de passe et prévenez l’organisme.
            </p>
            <Link to="/mot-de-passe-oublie" className="btn primary login-submit">Réinitialiser mon mot de passe</Link>
          </>
        )}
        {etat === "sans-jeton" && (
          <>
            <div className="eyebrow">Lien invalide</div>
            <h1>Lien incomplet</h1>
            <p className="login-sub">Ce lien d’annulation est incomplet ou a été tronqué.</p>
            <Link to="/login" className="btn primary login-submit">Retour à la connexion</Link>
          </>
        )}
      </div>
    </div>
  );
}

export default AnnulerModification;
