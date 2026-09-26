import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { getEmargementTemplates, updateEmargementTemplate, getOrganisation, updateOrganisation, emargementPreviewPdfUrl } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { reduireEnDataUrl, PROFILS } from "../lib/image.js";

export const EMARG_DEFAULTS = {
  orientation: "landscape", title: "Feuille d'émargement", accent: "#c0392b", show_logo: false,
  show_duration: true, show_horaires: true, show_lieu: true, header_note: "",
  slots: ["MATIN", "APRES_MIDI", "EXAMEN", "DISTANCIEL"],
  show_formateurs: true, show_intervenants: true, show_organization: false, show_hours: true, density: "normal", margin_mm: 10,
  footer_left: "", footer_caption: "Signature et cachet de l'organisme de formation", show_stamp: true,
  extra_columns: [],
};
const SLOT_ORDER = ["MATIN", "APRES_MIDI", "EXAMEN", "DISTANCIEL"];
const SLOT_LABEL = { MATIN: "Matin", APRES_MIDI: "Après-midi", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };

// Éditeur de mise en page d'un modèle de feuille d'émargement (route /modeles/emargement/:id).
export default function EmargementEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(EMARG_DEFAULTS);
  const [name, setName] = useState("");
  const [org, setOrg] = useState({ legal_name: "Organisme de formation", town: "Ville", address: "", zip_code: "", logo_image: null });
  const [status, setStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getOrganisation().then((r) => {
      const d = r.data || {};
      setOrg({ legal_name: d.legal_name || "Organisme de formation", town: d.town || "Ville", address: d.address || "", zip_code: d.zip_code || "", logo_image: d.logo_image || null });
    }).catch(() => {});
    getEmargementTemplates().then((r) => {
      const t = (r.data || []).find((x) => x.id === id);
      if (t) { setName(t.name); setCfg({ ...EMARG_DEFAULTS, ...(t.config || {}) }); }
      else setStatus({ type: "error", message: "Modèle introuvable." });
      setLoaded(true);
    }).catch((e) => { setStatus({ type: "error", message: e.message }); setLoaded(true); });
  }, [id]);

  const set = (k) => (e) => { setCfg((p) => ({ ...p, [k]: e.target.value })); setDirty(true); };
  const setChk = (k) => (e) => { setCfg((p) => ({ ...p, [k]: e.target.checked })); setDirty(true); };
  const toggleSlot = (s) => { setCfg((p) => ({ ...p, slots: SLOT_ORDER.filter((x) => x === s ? !p.slots.includes(s) : p.slots.includes(x)) })); setDirty(true); };
  // Colonnes personnalisées.
  const addCol = () => { setCfg((p) => ({ ...p, extra_columns: [...(p.extra_columns || []), { label: "Colonne", text: "", side: "before", width_mm: 24 }] })); setDirty(true); };
  const setCol = (i, k, v) => { setCfg((p) => { const ec = [...(p.extra_columns || [])]; ec[i] = { ...ec[i], [k]: v }; return { ...p, extra_columns: ec }; }); setDirty(true); };
  const delCol = (i) => { setCfg((p) => ({ ...p, extra_columns: (p.extra_columns || []).filter((_, j) => j !== i) })); setDirty(true); };

  async function save() {
    setSaving(true);
    try {
      await updateEmargementTemplate(id, { name, config: cfg });
      setDirty(false);
      setStatus({ type: "success", message: "Mise en page enregistrée. Régénérez l'émargement d'une session pour l'appliquer." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }
  async function onLogo(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    /* RÉDUIT, PLUS REFUSÉ. Profil `marque` : la TRANSPARENCE est gardée — un logo aplati sur du
       blanc traîne un rectangle visible sur le papier à en-tête comme sur le thème sombre. */
    try {
      const logo = await reduireEnDataUrl(f, PROFILS.marque);
      await updateOrganisation({ logo_image: logo });
      setOrg((p) => ({ ...p, logo_image: logo }));
      setStatus({ type: "success", message: "Logo enregistré." });
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  async function removeLogo() {
    try { await updateOrganisation({ logo_image: "" }); setOrg((p) => ({ ...p, logo_image: null })); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  const Toggle = ({ k, label }) => (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
      <input type="checkbox" checked={!!cfg[k]} onChange={setChk(k)} /> {label}
    </label>
  );

  return (
    <>
      <PageHead eyebrow="Modèles" title={`Feuille d'émargement, ${name || "…"}`}
        lead="Mise en page du modèle. Les colonnes s'adaptent au nombre de jours ; la feuille tient sur une page. L'aperçu est la feuille elle-même, rendue sur un exemple."
        actions={<button className="btn ghost" onClick={() => navigate("/modeles")}><Icon name="chevron-left" size={14} aria-hidden="true" /> Retour aux documents</button>} />
      <StatusMessage status={status} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Mise en page">
          <div className="field"><label>Nom du modèle</label>
            <input className="inp" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></div>

          <div className="field"><label>Orientation</label>
            <select value={cfg.orientation} onChange={set("orientation")}>
              <option value="landscape">Paysage</option>
              <option value="portrait">Portrait</option>
            </select></div>

          <div className="field"><label>Titre</label>
            <input className="inp" value={cfg.title} onChange={set("title")} placeholder="Feuille d'émargement" /></div>

          <div className="field"><label>Couleur d'accent (titre + filet)</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#c0392b"} onChange={set("accent")}
                style={{ width: 46, height: 34, padding: 2, border: "1px solid var(--border-soft)", borderRadius: 8, cursor: "pointer" }} />
              <span className="mono" style={{ fontSize: 12 }}>{cfg.accent}</span>
            </div></div>

          <div className="field"><label>Logo de l'organisme</label>
            <div style={{ display: "grid", gap: 8 }}>
              <Toggle k="show_logo" label="Afficher le logo dans l'en-tête" />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {org.logo_image ? <img src={org.logo_image} alt="logo" style={{ height: 34, maxWidth: 120, objectFit: "contain", border: "1px solid var(--border-soft)", borderRadius: 6, padding: 2 }} /> : <span className="sub" style={{ fontSize: 12 }}>Aucun logo</span>}
                <label className="btn sm ghost" style={{ cursor: "pointer" }}>
                  {org.logo_image ? "Remplacer" : "Ajouter"} <input type="file" accept="image/*" onChange={onLogo} style={{ display: "none" }} />
                </label>
                {org.logo_image ? <button className="btn sm ghost" onClick={removeLogo}>Retirer</button> : null}
              </div>
            </div></div>

          <div className="field"><label>En-tête</label>
            <div style={{ display: "grid", gap: 8 }}>
              <Toggle k="show_duration" label="Afficher la durée (jours · heures)" />
              <Toggle k="show_horaires" label="Horaires en toutes lettres, quand les colonnes ne les portent pas" />
              <Toggle k="show_lieu" label="Afficher le lieu de la session" />
            </div></div>

          <div className="field"><label>Note d'en-tête (optionnel)</label>
            <textarea className="inp" rows={2} value={cfg.header_note} onChange={set("header_note")}
              placeholder="Ligne libre ajoutée sous les infos (ex. mention de financement)…" /></div>

          <div className="field"><label>Colonnes (demi-journées)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {SLOT_ORDER.map((s) => (
                <label key={s} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={cfg.slots.includes(s)} onChange={() => toggleSlot(s)} /> {SLOT_LABEL[s]}
                </label>
              ))}
            </div></div>

          <div className="field"><label>Colonnes personnalisées</label>
            <div style={{ display: "grid", gap: 8 }}>
              {(cfg.extra_columns || []).map((c, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 6, alignItems: "center" }}>
                  <input className="inp" value={c.label} onChange={(e) => setCol(i, "label", e.target.value)} placeholder="Titre (ex. Entreprise)" />
                  <input className="inp" value={c.text} onChange={(e) => setCol(i, "text", e.target.value)} placeholder="Texte fixe (vide = à remplir)" />
                  <select value={c.side} onChange={(e) => setCol(i, "side", e.target.value)} title="Position">
                    <option value="before">Avant</option>
                    <option value="after">Après</option>
                  </select>
                  <button className="btn sm ghost danger" title="Supprimer" onClick={() => delCol(i)}><Icon name="trash" size={15} /></button>
                </div>
              ))}
              <div><button className="btn sm ghost" onClick={addCol} disabled={(cfg.extra_columns || []).length >= 6}>＋ Ajouter une colonne</button></div>
            </div>
            <span className="hint">Colonnes libres ajoutées au tableau, avant ou après la grille de signatures. Laissez le texte vide pour une colonne à remplir à la main.</span></div>

          <div className="field"><label>Lignes de signature</label>
            <div style={{ display: "grid", gap: 8 }}>
              <Toggle k="show_formateurs" label="Ligne(s) formateur(s)" />
              <Toggle k="show_intervenants" label="Ligne(s) intervenant(s) externe(s)" />
              <Toggle k="show_organization" label="Ligne organisme (signature de l'organisme)" />
              <Toggle k="show_hours" label="Horaires et durées en tête des colonnes" />
            </div></div>

          <div className="row2">
            <div className="field"><label>Densité</label>
              <select value={cfg.density} onChange={set("density")}>
                <option value="compact">Compacte</option>
                <option value="normal">Normale</option>
                <option value="large">Aérée</option>
              </select></div>
            <div className="field"><label>Marge de page : {cfg.margin_mm} mm</label>
              <input type="range" min="4" max="25" value={cfg.margin_mm}
                onChange={(e) => { setCfg((p) => ({ ...p, margin_mm: parseInt(e.target.value, 10) })); setDirty(true); }} style={{ width: "100%" }} /></div>
          </div>

          <div className="field"><label>Pied de page, mention gauche (optionnel)</label>
            <input className="inp" value={cfg.footer_left} onChange={set("footer_left")}
              placeholder="Par défaut : « Fait à {ville}, le {date} »" /></div>

          <div className="field"><label>Pied de page, légende du cachet</label>
            <input className="inp" value={cfg.footer_caption} onChange={set("footer_caption")}
              placeholder="Signature et cachet de l'organisme de formation" /></div>

          <div className="field">
            <Toggle k="show_stamp" label="Intégrer la signature/cachet enregistré(e) de l'organisme" />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="btn primary" onClick={save} disabled={saving || !dirty || !loaded}>{saving ? "…" : "Enregistrer"}</button>
            <button className="btn ghost" onClick={() => { setCfg((p) => ({ ...EMARG_DEFAULTS, slots: [...EMARG_DEFAULTS.slots], title: p.title })); setDirty(true); }} disabled={saving}>Réinitialiser la mise en page</button>
          </div>
        </Card>

        <Card title="Aperçu">
          <ApercuPdf cfg={cfg} />
        </Card>
      </div>
    </>
  );
}

/**
 * L'APERÇU EST LA FEUILLE ELLE-MÊME : le PDF d'une feuille d'exemple, rendu par le moteur des vraies
 * feuilles (LibreOffice compris) avec la mise en page en cours de réglage. Il remplace une imitation
 * en React qui suivait sa propre mise en page : ce qu'on réglait n'était pas ce qu'on imprimait.
 * Rechargé une fraction de seconde après la dernière modification — un rendu PDF prend un instant,
 * pas un par touche frappée.
 */
function ApercuPdf({ cfg }) {
  const [url, setUrl] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [charge, setCharge] = useState(false);
  const cle = JSON.stringify(cfg);
  useEffect(() => {
    let vivant = true;
    let cree = null;
    const minuteur = setTimeout(() => {
      setCharge(true);
      setErreur(null);
      emargementPreviewPdfUrl(JSON.parse(cle))
        .then((u) => { if (!vivant) { URL.revokeObjectURL(u); return; } cree = u; setUrl(u); })
        .catch((e) => { if (vivant) setErreur(e.message); })
        .finally(() => { if (vivant) setCharge(false); });
    }, 600);
    return () => { vivant = false; clearTimeout(minuteur); if (cree) URL.revokeObjectURL(cree); };
  }, [cle]);
  const portrait = cfg.orientation === "portrait";
  return (
    <div>
      {erreur ? <p className="hint" style={{ color: "var(--danger, #c0392b)" }}>{erreur}</p> : null}
      {url ? (
        <iframe title="Aperçu de la feuille d'émargement" src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          style={{ width: "100%", aspectRatio: portrait ? "210 / 297" : "297 / 210", border: "1px solid var(--border-soft)", borderRadius: 8, background: "#fff" }} />
      ) : !erreur ? <p className="hint">Préparation de l'aperçu…</p> : null}
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>
        {charge ? "Mise à jour de l'aperçu… · " : ""}Exemple fictif · {portrait ? "portrait" : "paysage"} · marge {cfg.margin_mm} mm
      </div>
    </div>
  );
}
