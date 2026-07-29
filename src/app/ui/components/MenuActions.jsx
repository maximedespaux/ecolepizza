import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";

/**
 * Le menu des actions SECONDAIRES d'une ligne.
 *
 * Une ligne de facture portait six commandes de même poids : Émettre, Payer, Aperçu, Factur-X,
 * XML, Supprimer. « Encaisser » se fait tous les jours, « exporter le XML » deux fois par an —
 * les afficher pareil oblige à relire les six intitulés à chaque ligne avant de cliquer. La
 * page garde donc UNE action principale, celle que l'état appelle, et range le reste ici.
 *
 * RENDU DANS UN PORTAIL, sur `document.body`. Deux raisons, et la seconde est un piège :
 *
 *  · `.tablewrap` défile horizontalement : en `position:absolute`, le panneau serait ROGNÉ par
 *    ce conteneur — visible sur les premières colonnes, coupé sur les dernières.
 *
 *  · `position:fixed` NE SUFFIT PAS. `.card` porte `animation: rise … both`, dont l'image
 *    finale laisse un `transform` (fût-il la matrice identité) appliqué en permanence. Or un
 *    ancêtre transformé devient le bloc conteneur des descendants `fixed` : le menu se
 *    positionnait alors par rapport à la CARTE, pas à la fenêtre — 302 px d'écart mesurés, et
 *    un panneau qui tombait hors de l'écran. Seul le portail échappe à tout ancêtre.
 *
 * Il se ferme au clic extérieur, à Échap, au défilement (sinon il resterait accroché là où le
 * bouton n'est plus) et après n'importe quelle action choisie.
 */
export default function MenuActions({ label = "Autres actions", children }) {
  const [pos, setPos] = useState(null);   // null = fermé
  const refBouton = useRef(null);
  const refPop = useRef(null);

  useEffect(() => {
    if (!pos) return;
    /* Le panneau vit dans un portail : il n'est PAS un descendant du bouton dans le document,
       et un `contains` sur le seul bouton le déclarerait « extérieur ». Le menu se refermerait
       alors sur le `mousedown`, avant que le `click` n'ait déclenché l'action choisie. */
    const dehors = (e) => {
      if (refBouton.current?.contains(e.target)) return;
      if (refPop.current?.contains(e.target)) return;
      setPos(null);
    };
    const clavier = (e) => { if (e.key === "Escape") setPos(null); };
    const fermer = () => setPos(null);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    window.addEventListener("scroll", fermer, true);   // `true` : capte aussi les défilements internes
    window.addEventListener("resize", fermer);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
    };
  }, [pos]);

  function basculer(e) {
    if (pos) { setPos(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const droite = Math.round(window.innerWidth - r.right);
    /* IL S'OUVRE VERS LE HAUT quand le bouton est dans le bas de l'écran. Ancré au-dessous sans
       condition, le menu d'une ligne de bas de tableau tombait hors de la fenêtre : le bouton
       répondait, et rien n'apparaissait. On ancre par `bottom` plutôt que par `top`, ce qui
       évite d'avoir à connaître sa hauteur avant de l'avoir rendu. */
    setPos(r.bottom > window.innerHeight * 0.6
      ? { bottom: Math.round(window.innerHeight - r.top + 4), right: droite }
      : { top: Math.round(r.bottom + 4), right: droite });
  }

  return (
    <span className="menuact">
      <button ref={refBouton} type="button" className="iconbtn" aria-label={label}
        aria-expanded={!!pos} onClick={basculer}>
        <Icon name="menu" size={15} />
      </button>
      {/* `pos` est étalé EN ENTIER dans le style : il porte `top` OU `bottom` selon le sens
          d'ouverture, et n'en lire que `top` laissait le panneau sans ancrage vertical dès
          qu'il basculait vers le haut — il retombait alors hors de la fenêtre. */}
      {pos && createPortal(
        <div ref={refPop} className="menuact-pop" style={pos} onClick={() => setPos(null)}>
          {children}
        </div>,
        document.body
      )}
    </span>
  );
}
