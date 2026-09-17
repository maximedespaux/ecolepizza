import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "./Field.jsx";
import { versCanevas, mesuresCanevas } from "../lib/canevasSignature.js";

/**
 * Fenêtre de signature électronique simple (SES) : nom saisi + consentement +
 * signature manuscrite (canvas). onConfirm({ signer_name, signature_data }).
 *
 * RENDUE DANS `document.body`, PAS À SA PLACE DANS L'ARBRE. Un voile `position:fixed` n'est
 * centré sur l'ÉCRAN que si aucun ancêtre ne porte de `transform` / `filter` / `contain` :
 * la moindre transformation, même l'identité, fait de cet ancêtre le bloc conteneur et le
 * voile se recentre sur LUI. `Emargement` monte cette fenêtre à l'intérieur d'une `<Card>`,
 * et une carte survolée (`.card.hover:hover`) se translate de 2 px — le survol remontant
 * depuis la fenêtre elle-même, la popup se serait déplacée sous la souris. Le portail coupe
 * court : plus aucun ancêtre, donc plus rien à piéger.
 */
function SignatureModal({ doc, defaultName = "", onConfirm, onClose }) {
  const canvasRef = useRef(null);
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e2140";
    let drawing = false;
    let last = null;
    /* Position du doigt en coordonnées du CANEVAS, pas de l'écran : affiché plus étroit que ses
       520 points (téléphone), le canevas traçait l'encre à côté du doigt (cf. lib/canevasSignature). */
    const pos = (e) => versCanevas(e.touches ? e.touches[0] : e, mesuresCanevas(c));
    const down = (e) => { drawing = true; last = pos(e); e.preventDefault(); };
    const move = (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; setDrawn(true); e.preventDefault();
    };
    const up = () => { drawing = false; };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  function clearPad() {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  }

  async function confirm() {
    if (!name.trim() || !consent) return;
    setBusy(true);
    const signature_data = drawn ? canvasRef.current.toDataURL("image/png") : null;
    try {
      await onConfirm({ signer_name: name.trim(), signature_data });
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="overlay">
      <div className="modal">
        <div className="mhead">
          <h3 style={{ fontSize: 17 }}>Signer, {doc.label}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <Field label="Nom et prénom du signataire" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="field">
            <label>Signature</label>
            <canvas
              ref={canvasRef}
              width={520}
              height={150}
              /* LES PROPORTIONS DU CANEVAS, À L'ÉCRAN AUSSI (520 / 150). Une hauteur fixe de 150 px
                 sur une largeur de 325 aurait obligé à étirer le tracé en largeur seulement : la
                 signature enregistrée serait sortie déformée. Sur téléphone la zone est moins haute,
                 mais ce qu'on y trace est exactement ce qui part dans le document. */
              style={{ width: "100%", height: "auto", aspectRatio: "520 / 150", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "#fff", touchAction: "none", cursor: "crosshair" }}
            />
            <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={clearPad}>Effacer</button>
          </div>

          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "var(--muted)" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Je certifie l'exactitude des informations et j'accepte de signer ce document par voie électronique.</span>
          </label>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={confirm} disabled={busy || !name.trim() || !consent}>
            {busy ? "Signature…" : "Signer le document"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SignatureModal;
