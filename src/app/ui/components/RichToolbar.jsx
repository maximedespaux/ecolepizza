import { useRef, useState, useEffect } from "react";
import { FONT_SIZES, FONTS, LINE_HEIGHTS, COLOR_SWATCHES, HIGHLIGHT_SWATCHES } from "../lib/editorConfig.js";

/** Sélecteur de couleur « façon Paint » : grille de carrés, sans roue chromatique. */
function SwatchPicker({ label, title, swatches, current, onPick, onClear, clearLabel = "Aucune" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="tb-swatch" ref={ref}>
      <button type="button" className="tb-btn tb-swatch-btn" title={title}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}>
        <span className="tb-swatch-label">{label}</span>
        <span className="tb-swatch-bar" style={{ background: current || "transparent" }} />
      </button>
      {open && (
        <div className="tb-swatch-pop">
          <div className="tb-swatch-grid">
            {swatches.map((col) => (
              <button key={col} type="button" className={"tb-swatch-cell" + (current === col ? " on" : "")}
                style={{ background: col }} title={col}
                onMouseDown={(e) => { e.preventDefault(); onPick(col); setOpen(false); }} />
            ))}
          </div>
          {onClear && (
            <button type="button" className="tb-swatch-clear"
              onMouseDown={(e) => { e.preventDefault(); onClear(); setOpen(false); }}>{clearLabel}</button>
          )}
        </div>
      )}
    </span>
  );
}

/** Insertion de tableau avec choix des lignes/colonnes (grille survolée, façon Word). */
function TableInserter({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ r: 0, c: 0 });
  const ref = useRef(null);
  const MAX = 10;
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const cells = [];
  for (let r = 1; r <= MAX; r++) for (let cc = 1; cc <= MAX; cc++) cells.push({ r, c: cc });
  return (
    <span className="tb-swatch" ref={ref}>
      <button type="button" className="tb-btn" title="Insérer un tableau"
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}>▦</button>
      {open && (
        <div className="tb-swatch-pop tb-table-pop">
          <div className="tb-table-grid" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
            {cells.map(({ r, c }) => (
              <button key={r + "-" + c} type="button"
                className={"tb-table-cell" + (r <= hover.r && c <= hover.c ? " on" : "")}
                onMouseEnter={() => setHover({ r, c })}
                onMouseDown={(e) => { e.preventDefault(); onInsert(r, c); setOpen(false); setHover({ r: 0, c: 0 }); }} />
            ))}
          </div>
          <div className="tb-table-size">{hover.r || 0} × {hover.c || 0}</div>
        </div>
      )}
    </span>
  );
}

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
      {/* Couleur du texte — palette de carrés (façon Paint) */}
      <SwatchPicker
        label="A" title="Couleur du texte" swatches={COLOR_SWATCHES}
        current={editor.getAttributes("textStyle").color || null}
        onPick={(col) => c().setColor(col).run()}
        onClear={() => c().unsetColor().run()} clearLabel="Couleur par défaut" />
      {/* Surlignage — palette de carrés */}
      <SwatchPicker
        label="🖍" title="Surlignage" swatches={HIGHLIGHT_SWATCHES}
        current={editor.getAttributes("highlight").color || null}
        onPick={(col) => c().setHighlight({ color: col }).run()}
        onClear={() => c().unsetHighlight().run()} clearLabel="Aucun surlignage" />

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
          <TableInserter onInsert={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
          <Btn title="Ligne horizontale" on={() => c().setHorizontalRule().run()}>—</Btn>
          <Btn title="Saut de page (Ctrl/Cmd + Entrée)" on={() => c().setPageBreak().run()}>⇟</Btn>
          <input ref={imgInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { addImageFile(e.target.files[0]); e.target.value = ""; }} />
        </>
      )}

      {editor.isActive("table") && !compact && (
        <>
          <Sep />
          <Btn title="Insérer une colonne à gauche" on={() => c().addColumnBefore().run()}>⇤col</Btn>
          <Btn title="Insérer une colonne à droite" on={() => c().addColumnAfter().run()}>col⇥</Btn>
          <Btn title="Supprimer la colonne" on={() => c().deleteColumn().run()}>⌫col</Btn>
          <Btn title="Insérer une ligne au-dessus" on={() => c().addRowBefore().run()}>⤒lig</Btn>
          <Btn title="Insérer une ligne en dessous" on={() => c().addRowAfter().run()}>lig⤓</Btn>
          <Btn title="Supprimer la ligne" on={() => c().deleteRow().run()}>⌫lig</Btn>
          <Btn title="Ligne d'en-tête" active={editor.isActive("tableHeader")} on={() => c().toggleHeaderRow().run()}>⊤</Btn>
          <Btn title="Fusionner / séparer les cellules" on={() => c().mergeOrSplit().run()}>⤄</Btn>
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
