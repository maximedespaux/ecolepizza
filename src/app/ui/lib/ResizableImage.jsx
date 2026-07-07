import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

// Marges selon l'alignement (élément bloc de largeur définie).
const ALIGN_MARGIN = {
  left: { marginLeft: "0", marginRight: "auto" },
  center: { marginLeft: "auto", marginRight: "auto" },
  right: { marginLeft: "auto", marginRight: "0" },
};

/**
 * Image redimensionnable : on garde l'extension Image de base, on ajoute les
 * attributs width/height (sérialisés comme vrais attributs HTML, donc conservés
 * dans le PDF) et une poignée de redimensionnement à la souris.
 *   · glisser le coin  = redimensionne en conservant les proportions
 *   · Maj + glisser     = largeur/hauteur indépendantes
 */
function ImageView({ node, updateAttributes, selected }) {
  const { src, alt, title, width, height, align } = node.attrs;
  const wrapStyle = { display: "block", width: "fit-content", ...(ALIGN_MARGIN[align] || ALIGN_MARGIN.left) };

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const wrap = e.currentTarget.parentNode;
    const img = wrap.querySelector("img");
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = img.offsetWidth;
    const startH = img.offsetHeight;
    const ratio = startH ? startW / startH : 1;

    const onMove = (ev) => {
      const free = ev.shiftKey;
      let w = Math.max(30, Math.round(startW + (ev.clientX - startX)));
      let h = free ? Math.max(20, Math.round(startH + (ev.clientY - startY))) : Math.round(w / ratio);
      updateAttributes({ width: w, height: h });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <NodeViewWrapper as="span" className={"img-node" + (selected ? " sel" : "")} style={wrapStyle}>
      <img
        src={src}
        alt={alt || ""}
        title={title || ""}
        draggable={false}
        style={{ width: width ? width + "px" : "auto", height: height ? height + "px" : "auto" }}
      />
      {selected && (
        <>
          <span className="img-dim">{width ? `${width}×${height || "auto"}` : "taille auto"}</span>
          <span className="img-handle" onMouseDown={startResize} title="Glisser pour redimensionner (Maj : libre)" />
        </>
      )}
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    const parent = this.parent?.() || {};
    const num = (v) => {
      if (v == null) return null;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    };
    return {
      ...parent,
      width: {
        default: null,
        parseHTML: (el) => num(el.getAttribute("width") || el.style.width),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => num(el.getAttribute("height") || el.style.height),
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
      align: {
        default: "left",
        parseHTML: (el) => el.getAttribute("data-align")
          || el.closest("[data-align]")?.getAttribute("data-align")
          || "left",
        renderHTML: (attrs) => ({ "data-align": attrs.align || "left" }),
      },
    };
  },
  // Rendu (aperçu + PDF) : image encadrée dans un bloc aligné (compatible LibreOffice).
  renderHTML({ HTMLAttributes, node }) {
    const align = node.attrs.align || "left";
    return [
      "div",
      { class: "img-align", style: `text-align:${align}` },
      ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

export default ResizableImage;
