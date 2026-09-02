import { useEffect, useState } from "react";
import { getDossierPieces, verifierPiece, pieceFichierUrl } from "../api/apiClient.js";
import Badge from "./Badge.jsx";
import { Icon } from "./Icon.jsx";
import { dateHeure } from "../lib/format.js";

/**
 * PIÈCES JUSTIFICATIVES — revue par le PERSONNEL, pour un dossier (enrollment) donné.
 *
 * Le stagiaire dépose ses pièces depuis son espace ; l'école les VALIDE ou les REFUSE ici (motif
 * requis au refus, visible par le stagiaire, qui peut alors en renvoyer une). Les fichiers sont
 * chiffrés au repos et déchiffrés à la volée par le serveur à l'ouverture (garde de propriété +
 * personnel). La carte ne s'affiche pas s'il n'y a aucune pièce attendue pour ce dossier.
 */
const ETAT = { VALIDEE: ["Validée", "g"], DEPOSEE: ["À vérifier", "a"], REFUSEE: ["Refusée", "r"], ATTENDUE: ["À fournir", "n"] };

export default function PiecesReview({ enrollmentId }) {
  const [pieces, setPieces] = useState(null);
  const [erreur, setErreur] = useState(null);

  function load() {
    if (!enrollmentId) { setPieces([]); return; }
    getDossierPieces(enrollmentId).then((r) => setPieces(r.data || [])).catch(() => setPieces([]));
  }
  useEffect(() => { load(); }, [enrollmentId]);

  async function decider(depotId, statut) {
    let motif = "";
    if (statut === "REFUSEE") {
      motif = (window.prompt("Motif du refus (visible par le stagiaire) :") || "").trim();
      if (!motif) return; // annulé / vide → on ne fait rien (le serveur l'exigerait de toute façon)
    }
    try { await verifierPiece(depotId, statut, motif); setErreur(null); load(); }
    catch (e) { setErreur(e.message); }
  }

  if (!pieces || pieces.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="file-text" size={16} /> Pièces justificatives
      </h3>
      {erreur && <p className="hint" style={{ color: "var(--red, #c0392b)", marginTop: 0 }}>{erreur}</p>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {pieces.map((p) => {
          const [label, tone] = ETAT[p.statut] || [p.statut, "n"];
          const fichier = p.fichiers?.[0];
          return (
            <div key={p.piece_type_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 140 }}>
                <b>{p.label}</b>
                {p.statut === "REFUSEE" && p.motif_refus && <span style={{ display: "block", fontSize: 12, color: "var(--red, #c0392b)" }}>Refus : {p.motif_refus}</span>}
                {p.statut === "VALIDEE" && p.verifie_par && <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>Validée par {p.verifie_par}{p.verifie_le ? ` · ${dateHeure(p.verifie_le)}` : ""}</span>}
              </span>
              <Badge tone={tone}>{label}</Badge>
              {fichier && <button className="btn sm ghost" onClick={() => window.open(pieceFichierUrl(fichier.id), "_blank", "noopener")}><Icon name="eye" size={14} /> Voir</button>}
              {fichier && p.depot_id && p.statut !== "VALIDEE" && (
                <button className="btn sm primary" onClick={() => decider(p.depot_id, "VALIDEE")}><Icon name="check" size={14} /> Valider</button>
              )}
              {fichier && p.depot_id && p.statut !== "REFUSEE" && (
                <button className="btn sm ghost danger" onClick={() => decider(p.depot_id, "REFUSEE")}><Icon name="x" size={14} /> Refuser</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
