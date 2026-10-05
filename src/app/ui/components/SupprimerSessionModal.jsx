import { useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "./Field.jsx";

/**
 * SUPPRIMER UNE SESSION — garde-fou contre la suppression par mégarde d'une session PEUPLÉE.
 *
 * Supprimer une session retire ses inscriptions (en cascade) et DÉTACHE tous les documents liés :
 * trop lourd pour un simple « OK ». La fenêtre montre ce qui part (stagiaires nommés + nombre de
 * documents) et n'arme le bouton rouge que si l'on RECOPIE le nom de la session ET le nombre de
 * stagiaires — deux regards sur ce qu'on détruit, pas un réflexe. Décidé avec l'école le 2026-10-05,
 * après qu'une session pleine a été supprimée par erreur.
 *
 * Le serveur exige en plus `confirmer=1` (deleteSession) : le garde-fou n'est pas qu'à l'écran.
 */
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function SupprimerSessionModal({ nomSession, stagiaires = [], documentsLies = 0, onClose, onConfirm }) {
  const [nom, setNom] = useState("");
  const [nombre, setNombre] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const n = stagiaires.length;
  // Les DEUX doivent correspondre : le nom (à la casse et aux espaces près) et le nombre exact.
  const pret = norm(nom) === norm(nomSession) && nombre.trim() === String(n);

  async function valider() {
    if (!pret || envoi) return;
    setEnvoi(true);
    try { await onConfirm(); } finally { setEnvoi(false); }
  }

  return createPortal(
    <div className="overlay">
      <div className="modal">
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Supprimer la session</h3>
          <button className="x" onClick={onClose} aria-label="Fermer" disabled={envoi}>×</button>
        </div>
        <div className="mbody">
          <p style={{ marginTop: 0 }}>
            Vous allez supprimer <b>{nomSession}</b> : {n} stagiaire{n > 1 ? "s" : ""} retiré{n > 1 ? "s" : ""} de la session
            {documentsLies > 0 ? <>, et <b>{documentsLies} document{documentsLies > 1 ? "s" : ""}</b> détaché{documentsLies > 1 ? "s" : ""}</> : null}.
          </p>
          {n > 0 && (
            <ul style={{ marginTop: 0, maxHeight: 150, overflow: "auto" }}>
              {stagiaires.map((s) => (
                <li key={s.id}>{[s.first_name, s.last_name].filter(Boolean).join(" ") || "Stagiaire"}</li>
              ))}
            </ul>
          )}
          <p className="hint">
            Les documents ne sont pas effacés : ils restent récupérables en recréant la session et en
            réinscrivant les stagiaires. L'émargement et les notes d'évaluation, eux, sont perdus.
          </p>
          <Field label={<>Recopiez le nom de la session : <b>{nomSession}</b></>}
            value={nom} onChange={(e) => setNom(e.target.value)} placeholder={nomSession} autoFocus />
          <Field label={<>Recopiez le nombre de stagiaires : <b>{n}</b></>}
            value={nombre} onChange={(e) => setNombre(e.target.value)} inputMode="numeric" placeholder={String(n)} />
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose} disabled={envoi}>Annuler</button>
          <button className="btn danger" onClick={valider} disabled={!pret || envoi}>
            {envoi ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SupprimerSessionModal;
