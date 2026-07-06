// Feuille de route documentaire : une étape par document, colorée par état
// (gris = à faire, orange = en cours, vert = terminé).

const TAG = { todo: "À faire", progress: "En cours", done: "Terminé" };

/** État d'une étape à partir du statut du document. */
function stepState(doc) {
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
              <span className={`rm-dot ${state}`}>{state === "done" ? "✓" : doc.num}</span>
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
