import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { login } from "../api/apiClient.js";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/** Écran de connexion : volet marque à gauche, formulaire à droite. */
function Login() {
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "", stayConnected: true });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const response = await login(form);
      setUser(response.data);
      navigate(response.data.role === "STAGIAIRE" ? "/mon-espace" : "/dashboard");
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <aside className="login-aside">
        <div className="login-brandmark">
          <img src={LOGO} alt="École Pizza" />
          <div>
            <div className="lb-name">Impasto</div>
            <div className="lb-sub">École Pizza · Jean-Jacques Despaux</div>
          </div>
        </div>
        <h2 className="login-tag">Le secrétariat de votre organisme, simplifié.</h2>
        <p className="login-blurb">
          Stagiaires, documents, signatures, émargement et suivi Qualiopi —
          réunis dans un seul outil, pensé pour l'École Pizza.
        </p>
        <div className="login-feats">
          <div className="login-feat">✓ Génération automatique des documents</div>
          <div className="login-feat">✓ Signature électronique &amp; émargement</div>
          <div className="login-feat">✓ Conformité Qualiopi suivie en continu</div>
        </div>
      </aside>

      <section className="login-panel">
        <div className="login-card">
          <div className="eyebrow">Connexion</div>
          <h1>Espace secrétariat</h1>
          <form onSubmit={handleSubmit}>
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder="admin@ecole-pizza.com"
              autoComplete="username"
              required
            />
            <Field
              label="Mot de passe"
              type="password"
              value={form.password}
              onChange={update("password")}
              autoComplete="current-password"
              required
            />
            <StatusMessage status={status} />
            <button type="submit" className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} disabled={busy}>
              {busy ? "Connexion…" : "Se connecter"}
            </button>
          </form>
          <p className="login-hint">
            Compte de démonstration : <b>admin@ecole-pizza.com</b> / <b>impasto123</b>
          </p>
        </div>
      </section>
    </div>
  );
}

export default Login;
