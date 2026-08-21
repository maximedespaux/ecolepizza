import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

/**
 * Image en ligne et redimensionnable.
 *   · inline : plusieurs images peuvent tenir sur une même ligne (comme du texte) ;
 *   · width/height : sérialisés comme vrais attributs HTML (conservés dans le PDF) ;
 *   · alignement : géré par l'alignement du paragraphe (gauche / centre / droite) ;
 *   · poignée de coin : glisser = proportionnel, Maj + glisser = largeur/hauteur libres.
 */
function ImageView({ node, updateAttributes, selected }) {
  const { src, alt, title, width, height } = node.attrs;

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
      const w = Math.max(30, Math.round(startW + (ev.clientX - startX)));
      const h = free ? Math.max(20, Math.round(startH + (ev.clientY - startY))) : Math.round(w / ratio);
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
    <NodeViewWrapper as="span" className={"img-node" + (selected ? " sel" : "")}>
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
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

export default ResizableImage;
