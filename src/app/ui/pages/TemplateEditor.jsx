import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TokenNode } from "../lib/TokenNode.js";
import { getTokenCatalog, getTemplateBody, saveTemplateBody } from "../api/apiClient.js";
import StatusMessage from "../components/StatusMessage.jsx";

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

function Toolbar({ editor }) {
  if (!editor) return null;
  const B = ({ on, active, children, title }) => (
    <button type="button" className={"tb-btn" + (active ? " on" : "")} title={title}
      onMouseDown={(e) => { e.preventDefault(); on(); }}>{children}</button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="tb">
      <B title="Gras" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><b>B</b></B>
      <B title="Italique" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><i>I</i></B>
      <span className="tb-sep" />
      <B title="Titre 1" active={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()}>H1</B>
      <B title="Titre 2" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}>H2</B>
      <B title="Paragraphe" active={editor.isActive("paragraph")} on={() => c().setParagraph().run()}>¶</B>
      <span className="tb-sep" />
      <B title="Liste à puces" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}>•</B>
      <B title="Liste numérotée" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}>1.</B>
      <span className="tb-sep" />
      <B title="Annuler" on={() => c().undo().run()}>↶</B>
      <B title="Rétablir" on={() => c().redo().run()}>↷</B>
    </div>
  );
}

function TemplateEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const wrapRef = useRef(null);

  const editor = useEditor({
    extensions: [StarterKit, TokenNode],
    content: "",
    editorProps: { attributes: { class: "doc-canvas" } },
  });

  // Charge catalogue + corps du modèle.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, body] = await Promise.all([getTokenCatalog(), getTemplateBody(slug)]);
        if (!alive) return;
        setCatalog(cat.data || []);
        setOpenGroups(Object.fromEntries((cat.data || []).map((g, i) => [g.group, i === 0])));
      } catch (e) { if (alive) setStatus({ type: "error", message: e.message }); }
    })();
    return () => { alive = false; };
  }, [slug]);

  // Injecte le corps une fois l'éditeur prêt.
  useEffect(() => {
    if (!editor) return;
    let alive = true;
    getTemplateBody(slug).then(({ data }) => { if (alive && editor) editor.commands.setContent(data.body_html || "<p></p>"); })
      .catch(() => {});
    return () => { alive = false; };
  }, [editor, slug]);

  const sampleMap = useMemo(() => {
    const m = {};
    for (const g of catalog) for (const t of g.tokens) m[t.key] = t.sample || "";
    return m;
  }, [catalog]);

  function insertToken(t) {
    editor?.chain().focus().insertToken({ token: t.key, label: t.label }).run();
  }
  function onDrop(e) {
    const raw = e.dataTransfer.getData("application/x-token");
    if (!raw || !editor) return;
    e.preventDefault();
    const t = JSON.parse(raw);
    const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const at = pos ? pos.pos : editor.state.selection.to;
    editor.chain().focus().insertTokenAt(at, { token: t.key, label: t.label }).run();
  }

  async function save() {
    if (!editor) return;
    setSaving(true); setStatus(null);
    try {
      await saveTemplateBody(slug, editor.getHTML());
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
          <button className={"btn sm ghost" + (showPreview ? " on" : "")} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "✎ Édition" : "👁 Aperçu"}
          </button>
          <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>

      <StatusMessage status={status} />

      <div className="tpl-editor-body">
        <div className="tpl-doc">
          {!showPreview && <Toolbar editor={editor} />}
          {showPreview ? (
            <div className="doc-canvas preview"
              dangerouslySetInnerHTML={{ __html: previewFill(editor?.getHTML() || "", sampleMap) }} />
          ) : (
            <div ref={wrapRef} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
              <EditorContent editor={editor} />
            </div>
          )}
        </div>

        <aside className="tpl-palette">
          <div className="tpl-palette-hd">Champs disponibles</div>
          <p className="sub" style={{ margin: "0 10px 8px", fontSize: 11 }}>
            Cliquez ou glissez un champ dans le document. Il sera remplacé automatiquement par la donnée réelle.
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
