import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { getEmargementTemplates, updateEmargementTemplate, getOrganisation, updateOrganisation } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

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
const DENSITY_PX = { compact: { base: 8.5, name: 8.5, sub: 7.5, row: 30 }, normal: { base: 9, name: 9.5, sub: 8, row: 38 }, large: { base: 10.5, name: 11, sub: 9, row: 46 } };

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
  function onLogo(e) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { setStatus({ type: "error", message: "Logo trop lourd (max 1,5 Mo)." }); return; }
    const rd = new FileReader();
    rd.onload = async () => {
      try { await updateOrganisation({ logo_image: rd.result }); setOrg((p) => ({ ...p, logo_image: rd.result })); setStatus({ type: "success", message: "Logo enregistré." }); }
      catch (err) { setStatus({ type: "error", message: err.message }); }
    };
    rd.readAsDataURL(f);
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
      <PageHead eyebrow="Modèles" title={`Feuille d'émargement — ${name || "…"}`}
        lead="Mise en page du modèle. Les colonnes s'adaptent au nombre de jours ; la feuille tient sur une page."
        actions={<button className="btn ghost" onClick={() => navigate("/modeles")}>← Retour aux documents</button>} />
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
              <Toggle k="show_horaires" label="Afficher les horaires de la formation" />
              <Toggle k="show_lieu" label="Afficher le lieu (adresse organisme)" />
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
              <Toggle k="show_hours" label="Lignes récap horaires + volume" />
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

          <div className="field"><label>Pied de page — mention gauche (optionnel)</label>
            <input className="inp" value={cfg.footer_left} onChange={set("footer_left")}
              placeholder="Par défaut : « Fait à {ville}, le {date} »" /></div>

          <div className="field"><label>Pied de page — légende du cachet</label>
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
          <EmargementPreview cfg={cfg} org={org} />
        </Card>
      </div>
    </>
  );
}

