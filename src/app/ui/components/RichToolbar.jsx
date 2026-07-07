import { useRef } from "react";
import { FONT_SIZES, FONTS, LINE_HEIGHTS, TEXT_COLORS, HIGHLIGHTS } from "../lib/editorConfig.js";

/** Barre d'outils riche (façon traitement de texte) pour un éditeur Tiptap. */
function RichToolbar({ editor, compact = false }) {
  const imgInput = useRef(null);
  if (!editor) return null;
  const c = () => editor.chain().focus();

  const Btn = ({ on, active, children, title }) => (
    <button type="button" className={"tb-btn" + (active ? " on" : "")} title={title}
      onMouseDown={(e) => { e.preventDefault(); on(); }}>{children}</button>
  );
  const Sep = () => <span className="tb-sep" />;

  function addImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => c().setImage({ src: reader.result }).run();
    reader.readAsDataURL(file);
  }
  function addLink() {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Adresse du lien (URL) :", prev);
    if (url === null) return;
    if (url === "") return c().extendMarkRange("link").unsetLink().run();
    c().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="tb">
      <Btn title="Gras" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italique" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Souligné" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><u>U</u></Btn>
      <Btn title="Barré" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><s>S</s></Btn>

      <Sep />
      {/* Couleur du texte */}
      <label className="tb-color" title="Couleur du texte">
        <span style={{ color: editor.getAttributes("textStyle").color || "#1a1a1a" }}>A</span>
        <input type="color" value={editor.getAttributes("textStyle").color || "#1a1a1a"}
          onChange={(e) => c().setColor(e.target.value).run()} />
      </label>
      <select className="tb-sel" title="Couleur rapide" value=""
        onChange={(e) => { if (e.target.value) c().setColor(e.target.value).run(); }}>
        <option value="">🎨</option>
        {TEXT_COLORS.map((col) => <option key={col} value={col} style={{ color: col }}>■ {col}</option>)}
      </select>
      {/* Surlignage */}
      <select className="tb-sel" title="Surlignage" value=""
        onChange={(e) => { const v = e.target.value; v === "none" ? c().unsetHighlight().run() : v && c().toggleHighlight({ color: v }).run(); }}>
        <option value="">🖍</option>
        {HIGHLIGHTS.map((col) => <option key={col} value={col}>▮ {col}</option>)}
        <option value="none">Aucun</option>
      </select>

      <Sep />
      {/* Police + taille */}
      <select className="tb-sel" title="Police"
        value={editor.getAttributes("textStyle").fontFamily || ""}
        onChange={(e) => e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run()}>
        <option value="">Police</option>
        {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select className="tb-sel" title="Taille"
        value={editor.getAttributes("textStyle").fontSize || ""}
        onChange={(e) => e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run()}>
        <option value="">Taille</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s.replace("pt", "")}</option>)}
      </select>

      <Sep />
      {/* Titres */}
      <Btn title="Titre 1" active={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()}>H1</Btn>
      <Btn title="Titre 2" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title="Titre 3" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <Btn title="Paragraphe" active={editor.isActive("paragraph")} on={() => c().setParagraph().run()}>¶</Btn>

      <Sep />
      {/* Alignement (paragraphe) — positionne aussi les images en ligne : gauche / centre / droite */}
      <Btn title="Aligner à gauche" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}>⯇</Btn>
      <Btn title="Centrer" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}>≡</Btn>
      <Btn title="Aligner à droite" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}>⯈</Btn>
      <Btn title="Justifier" active={editor.isActive({ textAlign: "justify" })} on={() => c().setTextAlign("justify").run()}>▤</Btn>
      <select className="tb-sel" title="Interligne" value=""
        onChange={(e) => { if (e.target.value) c().setLineHeight(e.target.value).run(); }}>
        <option value="">↕</option>
        {LINE_HEIGHTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>

      <Sep />
      {/* Listes */}
      <Btn title="Liste à puces" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}>•</Btn>
      <Btn title="Liste numérotée" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}>1.</Btn>

      {!compact && (
        <>
          <Sep />
          {/* Insertions */}
          <Btn title="Lien" active={editor.isActive("link")} on={addLink}>🔗</Btn>
          <Btn title="Image" on={() => imgInput.current?.click()}>🖼</Btn>
          <Btn title="Tableau 3×3" on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</Btn>
          <Btn title="Ligne horizontale" on={() => c().setHorizontalRule().run()}>—</Btn>
          <input ref={imgInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { addImageFile(e.target.files[0]); e.target.value = ""; }} />
        </>
      )}

      {editor.isActive("table") && !compact && (
        <>
          <Sep />
          <Btn title="Ajouter une colonne" on={() => c().addColumnAfter().run()}>+col</Btn>
          <Btn title="Ajouter une ligne" on={() => c().addRowAfter().run()}>+lig</Btn>
          <Btn title="Supprimer le tableau" on={() => c().deleteTable().run()}>⌫tab</Btn>
        </>
      )}

      <Sep />
      <Btn title="Annuler" on={() => c().undo().run()}>↶</Btn>
      <Btn title="Rétablir" on={() => c().redo().run()}>↷</Btn>
    </div>
  );
}

export default RichToolbar;
