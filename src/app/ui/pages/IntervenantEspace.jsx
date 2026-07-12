import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import {
  getMyIntervenantSheets, signMyIntervenantSheet, getMyIntervenantProfile, setMyIntervenantSignature,
} from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SignatureModal from "../components/SignatureModal.jsx";

const frDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });

function IntervenantEspace() {
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [savedSig, setSavedSig] = useState(null);   // signature enregistrée (cachet)
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(null);     // dessin ponctuel pour une demi-journée
  const [settingSig, setSettingSig] = useState(false); // dessin de la signature enregistrée
  const fileRef = useRef(null);

  async function load() {
    try {
      const [r, p] = await Promise.all([getMyIntervenantSheets(), getMyIntervenantProfile()]);
      setData(r.data || []);
      setSavedSig(p.data?.signature || null);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();

  // Enregistre une signature réutilisable (image importée ou tracé).
  async function saveSignature(dataUrl) {
    try {
      await setMyIntervenantSignature(dataUrl);
      setSettingSig(false);
      setStatus({ type: "success", message: dataUrl ? "Signature enregistrée." : "Signature supprimée." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setStatus({ type: "error", message: "Choisissez un fichier image." }); return; }
    const reader = new FileReader();
    reader.onload = () => saveSignature(String(reader.result));
    reader.readAsDataURL(file);
  }

  // Signature d'une demi-journée : cachet enregistré (1 clic) ou tracé.
  async function oneClick(s, sl) {
    try {
      await signMyIntervenantSheet({ session_id: s.session_id, date: sl.date, slot: sl.slot, use_saved: true });
      setStatus({ type: "success", message: "Demi-journée signée." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function drawSign({ signer_name, signature_data }) {
    try {
      await signMyIntervenantSheet({ ...signing, signature_data, signer_name });
      setSigning(null);
      setStatus({ type: "success", message: "Demi-journée signée." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const toSign = (data || []).reduce((n, s) => n + s.slots.filter((x) => !x.signed).length, 0);

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Espace intervenant</div>
        <h1>Bonjour {user?.first_name}</h1>
        <p>Signez votre présence pour les demi-journées que vous assurez.</p>
        {toSign > 0 && <div className="badge-row"><span className="pill">{toSign} demi-journée(s) à signer</span></div>}
      </div>

      <StatusMessage status={status} />

      <Card title="Ma signature enregistrée">
        <p className="hint" style={{ marginTop: 0 }}>
          Importez un cachet / une signature (idéal pour une société) ou dessinez-la : vous pourrez ensuite signer en un clic.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 200, height: 64, border: "1px dashed var(--border-soft)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden" }}>
            {savedSig ? <img src={savedSig} alt="Signature" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span className="hint">Aucune</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Importer une image</button>
          <button className="btn sm ghost" onClick={() => setSettingSig(true)}>Dessiner</button>
          {savedSig && <button className="btn sm ghost danger" onClick={() => saveSignature(null)}>Supprimer</button>}
        </div>
      </Card>

      {!data ? null : data.length === 0 ? (
        <Card><EmptyState icon="calendar">Aucune session ne vous est affectée pour le moment.</EmptyState></Card>
      ) : (
        data.map((s) => (
          <Card key={s.session_id} title={`${s.program_title || ""} ${s.program_code ? `(${s.program_code})` : ""}`}>
            <p className="hint" style={{ marginTop: 0 }}>
              Semaine {s.week} · {s.year}{s.specialty ? ` · ${s.specialty}` : ""}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {s.slots.map((sl) => (
                <div key={`${sl.date}-${sl.slot}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ flex: 1, minWidth: 0, textTransform: "capitalize" }}>
                    <b>{frDay(sl.date)}</b> · {sl.slot_label}
                  </span>
                  {sl.signed ? (
                    <Badge tone="g">Signé</Badge>
                  ) : (
                    <>
                      {savedSig && <button className="btn sm primary" onClick={() => oneClick(s, sl)}>Signer</button>}
                      <button className="btn sm ghost" onClick={() => setSigning({ session_id: s.session_id, date: sl.date, slot: sl.slot, label: `${frDay(sl.date)} · ${sl.slot_label}` })}>
                        {savedSig ? "Dessiner" : "Signer"}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {signing && (
        <SignatureModal doc={{ label: signing.label }} defaultName={fullName} onConfirm={drawSign} onClose={() => setSigning(null)} />
      )}
      {settingSig && (
        <SignatureModal doc={{ label: "ma signature enregistrée" }} defaultName={fullName}
          onConfirm={({ signature_data }) => saveSignature(signature_data)} onClose={() => setSettingSig(false)} />
      )}
    </>
  );
}

export default IntervenantEspace;
