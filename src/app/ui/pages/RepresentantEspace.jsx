import { useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getRepDocuments, previewRepDocument, signRepDocument } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SignatureModal from "../components/SignatureModal.jsx";
import { Icon } from "../components/Icon.jsx";

const DOC_STATUS = { A_FAIRE: ["À signer", "n"], ENVOYE: ["À signer", "a"], CONSULTE: ["À signer", "a"], SIGNE: ["Signé", "g"] };

function RepresentantEspace() {
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(null);   // document en cours de signature
  const [preview, setPreview] = useState(null);    // { title, html }

  async function load() {
    try { const r = await getRepDocuments(); setData(r.data || { documents: [] }); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();

  async function openPreview(doc) {
    try { const r = await previewRepDocument(doc.id); setPreview({ title: r.data.title, html: r.data.html }); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function doSign({ signer_name, signature_data }) {
    try {
      await signRepDocument(signing.id, { signer_name, signature_data });
      setSigning(null);
      setStatus({ type: "success", message: "Document signé. Merci !" });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const docs = data?.documents || [];
  const toSign = docs.filter((d) => d.status !== "SIGNE").length;

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Espace entreprise</div>
        <h1>Bonjour {user?.first_name}</h1>
        <p>Signez les documents de votre entreprise{data?.company ? ` — ${data.company}` : ""}.</p>
        {toSign > 0 && <div className="badge-row"><span className="pill">{toSign} document(s) à signer</span></div>}
      </div>

      <StatusMessage status={status} />

      <Card title="Documents à signer">
        {!data ? null : docs.length === 0 ? (
          <EmptyState icon="file-text">Aucun document à signer pour le moment.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {docs.map((d) => {
              const [lbl, tone] = DOC_STATUS[d.status] || [d.status, "n"];
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{d.title}</b></span>
                  <Badge tone={tone}>{lbl}</Badge>
                  <button className="btn sm ghost" onClick={() => openPreview(d)}><Icon name="eye" size={15} /> Aperçu</button>
                  {d.status !== "SIGNE" && <button className="btn sm primary" onClick={() => setSigning(d)}><Icon name="pencil" size={15} /> Signer</button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {preview && (
        <div className="overlay" onClick={() => setPreview(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="mhead"><h3 style={{ fontSize: 17 }}>{preview.title}</h3><button className="x" onClick={() => setPreview(null)} aria-label="Fermer">×</button></div>
            <div className="mbody"><div style={{ background: "#fff", padding: 16, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: preview.html }} /></div>
          </div>
        </div>
      )}
      {signing && (
        <SignatureModal doc={{ label: signing.title }} defaultName={fullName} onConfirm={doSign} onClose={() => setSigning(null)} />
      )}
    </>
  );
}

export default RepresentantEspace;
