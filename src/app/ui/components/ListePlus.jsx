import { PAS } from "../lib/listeBornee.js";

/**
 * Le pied d'une liste bornée.
 *
 * LA BORNE DOIT SE DIRE. Une liste tronquée en silence se lit exactement comme une liste
 * complète : on chercherait quelqu'un qui s'y trouve, sans le voir, et sans comprendre
 * pourquoi. Le pied annonce donc ce qui est montré, sur combien, et propose la suite.
 *
 * Il ne s'affiche que lorsque la liste est effectivement coupée — sinon il répéterait le
 * total déjà porté par le titre de la carte.
 */
export default function ListePlus({ montres, total, reste, onPlus }) {
  return (
    <div className="liste-plus">
      <span>
        <b className="tnum">{montres}</b> affichés sur <b className="tnum">{total}</b>
        {" — précisez la recherche pour trouver plus vite."}
      </span>
      <button type="button" className="btn sm" onClick={onPlus}>
        Afficher {Math.min(PAS, reste)} de plus
      </button>
    </div>
  );
}
