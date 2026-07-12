import { NodeViewWrapper } from "@tiptap/react";

// Dimensions par défaut du cadre de signature — DOIVENT rester synchronisées avec
// SIG_W / SIG_H côté rendu (src/api/lib/tokens.js).
const SIG_W = 200;
const SIG_H = 64;

/** Un jeton est-il un bloc de signature (redimensionnable) ? */
const isSig = (t) =>
  t === "Signature stagiaire" || t === "Signature organisme" || String(t || "").startsWith("sig:");

/**
 * Vue d'un jeton dans l'éditeur.
 *  · jeton normal  → puce compacte (identique à avant) ;
 *  · bloc signature → cadre en pointillés à TAILLE RÉELLE, redimensionnable au
 *    glisser d'une poignée de coin (Maj = largeur/hauteur libres). La taille est
 *    stockée sur le nœud (data-w / data-h) et reprise au rendu PDF.
 */
export default function TokenView({ node, updateAttributes, selected }) {
  const { token, label, w, h } = node.attrs;

  if (!isSig(token)) {
    return (
      <NodeViewWrapper as="span" className="doc-token" contentEditable={false}>
        {label || token || ""}
      </NodeViewWrapper>
    );
  }

  const width = w || SIG_W;
  const height = h || SIG_H;

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;
    const ratio = startH ? startW / startH : SIG_W / SIG_H;

    const onMove = (ev) => {
      const free = ev.shiftKey;
      const nw = Math.max(60, Math.round(startW + (ev.clientX - startX)));
      const nh = free ? Math.max(24, Math.round(startH + (ev.clientY - startY))) : Math.round(nw / ratio);
      updateAttributes({ w: nw, h: nh });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <NodeViewWrapper
      as="span"
      className={"sig-node" + (selected ? " sel" : "")}
      contentEditable={false}
      style={{ display: "inline-block", position: "relative", verticalAlign: "middle", margin: "0 2px" }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: width + "px", height: height + "px", boxSizing: "border-box",
          border: "1px dashed #b0b0b0", borderRadius: 6, color: "#999",
          fontSize: "9pt", textAlign: "center", overflow: "hidden",
          outline: selected ? "2px solid #1d6fb8" : "none", outlineOffset: 1,
        }}
      >
        {label || "Signature"}
      </span>
      {selected && (
        <>
          <span className="img-dim">{width}×{height}</span>
          <span className="img-handle" onMouseDown={startResize} title="Glisser pour redimensionner (Maj : libre)" />
        </>
      )}
    </NodeViewWrapper>
  );
}
