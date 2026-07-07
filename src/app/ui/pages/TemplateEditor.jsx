import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildExtensions } from "../lib/editorConfig.js";
import RichToolbar from "../components/RichToolbar.jsx";
import { getTokenCatalog, getTemplateBody, saveTemplateBody } from "../api/apiClient.js";
import StatusMessage from "../components/StatusMessage.jsx";

const EMPTY = /^\s*(<p>(\s|<br\/?>)*<\/p>\s*)?$/i; // corps « vide »

// Remplace les jetons par des valeurs d'exemple pour l'aperçu (côté client).
function previewFill(html, sampleMap) {
  let out = String(html || "");
  out = out.replace(/<span[^>]*\sdata-token="([^"]+)"[^>]*>[\s\S]*?<\/span>/g,
    (_m, key) => `<span class="prev-val">${sampleMap[key] ?? ""}</span>`);
  for (const [k, v] of Object.entries(sampleMap)) {
    if (out.includes("{" + k + "}")) out = out.split("{" + k + "}").join(v);
  }
  return out;
}
const clean = (html) => (EMPTY.test(html || "") ? "" : html);

function TemplateEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [active, setActive] = useState(null); // éditeur ayant le focus (cible palette/toolbar)
  const [, force] = useState(0);

  const opts = (cls) => ({
    extensions: buildExtensions(),
    content: "",
    editorProps: { attributes: { class: cls } },
    onFocus: ({ editor }) => setActive(editor),
    onSelectionUpdate: () => force((n) => n + 1), // rafraîchit l'état actif de la barre
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
      } catch (e) { if (alive) setStatus({ type: "error", message: e.message }); }
    })();
    return () => { alive = false; };
  }, [slug, body, header, footer]);

  const sampleMap = useMemo(() => {
    const m = {};
    for (const g of catalog) for (const t of g.tokens) m[t.key] = t.sample || "";
    return m;
  }, [catalog]);

  const target = active || body;

  function insertToken(t) {
    target?.chain().focus().insertToken({ token: t.key, label: t.label }).run();
  }
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
      });
      setStatus({ type: "success", message: "Modèle enregistré." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  const previewHtml = () => {
    const h = clean(header?.getHTML()); const f = clean(footer?.getHTML());
    return (h ? `<div class="pv-hf">${previewFill(h, sampleMap)}</div>` : "")
      + previewFill(body?.getHTML() || "", sampleMap)
      + (f ? `<div class="pv-hf pv-foot">${previewFill(f, sampleMap)}</div>` : "");
  };

  return (
    <div className="tpl-editor">
      <div className="tpl-editor-head">
        <button className="btn ghost sm" onClick={() => navigate("/modeles")}>← Modèles</button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Éditeur — <span className="mono">{slug}</span></h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className={"btn sm ghost" + (showPreview ? " on" : "")} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "✎ Édition" : "👁 Aperçu"}
          </button>
          <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>

      <StatusMessage status={status} />

      {!showPreview && <RichToolbar editor={target} />}

      <div className="tpl-editor-body">
        {showPreview ? (
          <div className="tpl-doc"><div className="doc-canvas preview" dangerouslySetInnerHTML={{ __html: previewHtml() }} /></div>
        ) : (
          <div className="tpl-doc">
            <div className="hf-zone">
              <div className="hf-label">En-tête <span>· laissé vide = papier à en-tête automatique</span></div>
              <div onDrop={onDrop(header)} onDragOver={(e) => e.preventDefault()}><EditorContent editor={header} /></div>
            </div>
            <div className="body-zone" onDrop={onDrop(body)} onDragOver={(e) => e.preventDefault()}>
              <EditorContent editor={body} />
            </div>
            <div className="hf-zone">
              <div className="hf-label">Pied de page</div>
              <div onDrop={onDrop(footer)} onDragOver={(e) => e.preventDefault()}><EditorContent editor={footer} /></div>
            </div>
          </div>
        )}

        <aside className="tpl-palette">
          <div className="tpl-palette-hd">Champs disponibles</div>
          <p className="sub" style={{ margin: "0 10px 8px", fontSize: 11 }}>
            Cliquez ou glissez un champ dans l'en-tête, le corps ou le pied de page. Il sera remplacé par la donnée réelle.
          </p>
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
    </div>
  );
}

export default TemplateEditor;
