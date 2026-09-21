import { Icon } from "./Icon.jsx";

/**
 * LE BANDEAU « FICHE INCOMPLÈTE » — en tête de la fiche stagiaire (demandé le 2026-09-21).
 *
 * Il existe parce que la fiche ne montre pas ce qui manque : « Contact & identité » n'affiche que
 * les lignes remplies, et une adresse vide y disparaissait sans laisser de trace. Le serveur dit ce
 * qui manque et pourquoi (`champs_manquants`, src/api/lib/ficheIncomplete.js) ; ce composant ne
 * fait que le dire, en deux raisons distinctes :
 *   · ce que l'école envoie à ses partenaires — avec l'accord du stagiaire, d'où la précision ;
 *   · l'essentiel, pour le joindre et pour ses documents.
 *
 * Rien ne manque, ou serveur d'avant (clé absente) : pas de bandeau.
 */
export default function FicheIncomplete({ manquants, onCompleter }) {
  if (!Array.isArray(manquants) || manquants.length === 0) return null;
  const n = manquants.length;
  const libelles = (garde) => manquants.filter(garde).map((m) => m.libelle);
  const partenaires = libelles((m) => m.partenaires);
  const essentiel = libelles((m) => !m.partenaires);
  return (
    <div className="fiche-incomplete" role="status">
      <Icon name="alert-triangle" size={18} aria-hidden="true" />
      <div className="fiche-incomplete-corps">
        <b>Fiche incomplète : {n} information{n > 1 ? "s" : ""} manque{n > 1 ? "nt" : ""}</b>
        {partenaires.length > 0 && (
          <p>{partenaires.length > 1 ? "Envoyées" : "Envoyée"} aux partenaires, avec l'accord du stagiaire : <span>{partenaires.join(", ")}</span></p>
        )}
        {essentiel.length > 0 && <p>Pour joindre le stagiaire et pour ses documents : <span>{essentiel.join(", ")}</span></p>}
      </div>
      <button type="button" className="btn sm primary" onClick={onCompleter}>Compléter la fiche</button>
    </div>
  );
}
