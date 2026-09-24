import { useEffect, useState } from "react";
import { getDossierPieces, verifierPiece, pieceFichierUrl, supprimerPieceFichier } from "../api/apiClient.js";
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

/* `taille` est la taille CLAIRE, celle du fichier d'origine — les octets stockés sont chiffrés
   et plus volumineux. On l'affiche pour distinguer deux scans qui portent le même nom. */
const poids = (o) => (o >= 1024 * 1024 ? `${Math.round((o / 1024 / 1024) * 10) / 10} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

/* `refresh` : un compteur que l'appelant incrémente après avoir déposé une pièce POUR le
   stagiaire. Sans lui, la carte garderait l'état d'avant le dépôt — la pièce apparaîtrait
   encore « à fournir » alors qu'elle vient d'arriver, et il faudrait recharger la page. */
export default function PiecesReview({ enrollmentId, refresh }) {
  const [pieces, setPieces] = useState(null);
  const [erreur, setErreur] = useState(null);

  function load() {
    if (!enrollmentId) { setPieces([]); return; }
    getDossierPieces(enrollmentId).then((r) => setPieces(r.data || [])).catch(() => setPieces([]));
  }
  useEffect(() => { load(); }, [enrollmentId, refresh]);

  async function decider(depotId, statut) {
    let motif = "";
    if (statut === "REFUSEE") {
      motif = (window.prompt("Motif du refus (visible par le stagiaire) :") || "").trim();
      if (!motif) return; // annulé / vide → on ne fait rien (le serveur l'exigerait de toute façon)
    }
    try { await verifierPiece(depotId, statut, motif); setErreur(null); load(); }
    catch (e) { setErreur(e.message); }
  }

  /* RETIRER UN SEUL FICHIER, pas toute la pièce. Une pièce peut en porter plusieurs (jusqu'à six) :
     quand une seule page est en trop ou illisible, on l'enlève sans obliger le stagiaire à tout
     redéposer. Suppression définitive — c'est la purge manuelle d'une copie chiffrée (cf. la règle
     de conservation des pièces, CLAUDE.md) —, d'où la confirmation. Si c'était le dernier fichier,
     le serveur remet la pièce « à fournir ». */
  async function retirerFichier(f, pieceLabel) {
    if (!window.confirm(`Retirer « ${f.nom || "ce fichier"} » de « ${pieceLabel} » ?\nLa suppression est définitive.`)) return;
    try { await supprimerPieceFichier(f.id); setErreur(null); load(); }
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
          const fichiers = p.fichiers || [];
          const aDesFichiers = fichiers.length > 0;
          return (
            <div key={p.piece_type_id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 140 }}>
                  <b>{p.label}</b>
                  {p.statut === "REFUSEE" && p.motif_refus && <span style={{ display: "block", fontSize: 12, color: "var(--red, #c0392b)" }}>Refus : {p.motif_refus}</span>}
                  {p.statut === "VALIDEE" && p.verifie_par && <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>Validée par {p.verifie_par}{p.verifie_le ? ` · ${dateHeure(p.verifie_le)}` : ""}</span>}
                </span>
                <Badge tone={tone}>{label}</Badge>
                {/* VALIDER / REFUSER PORTENT SUR LE DÉPÔT ENTIER, pas sur un fichier : c'est la
                    pièce qu'on accepte, et un justificatif incomplet se refuse en bloc. */}
                {aDesFichiers && p.depot_id && p.statut !== "VALIDEE" && (
                  <button className="btn sm primary" onClick={() => decider(p.depot_id, "VALIDEE")}><Icon name="check" size={14} /> Valider</button>
                )}
                {aDesFichiers && p.depot_id && p.statut !== "REFUSEE" && (
                  <button className="btn sm ghost danger" onClick={() => decider(p.depot_id, "REFUSEE")}><Icon name="x" size={14} /> Refuser</button>
                )}
              </div>

              {/* CHAQUE FICHIER, PAS SEULEMENT LE PREMIER. L'écran lisait `fichiers[0]` : sur un
                  justificatif de six pages, une seule était consultable et les cinq autres
                  restaient invisibles — donc invérifiables, alors qu'on demande justement de les
                  vérifier avant de valider. On les nomme, et on donne leur poids : deux scans du
                  même nom ne se distinguent autrement pas. */}
              {aDesFichiers && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, paddingLeft: 2 }}>
                  {fichiers.map((f, i) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}>
                      <span style={{ color: "var(--dim)", flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={f.nom || `Fichier ${i + 1}`}>{f.nom || `Fichier ${i + 1}`}</span>
                      {f.taille != null && <span style={{ color: "var(--dim)", flex: "0 0 auto" }}>{poids(f.taille)}</span>}
                      <button className="btn sm ghost" style={{ flex: "0 0 auto" }}
                        aria-label={`Voir ${f.nom || `le fichier ${i + 1}`} de ${p.label}`}
                        onClick={() => window.open(pieceFichierUrl(f.id), "_blank", "noopener")}>
                        <Icon name="eye" size={13} /> Voir
                      </button>
                      {/* RETIRER CE FICHIER SEUL — le geste demandé : enlever une page sans vider
                          toute la pièce. */}
                      <button className="btn sm ghost danger" style={{ flex: "0 0 auto" }}
                        aria-label={`Retirer ${f.nom || `le fichier ${i + 1}`} de ${p.label}`}
                        onClick={() => retirerFichier(f, p.label)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
