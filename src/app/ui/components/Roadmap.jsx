import { Icon } from "./Icon.jsx";

// Feuille de route documentaire : une étape par document, colorée par état
// (gris = à faire, orange = en cours, vert = terminé).

const TAG = { todo: "À faire", progress: "En cours", done: "Terminé" };

/** État d'une étape à partir du statut du document. */
function stepState(doc) {
  /* UNE PIÈCE N'A PAS DE DOCUMENT GÉNÉRÉ : son état vient de son dépôt, pas d'un
     `status`. Sans ce cas, elle tombait dans la règle générale — `status` valant « à faire »
     à vie — et la feuille de route affichait « à faire » sous une carte d'identité pourtant
     validée, pendant que le parcours du dossier, lui, la donnait terminée.
     Refusée ⇒ « à faire » : il y a bien quelque chose à refaire, et le motif se lit dans la
     carte des pièces du dossier, pas ici. */
  if (doc.piece) {
    if (doc.pieceStatus === "VALIDEE") return "done";
    if (doc.pieceStatus === "DEPOSEE") return "progress";
    return "todo";
  }
  if (doc.status === "SIGNE") return "done";
  if (doc.stagiaireSign) {
    return ["ENVOYE", "CONSULTE", "GENERE"].includes(doc.status) ? "progress" : "todo";
  }
  // Document non signable : considéré terminé dès qu'il est généré/envoyé.
  return ["GENERE", "ENVOYE", "CONSULTE"].includes(doc.status) ? "done" : "todo";
}

function Roadmap({ steps }) {
  return (
    <div className="roadmap">
      {steps.map((doc, i) => {
        const state = stepState(doc);
        const last = i === steps.length - 1;
        return (
          <div className="rm-step" key={doc.type + doc.num}>
            <div className="rm-rail">
              <span className={`rm-dot ${state}`}>{state === "done" ? <Icon name="check" size={14} /> : doc.num}</span>
              {!last && <span className={`rm-conn ${state === "done" ? "done" : ""}`} />}
            </div>
            <div className="rm-body">
              <b>{doc.label}</b>
              <span className={`rm-tag ${state}`}>
                {TAG[state]}{doc.stagiaireSign ? " · à signer" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Roadmap;
