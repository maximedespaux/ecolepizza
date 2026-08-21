import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getRepDocuments, previewRepDocument, signRepDocument, setRepStamp } from "../api/apiClient.js";
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
  const [settingStamp, setSettingStamp] = useState(false); // dessin du cachet
  const fileRef = useRef(null);

  async function load() {
    try { const r = await getRepDocuments(); setData(r.data || { documents: [] }); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  const stamp = data?.stamp || null;

  async function saveStamp(dataUrl) {
    try {
      await setRepStamp(dataUrl);
      setSettingStamp(false);
      setStatus({ type: "success", message: dataUrl ? "Cachet enregistré." : "Cachet supprimé." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setStatus({ type: "error", message: "Choisissez un fichier image." }); return; }
    const reader = new FileReader();
    reader.onload = () => saveStamp(String(reader.result));
    reader.readAsDataURL(file);
  }

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
  async function signWithStamp(doc) {
    try {
      await signRepDocument(doc.id, { use_saved: true, signer_name: fullName });
      setStatus({ type: "success", message: "Document signé avec votre cachet." });
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
        <p>Signez les documents de votre entreprise{data?.company ? `, ${data.company}` : ""}.</p>
        {toSign > 0 && <div className="badge-row"><span className="pill">{toSign} document(s) à signer</span></div>}
      </div>

      <StatusMessage status={status} />

      <Card title="Mon cachet enregistré">
        <p className="hint" style={{ marginTop: 0 }}>
          Importez le cachet / la signature de l'entreprise (ou dessinez-le) : vous pourrez ensuite signer vos documents en un clic.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 200, height: 64, border: "1px dashed var(--border-soft)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden" }}>
            {stamp ? <img src={stamp} alt="Cachet" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span className="hint">Aucun</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Importer une image</button>
          <button className="btn sm ghost" onClick={() => setSettingStamp(true)}>Dessiner</button>
          {stamp && <button className="btn sm ghost danger" onClick={() => saveStamp(null)}>Supprimer</button>}
        </div>
      </Card>

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
                  {d.status !== "SIGNE" && stamp && <button className="btn sm primary" onClick={() => signWithStamp(d)} title="Signer avec le cachet enregistré"><Icon name="check" size={15} /> Signer</button>}
                  {d.status !== "SIGNE" && <button className="btn sm ghost" onClick={() => setSigning(d)}><Icon name="pencil" size={15} /> {stamp ? "Dessiner" : "Signer"}</button>}
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
      {settingStamp && (
        <SignatureModal doc={{ label: "mon cachet enregistré" }} defaultName={fullName}
          onConfirm={({ signature_data }) => saveStamp(signature_data)} onClose={() => setSettingStamp(false)} />
      )}
    </>
  );
}

export default RepresentantEspace;
