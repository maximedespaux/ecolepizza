import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/apiClient.js";
import { Icon } from "../components/Icon.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

/* Enveloppe : le composant Icon partagé n'a pas de « mail », et la page de connexion utilise
   déjà sa propre version inline — on fait pareil, trait en currentColor, aucun emoji. */
const IconMail = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" width={p.size || 17} height={p.size || 17}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

/**
 * « MOT DE PASSE OUBLIÉ » — saisie de l'e-mail, envoi d'un lien de réinitialisation.
 *
 * LA CONFIRMATION EST TOUJOURS LA MÊME, que le compte existe ou non. Le serveur ne le dit jamais
 * (anti-énumération), et l'écran ne doit donc pas non plus : afficher « adresse inconnue »
 * trahirait ce que le serveur cache. On remercie, point — et on invite à regarder les indésirables,
 * puisqu'un domaine jeune y atterrit souvent au début.
 */
function MotDePasseOublie() {
  const [form, setForm] = useState({ org_code: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [status, setStatus] = useState(null);

  const update = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      await forgotPassword(form);
      setEnvoye(true);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-panel" style={{ minHeight: "100vh" }}>
      <div className="login-card">
        <div className="eyebrow">Mot de passe oublié</div>
        <h1>Réinitialiser l’accès</h1>

        {envoye ? (
          <>
            <p className="login-sub" style={{ marginBottom: 18 }}>
              Si un compte correspond à cette adresse, un e-mail contenant un lien de
              réinitialisation vient de partir. Le lien est valable une heure.
            </p>
            <p className="hint" style={{ margin: "0 0 22px" }}>
              <Icon name="info" size={13} /> Vous ne le voyez pas ? Pensez à regarder vos
              courriers indésirables.
            </p>
            <Link to="/login" className="btn primary login-submit">Retour à la connexion</Link>
          </>
        ) : (
          <>
            <p className="login-sub">
              Saisissez l’adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir
              un nouveau mot de passe.
            </p>
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="org_code">Code organisme <span className="field-opt">(optionnel)</span></label>
                <div className="inp-wrap">
                  <span className="inp-ic"><Icon name="building" size={17} /></span>
                  <input id="org_code" className="inp inp--icon" type="text"
                    value={form.org_code} onChange={update("org_code")}
                    placeholder="Laisser vide si vous n'en avez pas" autoComplete="off" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <div className="inp-wrap">
                  <span className="inp-ic"><IconMail size={17} /></span>
                  <input id="email" className="inp inp--icon" type="email"
                    value={form.email} onChange={update("email")}
                    placeholder="vous@exemple.fr" autoComplete="username" required />
                </div>
              </div>

              <StatusMessage status={status} />

              <button type="submit" className="btn primary login-submit" disabled={busy}>
                {busy ? <><span className="login-spinner" aria-hidden="true" /> Envoi…</> : "Envoyer le lien"}
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

export default MotDePasseOublie;
