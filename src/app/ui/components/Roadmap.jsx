import { Icon } from "./Icon.jsx";
/* La règle d'état vit dans `lib/etapes.js` : elle est partagée avec le suivi Qualiopi, et
   l'avoir gardée ici avait produit une copie divergente (cf. l'en-tête de ce fichier-là). */
import { stepState } from "../lib/etapes.js";

// Feuille de route documentaire : une étape par document, colorée par état
// (gris = à faire, orange = en cours, vert = terminé).

const TAG = { todo: "À faire", progress: "En cours", done: "Terminé", skip: "Sans objet" };

function Roadmap({ steps }) {
  return (
    <div className="roadmap">
      {steps.map((doc, i) => {
        const state = stepState(doc);
        const last = i === steps.length - 1;
        return (
          <div className="rm-step" key={doc.type + doc.num}>
            <div className="rm-rail">
              {/* « Sans objet » porte un TIRET, pas une coche ni un numéro : ni faite ni due,
                  elle ne concerne pas cette personne. Une coche la ferait passer pour un
                  document remis, ce qui serait faux sur un dossier présenté à un contrôle. */}
              <span className={`rm-dot ${state}`}>
                {state === "done" ? <Icon name="check" size={14} /> : state === "skip" ? "—" : doc.num}
              </span>
              {!last && <span className={`rm-conn ${state === "done" ? "done" : ""}`} />}
            </div>
            <div className="rm-body">
              <b>{doc.label}</b>
              <span className={`rm-tag ${state}`}>
                {/* Une étape écartée ne porte pas « · à signer » : elle n'appelle plus rien. */}
                {TAG[state]}{doc.stagiaireSign && state !== "skip" ? " · à signer" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Roadmap;
