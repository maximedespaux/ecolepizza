import { useState } from "react";
import { Icon } from "./Icon.jsx";

/**
 * CHOISIR LES FORMATIONS QU'UN MÊME DOCUMENT REÇU COUVRE, avant d'ouvrir le sélecteur de fichier
 * (demandé le 2026-10-03). Un stagiaire — ou une entreprise — inscrit à plusieurs sessions
 * importait le même document signé une fois PAR session : autant de doublons, le même papier en
 * plusieurs exemplaires. On le crée désormais UNE fois, lié à toutes les formations cochées.
 *
 * Présentation pure : la fenêtre ne connaît ni le fichier ni l'envoi. Elle recueille les sessions
 * cochées et les rend à l'appelant (`onValider`), qui ouvre alors le sélecteur de fichier et fait
 * l'import avec ces sessions-là. Elle ne s'affiche que lorsqu'il y a un vrai choix (≥ 2 options) et
 * que le document n'existe pas encore — sinon l'appelant ouvre le fichier directement, comme avant.
 */
export default function ImportSessionsModal({ label, options, defaut, onValider, onClose }) {
  const [sel, setSel] = useState(new Set(defaut || []));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 440, width: "92%" }}>
        <div className="mhead">
          <h3>Importer un document reçu</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="sub" style={{ marginTop: 0 }}>
            {label ? <>« <b>{label}</b> » concerne-t-il plusieurs formations ?</> : "Ce document concerne-t-il plusieurs formations ?"}{" "}
            Cochez-les : un <b>seul</b> document sera créé pour toutes, sans doublon.
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {options.map((o) => (
              <label key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={!sel.size} onClick={() => sel.size && onValider([...sel])}>
            <Icon name="upload" size={14} /> Choisir le fichier
          </button>
        </div>
      </div>
    </div>
  );
}
