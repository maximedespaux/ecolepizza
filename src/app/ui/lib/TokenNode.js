import { Node, mergeAttributes } from "@tiptap/core";

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
    };
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
