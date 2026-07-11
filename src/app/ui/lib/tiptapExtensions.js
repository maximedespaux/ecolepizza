import { Extension, Node } from "@tiptap/core";

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
  priority: 1100, // gagne sur le paragraphe pour parser <p class="doc-pagebreak">

  parseHTML() {
    return [{ tag: "p.doc-pagebreak" }, { tag: "div.doc-pagebreak" }];
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
