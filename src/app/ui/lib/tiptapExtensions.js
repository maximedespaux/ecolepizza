import { Extension, Node, mergeAttributes } from "@tiptap/core";

/**
 * PageBreak — saut de page manuel.
 * Sérialisé en <p class="doc-pagebreak">&nbsp;</p> : c'est la SEULE forme respectée
 * par LibreOffice à la conversion PDF (les <div> ou <p> vides sont ignorés ; le saut
 * doit porter sur un <p> ayant un contenu, d'où l'espace insécable). Dans l'éditeur,
 * il s'affiche comme un séparateur « Saut de page » (styles app.css).
 * Bouton dans la barre d'outils + raccourci Ctrl/Cmd+Entrée.
 */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  // NB : pas de priorité d'extension élevée — sinon ce nœud deviendrait le bloc par DÉFAUT
  // du schéma et serait inséré à la place d'un paragraphe (ex. après suppression d'une image).
  // La priorité de PARSE (ci-dessous) suffit à gagner sur le paragraphe pour <p.doc-pagebreak>.

  parseHTML() {
    return [{ tag: "p.doc-pagebreak", priority: 100 }, { tag: "div.doc-pagebreak", priority: 100 }];
  },
  renderHTML() {
    return ["p", { class: "doc-pagebreak", contenteditable: "false" }, " "];
  },
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.setPageBreak() };
  },
});

/**
 * Column / Columns — bloc « deux colonnes » (texte à côté d'un tableau, sur la même bande).
 *
 * Dans l'éditeur, une colonne est un <div data-col> (flex) ; le conteneur est un <div data-cols>.
 * Au rendu PDF, le serveur (htmlfill.columnsToTables) transforme ces div en un tableau de mise
 * en page SANS BORDURE — la seule primitive que LibreOffice pose côte à côte de façon fiable.
 * Le WYSIWYG tient parce que les largeurs (data-w, en %) et la pleine largeur des tableaux
 * internes sont les mêmes des deux côtés.
 *
 * Une colonne accepte n'importe quel bloc (paragraphes, titres, tableau, image, jetons) : on peut
 * donc y déposer le tableau des totaux d'un côté et les conditions de règlement de l'autre.
 */
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true, // la touche Retour arrière ne fusionne pas deux colonnes
  addAttributes() {
    return {
      width: {
        default: null, // pourcentage (chaîne) ; null = colonnes égales
        parseHTML: (el) => el.getAttribute("data-w"),
        renderHTML: (attrs) => (attrs.width ? { "data-w": attrs.width } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-col]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = mergeAttributes(HTMLAttributes, { "data-col": "", class: "doc-col" });
    if (node.attrs.width) a.style = `flex:0 0 ${node.attrs.width}%;max-width:${node.attrs.width}%`;
    return ["div", a, 0];
  },
});

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column column+", // au moins deux colonnes
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-cols]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-cols": "", class: "doc-cols" }), 0];
  },
  addCommands() {
    // Retrouve le nœud `columns` contenant la sélection : { node, pos, depth } ou null.
    const findColumns = ($from) => {
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === "columns") {
          return { node: $from.node(d), pos: $from.before(d), depth: d };
        }
      }
      return null;
    };
    return {
      insertColumns:
        (n = 2) =>
        ({ commands }) => {
          const column = { type: "column", content: [{ type: "paragraph" }] };
          return commands.insertContent({
            type: "columns",
            content: Array.from({ length: Math.max(2, n) }, () => ({ ...column })),
          });
        },
      // Fixe les largeurs (tableau de %) des colonnes du bloc courant. Tableau vide = égales.
      setColumnsRatio:
        (widths = []) =>
        ({ state, dispatch }) => {
          const found = findColumns(state.selection.$from);
          if (!found) return false;
          let tr = state.tr;
          found.node.forEach((child, offset, index) => {
            const w = widths[index] != null ? String(widths[index]) : null;
            tr = tr.setNodeMarkup(found.pos + 1 + offset, undefined, { ...child.attrs, width: w });
          });
          if (dispatch) dispatch(tr);
          return true;
        },
      addColumn:
        () =>
        ({ state, dispatch }) => {
          const found = findColumns(state.selection.$from);
          if (!found) return false;
          const colType = state.schema.nodes.column;
          const col = colType.create(null, state.schema.nodes.paragraph.create());
          const end = found.pos + found.node.nodeSize - 1; // avant le </columns>
          if (dispatch) dispatch(state.tr.insert(end, col));
          return true;
        },
      removeColumn:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          const found = findColumns($from);
          if (!found || found.node.childCount <= 2) return false; // garder ≥ 2 colonnes
          for (let d = $from.depth; d > found.depth; d--) {
            if ($from.node(d).type.name === "column") {
              const pos = $from.before(d);
              if (dispatch) dispatch(state.tr.delete(pos, pos + $from.node(d).nodeSize));
              return true;
            }
          }
          return false;
        },
    };
  },
});

/**
 * FontSize — ajoute un attribut `font-size` au style de texte (nécessite TextStyle).
 * Commandes : setFontSize("14pt"), unsetFontSize().
 */
export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/**
 * LineHeight — interligne sur les paragraphes et titres.
 * Commande : setLineHeight("1.5").
 */
export const LineHeight = Extension.create({
  name: "lineHeight",
  addOptions() {
    return { types: ["paragraph", "heading"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (lh) =>
        ({ commands }) =>
          this.options.types.every((t) => commands.updateAttributes(t, { lineHeight: lh })),
    };
  },
});
