import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getDesinscriptionNewsletter, desinscrireNewsletter } from "../api/apiClient.js";
import { Icon } from "../components/Icon.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/**
 * Page PUBLIQUE (sans compte) de désinscription de la newsletter, atteinte par le lien au bas de
 * chaque e-mail. Hors de l'application authentifiée.
 *
 * EN DEUX TEMPS, exprès : l'ouverture (GET) ne désinscrit PAS — elle valide le lien et demande
 * confirmation. La désinscription n'a lieu qu'au clic sur le bouton (POST). Sans ça, un client mail
 * ou un antivirus qui PRÉ-CHARGE le lien désinscrirait la personne sans qu'elle l'ait voulu.
 */
export default function DesinscriptionNewsletter() {
  const { token } = useParams();
  const [etat, setEtat] = useState(null);   // { prenom, deja_desinscrit }
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    getDesinscriptionNewsletter(token)
      .then((r) => { setEtat(r.data); setErreur(null); })
      .catch((e) => setErreur(e.message));
  }, [token]);

  async function confirmer() {
    setBusy(true); setErreur(null);
    try {
      await desinscrireNewsletter(token);
      setFait(true);
    } catch (e) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  const bonjour = etat?.prenom ? `${etat.prenom}, ` : "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <img src={LOGO} alt="" style={{ width: 32, height: 32, borderRadius: 8, background: "#fff", padding: 3, objectFit: "contain" }} />
        <b style={{ fontSize: 16 }}>Impastio, Newsletter</b>
      </header>

      <main style={{ maxWidth: 560, width: "100%", margin: "0 auto", padding: 20, flex: 1 }}>
        {erreur && !etat ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <Icon name="x" size={28} />
            <p style={{ marginTop: 8 }}>{erreur}</p>
          </div>
        ) : !etat ? (
          <p className="hint">Chargement…</p>
        ) : fait || etat.deja_desinscrit ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <Icon name="check" size={28} />
            <h3 style={{ marginTop: 10 }}>C’est fait.</h3>
            <p className="lead" style={{ marginTop: 6 }}>
              Vous ne recevrez plus les actualités de l’école par e-mail. Vous retrouverez toujours
              les annonces dans votre espace.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Ne plus recevoir les actualités ?</h3>
            <p className="lead">
              {bonjour}vous êtes sur le point de vous désinscrire des actualités de l’école envoyées
              par e-mail. Cela n’a aucune conséquence sur votre formation, votre inscription ni votre
              accès aux services de l’école, et vous pourrez revenir quand vous voudrez.
            </p>
            {erreur && <p style={{ color: "var(--danger, #c0392b)" }}>{erreur}</p>}
            <button className="btn primary" onClick={confirmer} disabled={busy} style={{ marginTop: 8 }}>
              {busy ? "…" : "Me désinscrire"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