// Aperçu HTML mimant le rendu PDF avec des données d'exemple.
export function EmargementPreview({ cfg, org }) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#c0392b";
  const dens = DENSITY_PX[cfg.density] || DENSITY_PX.normal;
  const orgAddr = [org.address, [org.zip_code, org.town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const today = new Date().toLocaleDateString("fr-FR");
  const exDays = [{ label: "Lun. 06/07" }, { label: "Mar. 07/07" }];
  const activeSlots = SLOT_ORDER.filter((s) => cfg.slots.includes(s)).filter((s) => s === "MATIN" || s === "APRES_MIDI");
  const shownSlots = activeSlots.length ? activeSlots : ["MATIN"];
  const cols = exDays.flatMap((d, di) => shownSlots.map((s) => ({ d: d.label, s, di })));
  const sampleSched = [
    { MATIN: ["8h45", "12h00"], APRES_MIDI: ["13h00", "17h15"] },
    { MATIN: ["8h00", "12h00"], APRES_MIDI: ["13h00", "16h30"] },
  ];
  const toM = (t) => { const m = t.match(/(\d+)h(\d*)/); return +m[1] * 60 + (m[2] ? +m[2] : 0); };
  const sTime = (c) => { const r = sampleSched[c.di] && sampleSched[c.di][c.s]; return r ? `${r[0]} – ${r[1]}` : ""; };
  const sVol = (c) => { const r = sampleSched[c.di] && sampleSched[c.di][c.s]; if (!r) return ""; const d = toM(r[1]) - toM(r[0]); return `${Math.floor(d / 60)}h${String(d % 60).padStart(2, "0")}`; };

  const cell = (i, on) => on ? (
    <td key={i} style={{ border: "1px solid #cfd2d8", height: dens.row }}>
      {i % 2 === 0 ? <span style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontSize: 15, color: "#2b2f45" }}>Signé</span> : null}
    </td>
  ) : <td key={i} style={{ border: "1px solid #cfd2d8", background: "#f4f4f6" }} />;

  const rows = [{ name: "LEFEBVRE Camille", sub: "Stagiaire", on: () => true }];
  if (cfg.show_formateurs) rows.push({ name: "MOREAU Julien", sub: "Formateur", on: () => true });
  if (cfg.show_intervenants) rows.push({ name: "GIRARD Sophie", sub: "Hygiène (HACCP)", on: (i) => i >= shownSlots.length });
  if (cfg.show_organization) rows.push({ name: org.legal_name || "Organisme de formation", sub: "Organisme de formation", on: () => true });

  const pageW = cfg.orientation === "portrait" ? 500 : 720;
  const extra = cfg.extra_columns || [];
  const beforeEx = extra.filter((x) => x.side !== "after");
  const afterEx = extra.filter((x) => x.side === "after");
  const exHead = (arr) => arr.map((x, j) => <th key={"eh" + x.side + j} rowSpan={2} style={{ border: "1px solid #cfd2d8", background: "#f5f3f0", textTransform: "uppercase", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>{x.label}</th>);
  const exBody = (arr, info) => arr.map((x, j) => <td key={"eb" + x.side + j} style={{ border: "1px solid #cfd2d8", fontSize: dens.sub, color: "#555", padding: "2px 4px", background: info ? "#faf7f2" : undefined }}>{info ? "" : (x.text || "")}</td>);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ background: "#fff", color: "#1e2140", padding: 16, border: "1px solid var(--border-soft)", borderRadius: 8, fontFamily: "'Helvetica Neue',Arial,sans-serif", fontSize: dens.base + 1, width: pageW }}>
        <div style={{ position: "relative", borderBottom: `2px solid ${accent}`, paddingBottom: 8, marginBottom: 10 }}>
          {cfg.show_logo && org.logo_image ? <img src={org.logo_image} alt="" style={{ position: "absolute", top: 0, right: 0, maxHeight: 44, maxWidth: 140, objectFit: "contain" }} /> : null}
          <div style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: accent }}>{cfg.title || "Feuille d'émargement"}</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{org.legal_name}</div>
          <div style={{ color: "#444", lineHeight: 1.5, marginTop: 3 }}>
            Intitulé de l'action de formation : <b>Pizzaïolo Niveau I</b> (NIV1)<br />
            Date(s) : <b>du 06/07/2026 au 07/07/2026</b> — Semaine 28/2026{cfg.show_duration ? " · Durée : 2 jours · 14 h" : ""}<br />
            {cfg.show_horaires ? <>Horaires : 9h00 – 12h30 / 13h30 – 17h00<br /></> : null}
            {cfg.header_note ? <>{cfg.header_note}<br /></> : null}
            {cfg.show_lieu && orgAddr ? `Lieu : ${orgAddr}` : null}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 130, textAlign: "left", border: "1px solid #cfd2d8", background: "#f5f3f0", textTransform: "uppercase", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>Nom et prénom</th>
              {exHead(beforeEx)}
              {exDays.map((d) => (<th key={d.label} colSpan={shownSlots.length} style={{ border: "1px solid #cfd2d8", background: "#f5f3f0", textTransform: "uppercase", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>{d.label}</th>))}
              {exHead(afterEx)}
            </tr>
            <tr>{cols.map((c, i) => (<th key={i} style={{ border: "1px solid #cfd2d8", background: "#f5f3f0", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>{SLOT_LABEL[c.s]}</th>))}</tr>
          </thead>
          <tbody>
            {(() => {
              const infoTr = (label, fn, key) => (
                <tr key={key}>
                  <td style={{ border: "1px solid #cfd2d8", textAlign: "left", fontWeight: 600, fontSize: dens.sub, color: "#333", background: "#faf7f2", padding: "2px 4px" }}>{label}</td>
                  {exBody(beforeEx, true)}
                  {cols.map((c, i) => <td key={i} style={{ border: "1px solid #cfd2d8", fontSize: dens.sub, color: "#555", background: "#faf7f2", padding: "2px 4px" }}>{fn(c)}</td>)}
                  {exBody(afterEx, true)}
                </tr>
              );
              const out = [];
              if (cfg.show_hours) out.push(infoTr("Horaires", sTime, "hr"));
              let volDone = false;
              rows.forEach((r, ri) => {
                if (cfg.show_hours && !volDone && r.sub === "Formateur") { out.push(infoTr("Volume horaire", sVol, "vol")); volDone = true; }
                out.push(
                  <tr key={ri}>
                    <td style={{ border: "1px solid #cfd2d8", textAlign: "left", fontWeight: 600, fontSize: dens.name, padding: "3px 4px" }}>{r.name}<div style={{ fontWeight: 400, fontSize: dens.sub, color: "#8a8f99" }}>{r.sub}</div></td>
                    {exBody(beforeEx, false)}
                    {cols.map((c, i) => r.on(i) ? cell(i, true) : <td key={i} style={{ border: "1px solid #cfd2d8", background: "#f4f4f6" }} />)}
                    {exBody(afterEx, false)}
                  </tr>
                );
              });
              return out;
            })()}
          </tbody>
        </table>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>{cfg.footer_left ? cfg.footer_left : `Fait à ${org.town}, le ${today}`}</div>
          <div style={{ textAlign: "center" }}>
            {cfg.show_stamp ? <div style={{ width: 120, height: 34, border: "1px dashed #cbd0d8", borderRadius: 4, margin: "0 auto 2px", display: "grid", placeItems: "center", color: "#aab", fontSize: 9 }}>cachet</div> : null}
            {cfg.footer_caption ? <div style={{ fontSize: 9, color: "#555" }}>{cfg.footer_caption}</div> : null}
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>Aperçu {cfg.orientation === "portrait" ? "portrait" : "paysage"} · marge {cfg.margin_mm} mm</div>
      </div>
    </div>
  );
}
