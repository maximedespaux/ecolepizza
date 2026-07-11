import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildExtensions } from "../lib/editorConfig.js";
import RichToolbar from "../components/RichToolbar.jsx";
import { getTokenCatalog, getTemplateBody, saveTemplateBody, templatePreviewPdfUrl } from "../api/apiClient.js";
import StatusMessage from "../components/StatusMessage.jsx";
import FieldSettingsPanel from "../components/FieldSettingsPanel.jsx";

const EMPTY = /^\s*(<p>(\s|<br\/?>)*<\/p>\s*)?$/i; // corps « vide »
const clean = (html) => (EMPTY.test(html || "") ? "" : html);

// Estimation de la hauteur (pt) d'un bandeau — MÊME calcul que le rendu PDF côté serveur
// (lib/pdfcompose.estimateStripHeightPt), pour que le repère de fin de page corresponde.
const PT_PER_MM = 2.834645669;
const CONTENT_PX = Math.round((210 - 36) * 96 / 25.4); // largeur utile (marges 18mm) ≈ 658 px
const FULL_PX = Math.round(210 * 96 / 25.4);           // pleine largeur (bord à bord) ≈ 793 px
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function estimateStripPt(html, contentPx, fill) {
  let pt = 0;
  const imgs = String(html || "").match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgs) {
    const wm = tag.match(/\bwidth\s*=\s*["']?(\d+)/i) || tag.match(/width\s*:\s*(\d+)\s*px/i);
    const hm = tag.match(/\bheight\s*=\s*["']?(\d+)/i) || tag.match(/height\s*:\s*(\d+)\s*px/i);
    let w = wm ? +wm[1] : contentPx;
    let h = hm ? +hm[1] : 0;
    let target = null;
    if (w > contentPx) target = contentPx;                    // trop large → réduit
    else if (fill && w >= contentPx * 0.5) target = contentPx; // bord à bord → étiré
    if (target && h) h = h * target / w;
    if (!h) h = (target || w) * 0.22;
    pt += h * 72 / 96;
  }
  const textBlocks = (String(html || "").replace(/<img\b[^>]*>/gi, "").match(/<(p|div|h[1-6]|li|br)\b/gi) || []).length;
  pt += Math.max(textBlocks, imgs.length ? 0 : 1) * 16;
  pt += 14;
  return pt;
}

// Bascule « bord à bord » (sans marge) d'une zone.
function BleedToggle({ on, onChange }) {
  return (
    <label className="bleed-tog" title="Sans marge : le contenu occupe toute la largeur / le bord de la page">
      <input type="checkbox" checked={on} onChange={onChange} /> bord à bord
    </label>
  );
}

function TemplateEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfErr, setPdfErr] = useState(null);
  const [bleed, setBleed] = useState({ header: false, body: false, footer: false }); // « bord à bord » par zone
  const toggleBleed = (k) => setBleed((p) => ({ ...p, [k]: !p[k] }));
  const [openGroups, setOpenGroups] = useState({});
  const [active, setActive] = useState(null); // éditeur ayant le focus (cible palette/toolbar)
  const [sigLabel, setSigLabel] = useState(""); // libellé d'un bloc de signature personnalisé
  const [showFields, setShowFields] = useState(false); // modale « Champs documents »
  const fieldsRef = useRef(null);
  const [, force] = useState(0);

  const opts = (cls) => ({
    extensions: buildExtensions(),
    content: "",
    editorProps: { attributes: { class: cls } },
    onFocus: ({ editor }) => setActive(editor),
    onSelectionUpdate: () => force((n) => n + 1), // rafraîchit l'état actif de la barre
    onUpdate: () => force((n) => n + 1),          // recalcule le repère de fin de page
  });
  const header = useEditor(opts("doc-canvas hf"));
  const body = useEditor(opts("doc-canvas"));
  const footer = useEditor(opts("doc-canvas hf"));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, res] = await Promise.all([getTokenCatalog(), getTemplateBody(slug)]);
        if (!alive) return;
        setCatalog(cat.data || []);
        setOpenGroups(Object.fromEntries((cat.data || []).map((g, i) => [g.group, i === 0])));
        const d = res.data || {};
        if (body) body.commands.setContent(d.body_html || "<p></p>");
        if (header) header.commands.setContent(d.header_html || "");
        if (footer) footer.commands.setContent(d.footer_html || "");
        const bl = (d.layout && d.layout.bleed) || {};
        setBleed({ header: !!bl.header, body: !!bl.body, footer: !!bl.footer });
      } catch (e) { if (alive) setStatus({ type: "error", message: e.message }); }
    })();
    return () => { alive = false; };
  }, [slug, body, header, footer]);

  // Aperçu PDF fidèle : on rend le modèle en cours d'édition côté serveur (mêmes
  // en-tête/pied répétés sur chaque page que le document final) et on l'affiche en iframe.
  useEffect(() => {
    if (!showPreview) return undefined;
    let alive = true; let created = null;
    setPdfLoading(true); setPdfErr(null);
    templatePreviewPdfUrl(slug, {
      body_html: body?.getHTML() || "<p></p>",
      header_html: clean(header?.getHTML()),
      footer_html: clean(footer?.getHTML()),
      layout: { bleed },
    })
      .then((url) => { if (!alive) { URL.revokeObjectURL(url); return; } created = url; setPdfUrl(url); })
      .catch((e) => { if (alive) setPdfErr(e.message); })
      .finally(() => { if (alive) setPdfLoading(false); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, bleed]);

  const target = active || body;

  // Marges réservées à l'en-tête et au pied, calculées EXACTEMENT comme le rendu PDF
  // (à partir des dimensions du bandeau dans le HTML). La zone utile du corps en découle,
  // convertie en pixels éditeur ; BODY_RATIO corrige le petit écart de rendu de ligne.
  const PX_PER_MM = 660 / 174;   // colonne page ≈ 174 mm sur ~660 px
  const BODY_RATIO = 0.94;       // ligne éditeur légèrement plus serrée que le PDF
  const HEADER_TOP_MM = 12, FOOTER_BOTTOM_MM = 10, GAP_MM = 3;
  const hHTML = header?.getHTML() || "";
  const fHTML = footer?.getHTML() || "";
  const hasCustomHeader = !!clean(hHTML);
  const hasFooter = !!clean(fHTML);
  const hTop = bleed.header ? 0 : HEADER_TOP_MM;
  const fBot = bleed.footer ? 0 : FOOTER_BOTTOM_MM;
  const topReserveMm = hasCustomHeader
    ? clampN(hTop + estimateStripPt(hHTML, bleed.header ? FULL_PX : CONTENT_PX, bleed.header) / PT_PER_MM + GAP_MM, hTop + 6, 120)
    : 34; // papier à en-tête automatique (approx.)
  const botReserveMm = hasFooter
    ? clampN(fBot + estimateStripPt(fHTML, bleed.footer ? FULL_PX : CONTENT_PX, bleed.footer) / PT_PER_MM + GAP_MM, fBot + 6, 100)
    : 20;
  const bodyAreaMm = Math.max(60, 297 - topReserveMm - botReserveMm);
  const pageContentPx = Math.round(bodyAreaMm * PX_PER_MM * BODY_RATIO);

  function insertToken(t) {
    target?.chain().focus().insertToken({ token: t.key, label: t.label }).run();
  }
  // Bloc de signature nommé : jeton « sig:<clé> » signé indépendamment par la personne attribuée.
  const sigKey = (label) => "sig:" + String(label || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 40);
  function insertSignature(label) {
    const lbl = String(label || "").trim();
    if (!lbl) return;
    target?.chain().focus().insertToken({ token: sigKey(lbl), label: lbl }).run();
  }
  const SIG_PRESETS = ["Jury 1", "Jury 2", "Président du jury", "Formateur", "Intervenant", "Stagiaire 1", "Stagiaire 2", "Stagiaire 3", "Stagiaire 4"];
  function onDrop(ed) {
    return (e) => {
      const raw = e.dataTransfer.getData("application/x-token");
      if (!raw || !ed) return;
      e.preventDefault();
      const t = JSON.parse(raw);
      const pos = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const at = pos ? pos.pos : ed.state.selection.to;
      ed.chain().focus().insertTokenAt(at, { token: t.key, label: t.label }).run();
    };
  }

  async function save() {
    if (!body) return;
    setSaving(true); setStatus(null);
    try {
      await saveTemplateBody(slug, {
        body_html: body.getHTML(),
        header_html: clean(header?.getHTML()),
        footer_html: clean(footer?.getHTML()),
        layout: { bleed },
      });
      setStatus({ type: "success", message: "Modèle enregistré." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="tpl-editor">
      <div className="tpl-editor-head">
        <button className="btn ghost sm" onClick={() => navigate("/modeles")}>← Modèles</button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Éditeur — <span className="mono">{slug}</span></h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => setShowFields(true)} title="Gérer les champs disponibles du dossier">Champs documents</button>
          <button className={"btn sm ghost" + (showPreview ? " on" : "")} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Édition" : "Aperçu"}
          </button>
          <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>

      <StatusMessage status={status} />

      {!showPreview && <RichToolbar editor={target} />}

      <div className="tpl-editor-body">
        {showPreview ? (
          <div className="tpl-doc pdf-preview">
            {pdfLoading && <p className="hint" style={{ padding: 24 }}>Génération de l'aperçu PDF…</p>}
            {pdfErr && <p className="hint" style={{ padding: 24, color: "var(--amber, #b8860b)" }}>{pdfErr}</p>}
            {pdfUrl && !pdfErr && (
              <iframe title="Aperçu PDF" src={pdfUrl}
                style={{ width: "100%", height: "80vh", border: "none", borderRadius: 8, background: "#525659" }} />
            )}
          </div>
        ) : (
          <div className="tpl-doc">
            <div className="hf-zone">
              <div className="hf-label">En-tête <span>· laissé vide = papier à en-tête automatique</span>
                <BleedToggle on={bleed.header} onChange={() => toggleBleed("header")} />
              </div>
              <div onDrop={onDrop(header)} onDragOver={(e) => e.preventDefault()}><EditorContent editor={header} /></div>
            </div>
            <div className="body-zone" onDrop={onDrop(body)} onDragOver={(e) => e.preventDefault()}
              style={{ "--page-h": pageContentPx + "px" }}>
              <div className="hf-label">Contenu <span>· le trait rouge indique la fin de page</span>
                <BleedToggle on={bleed.body} onChange={() => toggleBleed("body")} /></div>
              <EditorContent editor={body} />
            </div>
            <div className="hf-zone">
              <div className="hf-label">Pied de page<BleedToggle on={bleed.footer} onChange={() => toggleBleed("footer")} /></div>
              <div onDrop={onDrop(footer)} onDragOver={(e) => e.preventDefault()}><EditorContent editor={footer} /></div>
            </div>
          </div>
        )}

        <aside className="tpl-palette">
          <div className="tpl-palette-hd">Champs disponibles</div>
          <p className="sub" style={{ margin: "0 10px 8px", fontSize: 11 }}>
            Cliquez ou glissez un champ dans l'en-tête, le corps ou le pied de page. Il sera remplacé par la donnée réelle.
          </p>

          <div className="tok-group">
            <div className="tok-group-hd" style={{ cursor: "default" }}><span>✍ Signatures</span></div>
            <div className="tok-list" style={{ padding: "0 10px 8px" }}>
              <p className="sub" style={{ margin: "0 0 6px", fontSize: 11 }}>
                Insérez un bloc de signature nommé. Chaque bloc est signé séparément par la personne attribuée, depuis son compte.
              </p>
              {SIG_PRESETS.map((s) => (
                <button key={s} className="tok-chip" title={`Bloc de signature « ${s} » — cliquer ou glisser`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: sigKey(s), label: s }))}
                  onClick={() => insertSignature(s)}>✍ {s}</button>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input className="inp" value={sigLabel} onChange={(e) => setSigLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { insertSignature(sigLabel); setSigLabel(""); } }}
                  placeholder="Autre libellé…" style={{ fontSize: 12, padding: "4px 6px" }} />
                <button className="btn sm ghost" title="Cliquer ou glisser dans le document"
                  draggable={!!sigLabel.trim()}
                  onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: sigKey(sigLabel.trim()), label: sigLabel.trim() }))}
                  onClick={() => { insertSignature(sigLabel); setSigLabel(""); }} disabled={!sigLabel.trim()}>＋</button>
              </div>
            </div>
          </div>

          {catalog.map((g) => (
            <div key={g.group} className="tok-group">
              <button className="tok-group-hd" onClick={() => setOpenGroups((p) => ({ ...p, [g.group]: !p[g.group] }))}>
                <span>{g.group}</span><span className="chev">{openGroups[g.group] ? "▾" : "▸"}</span>
              </button>
              {openGroups[g.group] && (
                <div className="tok-list">
                  {g.tokens.map((t) => (
                    <button key={t.key} className="tok-chip" title={`{${t.key}} — ex. ${t.sample || ""}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: t.key, label: t.label }))}
                      onClick={() => insertToken(t)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>
      </div>

      {showFields && (
        <div className="overlay" onClick={() => setShowFields(false)}>
          <div className="modal" style={{ maxWidth: 720, width: "92%" }} onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>Champs documents</h3>
              <button className="x" onClick={() => setShowFields(false)} aria-label="Fermer">×</button>
            </div>
            <div className="mbody" style={{ maxHeight: "70vh", overflow: "auto" }}>
              <p className="sub" style={{ margin: "0 0 10px" }}>
                Activez les champs du dossier utilisables dans les documents (conditions, valeurs). Vous pouvez renommer leur intitulé.
              </p>
              <FieldSettingsPanel ref={fieldsRef} onStatus={setStatus} />
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => setShowFields(false)}>Fermer</button>
              <button className="btn primary" onClick={() => fieldsRef.current?.save()}>Enregistrer les champs</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateEditor;
