import { useRef, useState, useEffect } from "react";
import { FONT_SIZES, FONTS, LINE_HEIGHTS, COLOR_SWATCHES, HIGHLIGHT_SWATCHES } from "../lib/editorConfig.js";
import { Icon } from "./Icon.jsx";

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
      <button type="button" className="tb-btn tb-swatch-btn" title={title} aria-label={title}
        aria-haspopup="true" aria-expanded={open}
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
      <button type="button" className="tb-btn" title="Insérer un tableau" aria-label="Insérer un tableau"
        aria-haspopup="true" aria-expanded={open}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}><Icon name="table" size={16} /></button>
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

  /* `aria-label` reprend l'info-bulle : ces boutons n'ont qu'une icône, et sans nom accessible
     un lecteur d'écran n'annonce que « bouton ». `aria-pressed` n'est posé que sur les boutons à
     état (gras, bordures, largeur…) — le passer à un bouton d'action comme « Annuler » le ferait
     annoncer à tort comme un interrupteur. */
  const Btn = ({ on, active, children, title, danger }) => (
    <button type="button" title={title} aria-label={title}
      className={"tb-btn" + (active ? " on" : "") + (danger ? " tb-danger" : "")}
      aria-pressed={active === undefined ? undefined : !!active}
      onMouseDown={(e) => { e.preventDefault(); on(); }}>{children}</button>
  );
  const Sep = () => <span className="tb-sep" aria-hidden="true" />;
  /* Étiquette d'un groupe contextuel. Sans elle, cliquer dans un tableau fait apparaître
     quatorze boutons de plus sans qu'on sache à quoi ils se rapportent. */
  const Grp = ({ children }) => <span className="tb-grp">{children}</span>;

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
      {/* Historique */}
      <Btn title="Annuler" on={() => c().undo().run()}><Icon name="undo" size={16} /></Btn>
      <Btn title="Rétablir" on={() => c().redo().run()}><Icon name="redo" size={16} /></Btn>

      <Sep />
      {/* Style de bloc : paragraphe / titres */}
      <Btn title="Paragraphe" active={editor.isActive("paragraph")} on={() => c().setParagraph().run()}><Icon name="pilcrow" size={16} /></Btn>
      <Btn title="Titre 1" active={editor.isActive("heading", { level: 1 })} on={() => c().toggleHeading({ level: 1 }).run()}>H1</Btn>
      <Btn title="Titre 2" active={editor.isActive("heading", { level: 2 })} on={() => c().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title="Titre 3" active={editor.isActive("heading", { level: 3 })} on={() => c().toggleHeading({ level: 3 }).run()}>H3</Btn>

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
      {/* Mise en forme du caractère */}
      <Btn title="Gras" active={editor.isActive("bold")} on={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italique" active={editor.isActive("italic")} on={() => c().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Souligné" active={editor.isActive("underline")} on={() => c().toggleUnderline().run()}><u>U</u></Btn>
      <Btn title="Barré" active={editor.isActive("strike")} on={() => c().toggleStrike().run()}><s>S</s></Btn>
      {/* Couleur du texte — palette de carrés (façon Paint) */}
      <SwatchPicker
        label="A" title="Couleur du texte" swatches={COLOR_SWATCHES}
        current={editor.getAttributes("textStyle").color || null}
        onPick={(col) => c().setColor(col).run()}
        onClear={() => c().unsetColor().run()} clearLabel="Couleur par défaut" />
      {/* Surlignage — palette de carrés */}
      <SwatchPicker
        label={<Icon name="highlighter" size={15} />} title="Surlignage" swatches={HIGHLIGHT_SWATCHES}
        current={editor.getAttributes("highlight").color || null}
        onPick={(col) => c().setHighlight({ color: col }).run()}
        onClear={() => c().unsetHighlight().run()} clearLabel="Aucun surlignage" />

      <Sep />
      {/* Paragraphe : alignement, interligne, listes */}
      <Btn title="Aligner à gauche" active={editor.isActive({ textAlign: "left" })} on={() => c().setTextAlign("left").run()}><Icon name="align-left" size={16} /></Btn>
      <Btn title="Centrer" active={editor.isActive({ textAlign: "center" })} on={() => c().setTextAlign("center").run()}><Icon name="align-center" size={16} /></Btn>
      <Btn title="Aligner à droite" active={editor.isActive({ textAlign: "right" })} on={() => c().setTextAlign("right").run()}><Icon name="align-right" size={16} /></Btn>
      <Btn title="Justifier" active={editor.isActive({ textAlign: "justify" })} on={() => c().setTextAlign("justify").run()}><Icon name="align-justify" size={16} /></Btn>
      <select className="tb-sel" title="Interligne" aria-label="Interligne" value=""
        onChange={(e) => { if (e.target.value) c().setLineHeight(e.target.value).run(); }}>
        <option value="">Interligne</option>
        {LINE_HEIGHTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <Btn title="Liste à puces" active={editor.isActive("bulletList")} on={() => c().toggleBulletList().run()}><Icon name="list" size={16} /></Btn>
      <Btn title="Liste numérotée" active={editor.isActive("orderedList")} on={() => c().toggleOrderedList().run()}><Icon name="list-ordered" size={16} /></Btn>

      {!compact && (
        <>
          <Sep />
          {/* Insertions */}
          <Btn title="Lien" active={editor.isActive("link")} on={addLink}><Icon name="link" size={16} /></Btn>
          <Btn title="Image" on={() => imgInput.current?.click()}><Icon name="image" size={16} /></Btn>
          <TableInserter onInsert={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
          <Btn title="Bloc deux colonnes (texte à côté d'un tableau, même bande)" on={() => c().insertColumns(2).run()}><Icon name="cols-equal" size={16} /></Btn>
          <Btn title="Ligne horizontale" on={() => c().setHorizontalRule().run()}><Icon name="minus" size={16} /></Btn>
          <Btn title="Saut de page (Ctrl/Cmd + Entrée)" on={() => c().setPageBreak().run()}><Icon name="page-break" size={16} /></Btn>
          <input ref={imgInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { addImageFile(e.target.files[0]); e.target.value = ""; }} />
        </>
      )}

      {editor.isActive("table") && !compact && (
        <>
           8 
          <Sep />
          <Grp>Tableau</Grp>

           9 
          <Btn title="Insérer une colonne à gauche" on={() => c().addColumnBefore().run()}><Icon name="column-insert-left" size={16} /></Btn>
          <Btn title="Insérer une colonne à droite" on={() => c().addColumnAfter().run()}><Icon name="column-insert-right" size={16} /></Btn>
          <Btn title="Supprimer la colonne" on={() => c().deleteColumn().run()}><Icon name="column-remove" size={16} /></Btn>
          <Btn title="Insérer une ligne au-dessus" on={() => c().addRowBefore().run()}><Icon name="row-insert-top" size={16} /></Btn>
          <Btn title="Insérer une ligne en dessous" on={() => c().addRowAfter().run()}><Icon name="row-insert-bottom" size={16} /></Btn>
          <Btn title="Supprimer la ligne" on={() => c().deleteRow().run()}><Icon name="row-remove" size={16} /></Btn>
          <Btn title="Ligne d'en-tête" active={editor.isActive("tableHeader")} on={() => c().toggleHeaderRow().run()}><Icon name="table-header" size={16} /></Btn>
          <Btn title="Fusionner / séparer les cellules" on={() => c().mergeOrSplit().run()}><Icon name="merge-cells" size={16} /></Btn>

           10 
          <Sep />
          <Btn title="Bordures pleines" active={editor.getAttributes("table").borderStyle === "solid" || !editor.getAttributes("table").borderStyle} on={() => c().updateAttributes("table", { borderStyle: "solid" }).run()}><Icon name="border-all" size={16} /></Btn>
          <Btn title="Bordures pointillées" active={editor.getAttributes("table").borderStyle === "dashed"} on={() => c().updateAttributes("table", { borderStyle: "dashed" }).run()}><Icon name="border-dashed" size={16} /></Btn>
          <Btn title="Sans bordure" active={editor.getAttributes("table").borderStyle === "none"} on={() => c().updateAttributes("table", { borderStyle: "none" }).run()}><Icon name="border-none" size={16} /></Btn>

           11 
          <Sep />
          <Btn title="Pleine largeur" active={(editor.getAttributes("table").widthMode || "full") === "full"} on={() => c().updateAttributes("table", { widthMode: "full" }).run()}><Icon name="width-full" size={16} /></Btn>
          <Btn title="Ajusté au contenu (sans couper le texte)" active={editor.getAttributes("table").widthMode === "auto"} on={() => c().updateAttributes("table", { widthMode: "auto" }).run()}><Icon name="width-auto" size={16} /></Btn>
          <Btn title="Compact, aligné à droite (totaux…)" active={editor.getAttributes("table").widthMode === "half"} on={() => c().updateAttributes("table", { widthMode: "half" }).run()}><Icon name="width-half" size={16} /></Btn>

           12 
          <Sep />
          <Btn title="Articles empilés dans UNE seule ligne (un saut de ligne par article) au lieu d'une ligne de tableau par article"
            active={editor.getAttributes("table").rowsMode === "inline"}
            on={() => c().updateAttributes("table", {
              rowsMode: editor.getAttributes("table").rowsMode === "inline" ? "repeat" : "inline",
            }).run()}><Icon name="rows-inline" size={16} /></Btn>
          {editor.getAttributes("table").rowsMode === "inline" && (
            /* Libellé en ARTICLES, pas en « lignes » : c'est l'unité que le rendu compte
               réellement (il comble `hauteur − nombre d'articles`) et celle dans laquelle on
               pense une facture. « N lignes » promettait une hauteur physique que le code ne
               tient pas dès qu'un article occupe deux lignes. */
            <select className="tb-sel tb-sel-long" aria-label="Place réservée, en nombre d'articles"
              title="Réserve la place d'un nombre d'articles donné. En dessous, le tableau garde quand même cette hauteur (lignes vides) : les totaux et la signature tombent au même endroit d'une facture à l'autre. Au-delà, le tableau s'allonge normalement, rien n'est jamais tronqué."
              value={editor.getAttributes("table").minLines || 0}
              onChange={(e) => c().updateAttributes("table", { minLines: parseInt(e.target.value, 10) || 0 }).run()}>
              <option value="0">Pas de hauteur réservée</option>
              {[4, 6, 8, 10, 12, 15, 20].map((n) => (
                <option key={n} value={n}>Place pour {n} articles</option>
              ))}
            </select>
          )}

          {/* 5. Destructif, isolé en fin de groupe : à portée de main mais jamais sous le doigt */}
          <Sep />
          <Btn title="Supprimer le tableau" danger on={() => c().deleteTable().run()}><Icon name="trash" size={16} /></Btn>
        </>
      )}

      {editor.isActive("columns") && !compact && (
        <>
          <Sep />
          <Grp>Colonnes</Grp>
          <Btn title="Colonnes égales" on={() => c().setColumnsRatio([]).run()}><Icon name="cols-equal" size={16} /></Btn>
          <Btn title="Colonne de gauche plus large" on={() => c().setColumnsRatio([62, 38]).run()}><Icon name="cols-left-wide" size={16} /></Btn>
          <Btn title="Colonne de droite plus large" on={() => c().setColumnsRatio([38, 62]).run()}><Icon name="cols-right-wide" size={16} /></Btn>
          <Sep />
          <Btn title="Ajouter une colonne" on={() => c().addColumn().run()}><Icon name="plus" size={16} /></Btn>
          <Btn title="Retirer cette colonne" danger on={() => c().removeColumn().run()}><Icon name="trash" size={16} /></Btn>
        </>
      )}
    </div>
  );
}

export default RichToolbar;
