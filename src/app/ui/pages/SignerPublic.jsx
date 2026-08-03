import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicSignDoc, submitPublicSign } from "../api/apiClient.js";
import SignatureModal from "../components/SignatureModal.jsx";
import { Icon } from "../components/Icon.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/**
 * Page PUBLIQUE (sans compte) de signature d'un document via un lien partageable :
 * un représentant d'entreprise ouvre le lien, consulte le document (qui liste ses
 * stagiaires) et le signe. Hors de l'application authentifiée.
 */
export default function SignerPublic() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => getPublicSignDoc(token).then((r) => { setData(r.data); setError(null); }).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function onSign({ signer_name, signature_data }) {
    setBusy(true);
    try {
      await submitPublicSign(token, { signer_name, signature_data });
      setSigning(false); setDone(true);
    } catch (e) { setError(e.message); setSigning(false); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <img src={LOGO} alt="" style={{ width: 32, height: 32, borderRadius: 8, background: "#fff", padding: 3, objectFit: "contain" }} />
        <b style={{ fontSize: 16 }}>Impasto, Signature de document</b>
      </header>

      <main style={{ maxWidth: 900, width: "100%", margin: "0 auto", padding: 20, flex: 1 }}>
        {error && !data ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <Icon name="x" size={28} /><p style={{ marginTop: 8 }}>{error}</p>
          </div>
        ) : !data ? (
          <p className="hint">Chargement du document…</p>
        ) : (
          <>
            <div className="card" style={{ padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow">{data.company ? `Entreprise · ${data.company}` : "Document à signer"}</div>
                <h2 style={{ margin: "2px 0 0", fontSize: 20 }}>{data.title}</h2>
              </div>
              {done || data.signed ? (
                <span className="badge g" style={{ fontSize: 14, padding: "8px 14px" }}>✅ Signé{data.signer_name ? ` · ${data.signer_name}` : ""}</span>
              ) : (
                <button className="btn primary" onClick={() => setSigning(true)}><Icon name="pencil" size={16} /> {data.label || "Signer le document"}</button>
              )}
            </div>

            {error && <div className="card" style={{ padding: 12, marginBottom: 16, color: "var(--ember1)" }}>{error}</div>}

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <iframe title="Document" srcDoc={data.html} style={{ width: "100%", height: "72vh", border: "none", background: "#fff" }} />
            </div>
          </>
        )}
      </main>

      {signing && (
        <SignatureModal
          doc={{ label: data?.title || "Document" }}
          defaultName={data?.signer_name || data?.company || ""}
          onConfirm={onSign}
          onClose={() => !busy && setSigning(false)}
        />
      )}
    </div>
  );
}
