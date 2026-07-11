import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";

// Attribut « hauteur de ligne » : hauteur mini sur la cellule. Sérialisé en style
// (min-height/height) → conservé dans le HTML et repris au rendu PDF.
function heightAttribute() {
  return {
    minHeight: {
      default: null,
      parseHTML: (el) => {
        const m = /min-height\s*:\s*(\d+)px/i.exec(el.getAttribute("style") || "");
        return m ? parseInt(m[1], 10) : null;
      },
      renderHTML: (attrs) => (attrs.minHeight ? { style: `min-height:${attrs.minHeight}px;height:${attrs.minHeight}px` } : {}),
    },
  };
}

// Vue React d'une cellule : contenu éditable + poignée en bas pour redimensionner la LIGNE.
function makeCellView(tag) {
  return function CellView({ node, updateAttributes }) {
    const h = node.attrs.minHeight;
    const onDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cell = e.currentTarget.closest(tag);
      const startY = e.clientY;
      const startH = cell ? cell.offsetHeight : 24;
      const move = (ev) => updateAttributes({ minHeight: Math.max(20, Math.round(startH + (ev.clientY - startY))) });
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
    return (
      <NodeViewWrapper as={tag}
        colSpan={node.attrs.colspan > 1 ? node.attrs.colspan : undefined}
        rowSpan={node.attrs.rowspan > 1 ? node.attrs.rowspan : undefined}
        style={h ? { height: h + "px" } : undefined}>
        <NodeViewContent as="div" style={{ minHeight: "1em" }} />
        <span className="row-grip" contentEditable={false} onMouseDown={onDown} title="Glisser pour la hauteur de ligne" />
      </NodeViewWrapper>
    );
  };
}

export const ResizableTableCell = TableCell.extend({
  addAttributes() { return { ...(this.parent?.() || {}), ...heightAttribute() }; },
  addNodeView() { return ReactNodeViewRenderer(makeCellView("td")); },
});

export const ResizableTableHeader = TableHeader.extend({
  addAttributes() { return { ...(this.parent?.() || {}), ...heightAttribute() }; },
  addNodeView() { return ReactNodeViewRenderer(makeCellView("th")); },
});
