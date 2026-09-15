import { Icon } from "./Icon.jsx";
/* La règle d'état vit dans `lib/etapes.js` : elle est partagée avec le suivi Qualiopi, et
   l'avoir gardée ici avait produit une copie divergente (cf. l'en-tête de ce fichier-là). */
import { stepState } from "../lib/etapes.js";

// Feuille de route documentaire : une étape par document, colorée par état
// (gris = à faire, orange = en cours, vert = terminé).

const TAG = { todo: "À faire", progress: "En cours", done: "Terminé" };

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
