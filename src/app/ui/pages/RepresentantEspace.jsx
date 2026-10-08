import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getRepDocuments, previewRepDocument, signRepDocument, setRepStamp, repDocumentPdfUrl,
  getRepRemises, remiseFichierUrl, accuserRemise } from "../api/apiClient.js";
import { pingAcces } from "../lib/gamification.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SignatureModal from "../components/SignatureModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { reduireEnDataUrl, PROFILS } from "../lib/image.js";
import { dateHeure } from "../lib/format.js";
import { manquePourRequis } from "../lib/remiseNb.js";

const DOC_STATUS = { A_FAIRE: ["À signer", "n"], ENVOYE: ["À signer", "a"], CONSULTE: ["À signer", "a"], SIGNE: ["Signé", "g"] };

/* Les pastilles d'en-tête — tiennent DANS le hero (page autonome) ET hors de lui (onglet
   « Entreprise » de /mon-espace), d'où `.rep-pill` plutôt que `.pill` (qui n'existe que sous
   `.hero`). « Tout est à jour » seulement une fois les données chargées, sinon ça clignote. */
function Pastilles({ toSign, aConfirmer, ready }) {
  if (toSign > 0 || aConfirmer > 0) {
    return (
      <div className="rep-pills">
        {toSign > 0 && <span className="rep-pill"><Icon name="pencil" size={13} /> {toSign} à signer</span>}
        {aConfirmer > 0 && <span className="rep-pill"><Icon name="check" size={13} /> {aConfirmer} à confirmer</span>}
      </div>
    );
  }
  if (!ready) return null;
  return <div className="rep-pills"><span className="rep-pill ok"><Icon name="check" size={13} /> Tout est à jour</span></div>;
}

/* Sert la page autonome ET l'onglet « Entreprise » de /mon-espace (EMBEDDED) : dans l'onglet, pas
   de grand bandeau « Bonjour » (MonEspace le porte déjà), juste la phrase, l'entreprise et les
   pastilles. */
