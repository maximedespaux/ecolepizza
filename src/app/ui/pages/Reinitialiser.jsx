import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/apiClient.js";
import { Icon } from "../components/Icon.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

/**
 * RÉINITIALISATION — pose du nouveau mot de passe à partir du jeton reçu par e-mail.
 *
 * Le jeton vit dans l'URL (`?token=…`). On ne le décode pas côté navigateur : sa validité (et son
 * usage unique) est vérifiée par le serveur, qui le refuse s'il est expiré ou déjà utilisé. Ici on
 * ne fait que la saisie et deux garde-fous d'ergonomie : longueur minimale et confirmation.
 */
function Reinitialiser() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    if (pw.length < 8) return setStatus({ type: "error", message: "Le mot de passe doit contenir au moins 8 caractères." });
    if (pw !== pw2) return setStatus({ type: "error", message: "Les deux mots de passe ne correspondent pas." });
    setBusy(true);
    try {
      await resetPassword({ token, password: pw });
      setOk(true);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-panel" style={{ minHeight: "100vh" }}>
      <div className="login-card">
        {!token ? (
          <>
            <div className="eyebrow">Lien invalide</div>
            <h1>Lien incomplet</h1>
            <p className="login-sub">
              Ce lien de réinitialisation est incomplet ou a été tronqué. Demandez-en un nouveau.
            </p>
            <Link to="/mot-de-passe-oublie" className="btn primary login-submit">Demander un nouveau lien</Link>
          </>
        ) : ok ? (
          <>
            <div className="eyebrow">C’est fait</div>
            <h1>Mot de passe modifié</h1>
            <p className="login-sub">
              Votre nouveau mot de passe est enregistré. Vous pouvez vous connecter dès maintenant.
            </p>
            <Link to="/login" className="btn primary login-submit">Me connecter</Link>
          </>
        ) : (
          <>
            <div className="eyebrow">Nouveau mot de passe</div>
            <h1>Choisir un mot de passe</h1>
            <p className="login-sub">Au moins 8 caractères. Saisissez-le deux fois pour éviter une faute de frappe.</p>
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="pw">Nouveau mot de passe</label>
                <div className="inp-wrap">
                  <span className="inp-ic"><Icon name="lock" size={17} /></span>
                  <input id="pw" className="inp inp--icon inp--pw" type={show ? "text" : "password"}
                    value={pw} onChange={(e) => setPw(e.target.value)}
                    placeholder="••••••••" autoComplete="new-password" required />
                  <button type="button" className="inp-toggle" onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Masquer" : "Afficher"} aria-pressed={show}>
                    <Icon name={show ? "eye-off" : "eye"} size={17} />
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="pw2">Confirmer le mot de passe</label>
                <div className="inp-wrap">
                  <span className="inp-ic"><Icon name="lock" size={17} /></span>
                  <input id="pw2" className="inp inp--icon" type={show ? "text" : "password"}
                    value={pw2} onChange={(e) => setPw2(e.target.value)}
                    placeholder="••••••••" autoComplete="new-password" required />
                </div>
              </div>

              <StatusMessage status={status} />

              <button type="submit" className="btn primary login-submit" disabled={busy}>
                {busy ? <><span className="login-spinner" aria-hidden="true" /> Enregistrement…</> : "Enregistrer le mot de passe"}
              </button>
            </form>
            <p className="login-legal">
              <Link to="/login">Revenir à la connexion</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default Reinitialiser;
