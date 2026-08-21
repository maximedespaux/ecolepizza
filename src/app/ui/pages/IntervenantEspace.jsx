import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import {
  getMyIntervenantSheets, signMyIntervenantSheet, getMyIntervenantProfile, setMyIntervenantSignature,
} from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Icon } from "../components/Icon.jsx";
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

      {/* LE CHOIX EST LE SUJET DE LA CARTE tant qu'aucune signature n'existe. Il tenait dans
          deux boutons fantômes de la taille d'un lien, à côté d'un cadre vide marqué
          « Aucune » : la page ne montrait rien et ne proposait rien.
          « Dessiner » disparaît du vocabulaire — on ne dessine pas une signature, on signe. */}
      <Card title="Ma signature">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />

        {savedSig ? (
          <div className="sig-ok">
            <div className="sig-cadre"><img src={savedSig} alt="Votre signature enregistrée" /></div>
            <div className="sig-ok-txt">
              <b><Icon name="check-circle" size={16} aria-hidden="true" /> Signature enregistrée</b>
              <span>Vos demi-journées se signent maintenant en un clic.</span>
            </div>
            <div className="sig-ok-act">
              <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={14} aria-hidden="true" /> Remplacer
              </button>
              <button className="btn sm ghost danger" onClick={() => saveSignature(null)}>
                <Icon name="trash" size={14} aria-hidden="true" /> Supprimer
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="sig-intro">Enregistrez-la une seule fois : vous signerez ensuite chaque
              demi-journée d'un clic, sans avoir à la refaire.</p>
            <div className="sig-choix">
              <button type="button" onClick={() => fileRef.current?.click()}>
                <span className="sig-ic"><Icon name="image" size={24} aria-hidden="true" /></span>
                <b>Importer une image</b>
                <i>Le cachet de votre entreprise, ou une signature scannée</i>
              </button>
              <button type="button" onClick={() => setSettingSig(true)}>
                <span className="sig-ic"><Icon name="pencil" size={24} aria-hidden="true" /></span>
                <b>Signer</b>
                <i>Tracez votre signature au doigt ou à la souris</i>
              </button>
            </div>
          </>
        )}
      </Card>

      {/* L'état vide expliquait ce qui manque sans dire d'où ça vient ni ce qu'on peut faire —
          sur une page qui, ce jour-là, n'affiche rien d'autre. Il dit maintenant QUI agit :
          l'intervenant n'a pas la main dessus, c'est l'école qui affecte les sessions. */}
      {!data ? null : data.length === 0 ? (
        <Card>
          <EmptyState icon="calendar" title="Aucune session pour le moment"
            text={"L'école vous affectera à des demi-journées depuis le planning ; elles apparaîtront ici, prêtes à signer. "
              + (savedSig
                ? "Votre signature est déjà enregistrée : il n'y aura qu'à cliquer."
                : "En attendant, enregistrez votre signature ci-dessus — ce sera fait.")} />
        </Card>
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
                    /* Avec une signature enregistrée, « Signer » APPOSE LE CACHET en un clic —
                       c'est le geste courant. Le second bouton n'est là que pour le jour où
                       l'on veut signer autre chose que son cachet ; il le dit, au lieu de
                       proposer de « dessiner ». Sans signature enregistrée, un seul bouton. */
                    <>
                      <button className="btn sm primary"
                        onClick={() => (savedSig
                          ? oneClick(s, sl)
                          : setSigning({ session_id: s.session_id, date: sl.date, slot: sl.slot, label: `${frDay(sl.date)} · ${sl.slot_label}` }))}>
                        Signer
                      </button>
                      {savedSig && (
                        <button className="btn sm ghost" title="Tracer une signature différente pour cette demi-journée"
                          onClick={() => setSigning({ session_id: s.session_id, date: sl.date, slot: sl.slot, label: `${frDay(sl.date)} · ${sl.slot_label}` })}>
                          Signer à la main
                        </button>
                      )}
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
