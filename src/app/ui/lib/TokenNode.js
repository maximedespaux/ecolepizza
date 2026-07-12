import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import TokenView from "./TokenView.jsx";

const toNum = (v) => {
  const n = parseInt(String(v == null ? "" : v), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Nœud « jeton » : puce en ligne, non éditable, insérée depuis la palette.
 * Sérialisé en <span class="doc-token" data-token="Clé">Libellé</span> — la même
 * forme que celle attendue par le moteur de rendu côté serveur (htmlfill.js) et
 * produite par la conversion des anciens modèles Word.
 */
export const TokenNode = Node.create({
  name: "token",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      token: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-token"),
        renderHTML: (attrs) => (attrs.token ? { "data-token": attrs.token } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-label") || el.textContent,
        renderHTML: (attrs) => (attrs.label ? { "data-label": attrs.label } : {}),
      },
      // Taille du cadre de signature (uniquement pertinente pour les blocs de
      // signature) — sérialisée en data-w / data-h, reprise au rendu PDF.
      w: {
        default: null,
        parseHTML: (el) => toNum(el.getAttribute("data-w")),
        renderHTML: (attrs) => (attrs.w ? { "data-w": attrs.w } : {}),
      },
      h: {
        default: null,
        parseHTML: (el) => toNum(el.getAttribute("data-h")),
        renderHTML: (attrs) => (attrs.h ? { "data-h": attrs.h } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TokenView);
  },

  parseHTML() {
    return [{ tag: "span[data-token]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes({ class: "doc-token", contenteditable: "false" }, HTMLAttributes),
      node.attrs.label || node.attrs.token || "",
    ];
  },

  renderText({ node }) {
    return `{${node.attrs.token}}`;
  },

  addCommands() {
    return {
      insertToken:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      insertTokenAt:
        (pos, attrs) =>
        ({ commands }) =>
          commands.insertContentAt(pos, { type: this.name, attrs }),
    };
  },
});

export default TokenNode;