function RepresentantEspace({ embedded = false } = {}) {
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(null);   // document en cours de signature
  const [preview, setPreview] = useState(null);    // { title, html }
  const [settingStamp, setSettingStamp] = useState(false); // dessin du cachet
  const [remises, setRemises] = useState([]);      // documents remis À L'ENTREPRISE (migration 188)
  const fileRef = useRef(null);

  async function load() {
    /* Les remises à part, et sans message d'erreur : une liste qui ne se charge pas ne doit pas
       masquer les documents à signer, qui restent le cœur de cet espace. */
    getRepRemises().then((r) => setRemises(r.data || [])).catch(() => setRemises([]));
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
  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setStatus({ type: "error", message: "Choisissez un fichier image." }); return; }
    /* LE CACHET SE POSE SUR UN DOCUMENT : sa transparence doit survivre (profil `marque`). Et le
       serveur plafonne la data-URL à 2 Mo — or le base64 pèse un tiers de plus que les octets
       qu'il transporte, si bien qu'une photo de tampon partait en refus sans rien expliquer. */
    try { saveStamp(await reduireEnDataUrl(file, PROFILS.marque)); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
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
      load(); pingAcces(); // la pastille « Entreprise » de la barre retombe aussitôt
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  /* CONFIRMER, C'EST S'ENGAGER — la même question qu'au stagiaire (StudentFormationDetail) : le
     clic produit une preuve datée que l'école opposera lors d'un contrôle. */
  async function confirmerRemise(r) {
    if (!window.confirm(`Confirmer que votre entreprise a bien reçu « ${r.label} »`
      + (r.first_name || r.last_name ? ` (${`${r.first_name || ""} ${r.last_name || ""}`.trim()})` : "") + " ?\n\n"
      + "Ouvrez-le d'abord si ce n'est pas déjà fait : votre confirmation est datée et vaut preuve de remise.")) return;
    try {
      await accuserRemise(r.remise_id);
      setStatus({ type: "success", message: "Réception confirmée. Merci." });
      load(); pingAcces();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function signWithStamp(doc) {
    try {
      await signRepDocument(doc.id, { use_saved: true, signer_name: fullName });
      setStatus({ type: "success", message: "Document signé avec votre cachet." });
      load(); pingAcces();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const docs = data?.documents || [];
  const toSign = docs.filter((d) => d.status !== "SIGNE").length;
  const aConfirmer = remises.filter((r) => r.statut === "REMISE").length;
  const phrase = `${remises.length ? "Signez et recevez" : "Signez"} les documents de votre entreprise.`;

  return (
    <>
      {embedded ? (
        <div style={{ marginBottom: 14 }}>
          <p className="hint" style={{ margin: 0 }}>{phrase}</p>
          {data?.company && <div className="rep-co"><Icon name="building" size={15} /> {data.company}</div>}
          <Pastilles toSign={toSign} aConfirmer={aConfirmer} ready={!!data} />
        </div>
      ) : (
        <div className="hero">
          <Icon name="building" size={150} className="hero-motif" />
          <div className="eyebrow">Espace entreprise</div>
          <h1>Bonjour {user?.first_name}</h1>
          {data?.company && <div className="rep-co"><Icon name="building" size={15} /> {data.company}</div>}
          <p>{phrase}</p>
          <Pastilles toSign={toSign} aConfirmer={aConfirmer} ready={!!data} />
        </div>
      )}

      <StatusMessage status={status} />

      <Card title="Mon cachet enregistré">
        <p className="hint" style={{ marginTop: 0 }}>
          Importez le cachet / la signature de l'entreprise (ou dessinez-le) : vous pourrez ensuite signer vos documents en un clic.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 208, height: 70, border: `1px ${stamp ? "solid" : "dashed"} var(--border-soft)`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden" }}>
            {stamp ? <img src={stamp} alt="Cachet" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span className="hint" style={{ margin: 0 }}>Aucun cachet</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onUpload} />
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}><Icon name="download" size={15} /> Importer une image</button>
          <button className="btn sm ghost" onClick={() => setSettingStamp(true)}><Icon name="pencil" size={15} /> Dessiner</button>
          {stamp && <button className="btn sm ghost danger" onClick={() => saveStamp(null)}>Supprimer</button>}
        </div>
        {stamp && (
          <p className="hint" style={{ margin: "12px 0 0", color: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={14} /> Prêt : vos documents se signent en un clic.
          </p>
        )}
      </Card>

      <Card title="Documents à signer">
        {!data ? null : docs.length === 0 ? (
          <EmptyState icon="file-text">Aucun document à signer pour le moment.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {docs.map((d) => {
              const [lbl, tone] = DOC_STATUS[d.status] || [d.status, "n"];
              const signed = d.status === "SIGNE";
              return (
                <div key={d.id} className="stu-row">
                  <span className={"rep-ico" + (signed ? " ok" : "")}><Icon name={signed ? "check" : "file-text"} size={18} /></span>
                  <span className="stu-row-t">
                    <b>{d.title}</b>
                    {signed && d.signed_at && <span className="rep-sub">Signé le {dateHeure(d.signed_at)}{d.signer_name ? ` · ${d.signer_name}` : ""}</span>}
                  </span>
                  <Badge tone={tone}>{lbl}</Badge>
                  <button className="btn sm ghost" onClick={() => openPreview(d)}><Icon name="eye" size={15} /> Aperçu</button>
                  {/* UNE FOIS SIGNÉ, l'entreprise récupère SON exemplaire (PDF signé, scellé + contre-
                      signé par l'organisme) — le document qui fait foi. */}
                  {signed && <button className="btn sm ghost" onClick={() => window.open(repDocumentPdfUrl(d.id), "_blank", "noopener")} title="Télécharger le PDF signé"><Icon name="download" size={15} /> Télécharger</button>}
                  {!signed && stamp && <button className="btn sm primary" onClick={() => signWithStamp(d)} title="Signer avec le cachet enregistré"><Icon name="check" size={15} /> Signer</button>}
                  {!signed && <button className="btn sm ghost" onClick={() => setSigning(d)}><Icon name="pencil" size={15} /> {stamp ? "Dessiner" : "Signer"}</button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* CE QUE L'ÉCOLE REMET À L'ENTREPRISE (migration 188) : un type de remise destiné à
          l'entreprise ne va plus au stagiaire, il arrive ICI, et c'est ce compte qui en accuse
          réception. Rien ne s'affiche tant qu'il n'y a rien : une carte vide n'a rien à dire à une
          entreprise dont l'école ne remet aucun document. */}
      {remises.length > 0 && (
        <Card title="Documents remis à votre entreprise">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {remises.map((r) => {
              const recue = r.statut === "RECUE";
              const nom = `${r.first_name || ""} ${r.last_name || ""}`.trim();
              const manque = manquePourRequis({ nb_mode: r.nb_mode, nb_documents: r.nb_documents, nb_fichiers: (r.fichiers || []).length });
              return (
                <div key={r.remise_id} className="stu-row" style={{ alignItems: "flex-start" }}>
                  <span className={"rep-ico" + (recue ? " ok" : "")}><Icon name={recue ? "check" : "package"} size={18} /></span>
                  <span className="stu-row-t">
                    <b>{r.label}</b>
                    {(nom || r.formation) && <span className="rep-sub">{[nom, r.formation].filter(Boolean).join(" · ")}</span>}
                    {r.consigne && <span className="rep-sub">{r.consigne}</span>}
                    {r.accuse_le && <span className="rep-sub" style={{ color: "var(--green)" }}>Réception confirmée le {dateHeure(r.accuse_le)}.</span>}
                  </span>
                  <Badge tone={recue ? "g" : "b"}>{recue ? "Reçu" : "À confirmer"}</Badge>
                  {(r.fichiers || []).map((f, k) => (
                    <button key={f.id} className="btn sm ghost"
                      aria-label={`Voir ${f.nom || `le document ${k + 1}`}, ${r.label}`}
                      onClick={() => window.open(remiseFichierUrl(f.id), "_blank", "noopener")}>
                      <Icon name="eye" size={15} /> Voir{r.fichiers.length > 1 ? ` (${k + 1})` : ""}
                    </button>
                  ))}
                  {r.statut === "REMISE" && (manque > 0 ? (
                    /* Type « requis » (migration 203) : on ne confirme qu'une fois tous les documents là. */
                    <span className="hint">En attente de {manque} document(s) de plus.</span>
                  ) : (
                    <button className="btn sm primary" onClick={() => confirmerRemise(r)}>
                      <Icon name="check" size={15} /> J'ai bien reçu
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {preview && (
        <div className="overlay">
          <div className="modal wide">
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
