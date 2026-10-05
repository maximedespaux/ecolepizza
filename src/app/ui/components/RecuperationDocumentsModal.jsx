import { useState } from "react";
import { createPortal } from "react-dom";
import { dateFr } from "../lib/format.js";

/**
 * RÉCUPÉRER LES DOCUMENTS d'un dossier recréé après une session supprimée par erreur.
 *
 * À la réinscription, le serveur a retrouvé des documents ORPHELINS du stagiaire (détachés par la
 * suppression) dont le modèle appartient au parcours. On les propose au rattachement — cochés par
 * défaut, décochables — et on confirme AVANT d'agir : on ne rattache rien en douce. Un document
 * rattaché reprend sa place dans le parcours, avec son statut (signé reste signé).
 */
const ETIQUETTE = {
  A_FAIRE: "à faire", GENERE: "généré", ENVOYE: "envoyé",
  CONSULTE: "consulté", SIGNE: "signé", ARCHIVE: "archivé",
};

function RecuperationDocumentsModal({ nom, docs = [], onClose, onConfirm }) {
  const [choisis, setChoisis] = useState(() => new Set(docs.map((d) => d.id)));
  const [envoi, setEnvoi] = useState(false);

  function bascule(id) {
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function valider() {
    if (envoi || choisis.size === 0) return;
    setEnvoi(true);
    try { await onConfirm([...choisis]); } finally { setEnvoi(false); }
  }

  return createPortal(
    <div className="overlay">
      <div className="modal">
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Récupérer les documents de {nom}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer" disabled={envoi}>×</button>
        </div>
        <div className="mbody">
          <p style={{ marginTop: 0 }}>
            {docs.length} document{docs.length > 1 ? "s" : ""} de ce stagiaire {docs.length > 1 ? "ont été retrouvés" : "a été retrouvé"},
            détaché{docs.length > 1 ? "s" : ""} d'une session supprimée. Les rattacher au dossier restaure l'avancement de son parcours.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 220, overflow: "auto" }}>
            {docs.map((d) => (
              <li key={d.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0" }}>
                <input type="checkbox" checked={choisis.has(d.id)} onChange={() => bascule(d.id)} style={{ marginTop: 3 }} />
                <span>
                  <b>{d.title || d.type}</b>{" "}
                  <span className="hint">({ETIQUETTE[d.status] || (d.status || "").toLowerCase()}{d.signed_at ? `, signé le ${dateFr(d.signed_at)}` : ""})</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginBottom: 0 }}>
            Un document non coché reste détaché (il restera récupérable plus tard).
          </p>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose} disabled={envoi}>Ignorer</button>
          <button className="btn primary" onClick={valider} disabled={envoi || choisis.size === 0}>
            {envoi ? "Rattachement…" : `Rattacher ${choisis.size} document${choisis.size > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default RecuperationDocumentsModal;
