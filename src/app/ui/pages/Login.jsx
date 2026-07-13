import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { login } from "../api/apiClient.js";
import StatusMessage from "../components/StatusMessage.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/* Icônes SVG inline (Lucide) — trait en currentColor, aucun emoji. */
const svgBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};
const IconBuilding = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
    <path d="M9 9v.01" /><path d="M9 12v.01" /><path d="M9 15v.01" /><path d="M9 18v.01" />
  </svg>
);
const IconMail = (p) => (
  <svg {...svgBase} {...p}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
const IconLock = (p) => (
  <svg {...svgBase} {...p}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconEye = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="m2 2 20 20" />
  </svg>
);
const IconCheck = (p) => (
  <svg {...svgBase} {...p}><path d="M20 6 9 17l-5-5" /></svg>
);

/** Écran de connexion : volet marque à gauche, formulaire à droite. */
function Login() {
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const [form, setForm] = useState({ org_code: "", email: "", password: "", stayConnected: true });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

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
      const role = response.data.role;
      navigate(role === "STAGIAIRE" ? "/mon-espace" : role === "PLATFORM_OWNER" ? "/organisations" : "/dashboard");
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const feats = [
    "Génération automatique des documents",
    "Signature électronique & émargement",
    "Conformité Qualiopi suivie en continu",
  ];

  return (
    <div className="login-wrap">
      <aside className="login-aside">
        <div className="login-aside-grid" aria-hidden="true" />
        <div className="login-aside-orb login-aside-orb--1" aria-hidden="true" />
        <div className="login-aside-orb login-aside-orb--2" aria-hidden="true" />
        <div className="login-aside-inner">
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
          <ul className="login-feats">
            {feats.map((f) => (
              <li className="login-feat" key={f}>
                <span className="login-feat-ic"><IconCheck /></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="login-panel">
        <div className="login-card">
          <div className="eyebrow">Connexion</div>
          <h1>Espace secrétariat</h1>
          <p className="login-sub">Connectez-vous pour accéder à votre espace de travail.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="org_code">
                Code organisme <span className="field-opt">(optionnel)</span>
              </label>
              <div className="inp-wrap">
                <span className="inp-ic"><IconBuilding /></span>
                <input
                  id="org_code"
                  className="inp inp--icon"
                  type="text"
                  value={form.org_code}
                  onChange={update("org_code")}
                  placeholder="Laisser vide si vous n'en avez pas"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="inp-wrap">
                <span className="inp-ic"><IconMail /></span>
                <input
                  id="email"
                  className="inp inp--icon"
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  placeholder="admin@ecole-pizza.com"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <div className="inp-wrap">
                <span className="inp-ic"><IconLock /></span>
                <input
                  id="password"
                  className="inp inp--icon inp--pw"
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={update("password")}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="inp-toggle"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-pressed={showPw}
                >
                  {showPw ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            <label className="login-remember">
              <input
                type="checkbox"
                className="login-remember-input"
                checked={form.stayConnected}
                onChange={update("stayConnected")}
              />
              <span className="login-remember-box" aria-hidden="true"><IconCheck /></span>
              Rester connecté
            </label>

            <StatusMessage status={status} />

            <button type="submit" className="btn primary login-submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Connexion…
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

        </div>
      </section>
    </div>
  );
}

export default Login;
