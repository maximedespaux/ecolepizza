/**
 * LE POINT DU DOIGT, DANS LES COORDONNÉES DU CANEVAS DE SIGNATURE.
 *
 * Le canevas dessine sur 520 × 150 points, mais il s'AFFICHE à la largeur de la fenêtre de
 * signature : 520 px sur ordinateur, 325 sur un téléphone. Le code prenait la position du doigt
 * en pixels ÉCRAN et la traçait telle quelle : sur téléphone, un trait allant de 250 à 300 px
 * tombait entre 156 et 188 px (mesuré le 2026-09-17). L'encre ne suivait pas le doigt, et une
 * signature tracée d'un bord à l'autre s'entassait dans les deux tiers gauches du cadre. Sur
 * ordinateur, les deux largeurs coïncident : personne ne l'avait vu.
 *
 * On convertit donc — et avec le MÊME rapport en largeur et en hauteur, parce que l'affichage
 * garde les proportions du canevas (cf. SignatureModal) : l'image enregistrée reste un 520 × 150
 * où la signature a la forme tracée, quel que soit l'écran. (Le rendu PDF, lui, étirait en plus
 * l'image dans son cadre ; il garde ses proportions depuis le 2026-09-26 — lib/imagesPdf.js.)
 *
 * La bordure du canevas est retirée avant la mise à l'échelle : la zone de dessin commence à
 * l'intérieur du trait.
 *
 * @param {{clientX:number, clientY:number}} point  position du doigt ou de la souris (écran)
 * @param {{left:number, top:number, bordGauche:number, bordHaut:number,
 *          largeurAffichee:number, hauteurAffichee:number, largeur:number, hauteur:number}} c
 *   `left`/`top` : rectangle du canevas ; `bordGauche`/`bordHaut` : clientLeft/clientTop ;
 *   `largeurAffichee`/`hauteurAffichee` : clientWidth/clientHeight ; `largeur`/`hauteur` :
 *   dimensions internes (attributs width/height).
 */
export function versCanevas(point, c) {
  const x = point.clientX - c.left - c.bordGauche;
  const y = point.clientY - c.top - c.bordHaut;
  return {
    x: c.largeurAffichee ? (x * c.largeur) / c.largeurAffichee : x,
    y: c.hauteurAffichee ? (y * c.hauteur) / c.hauteurAffichee : y,
  };
}

/** Les mesures d'un élément <canvas> pour `versCanevas`. */
export function mesuresCanevas(canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    left: r.left, top: r.top, bordGauche: canvas.clientLeft, bordHaut: canvas.clientTop,
    largeurAffichee: canvas.clientWidth, hauteurAffichee: canvas.clientHeight,
    largeur: canvas.width, hauteur: canvas.height,
  };
}
