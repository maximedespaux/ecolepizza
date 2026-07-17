/**
 * Avatars de l'espace stagiaire — au langage graphique de l'École Pizza.
 *
 * ═══ POURQUOI CE STYLE (et pas un autre) ═══
 * Calqué sur les icônes que Maxime a dessinées lui-même (icones-catégories-produits) :
 * silhouette BLANCHE PLEINE, viewBox 20, pleine tuile, détails EN CREUX (des trous, jamais
 * des traits ajoutés). Ce n'est pas un choix esthétique, c'est le résultat d'une comparaison :
 *
 * Une première version illustrée (multicolore, contours, sujet posé sur un médaillon crème)
 * s'est fait battre à plate couture par les icônes de Maxime au seul test qui compte — 32 px,
 * la pastille de la barre du haut. Deux causes mesurées :
 *   · le médaillon coûtait la moitié de la surface (sujet à 54 % de la tuile, puis rogné) ;
 *   · le multicolore et les contours fins tournaient en bouillie en réduction.
 * La silhouette pleine, elle, ne peut pas disparaître sur un fond coloré et occupe tout.
 *
 * ═══ LES RÈGLES, À TENIR ═══
 * 1. UNE seule couleur : blanc. La couleur de fond est libre (`<input type="color">` dans le
 *    profil) — du blanc sur une couleur de la charte marche toujours. C'est ce qui rend le
 *    problème « doré sur doré » impossible par construction.
 * 2. Les détails se font EN CREUX, avec fillRule="evenodd" : un sous-tracé intérieur perce
 *    un trou et laisse voir le fond. Jamais un trait de 1 px, il meurt à 32 px.
 * 3. Formes pleines et franches. Si tu ne reconnais pas le sujet à 32 px, c'est raté — la
 *    taille du sélecteur (96 px) ne sauve rien.
 * 4. Le sujet doit remplir la tuile (~16 sur 20 utiles, centré). Vérifié par getBBox, pas à
 *    l'œil : sur la version précédente, 14 dessins sur 16 débordaient sans que ça se voie.
 */

/* Contenu d'un <svg viewBox="0 0 20 20"> ; la couleur est portée par le parent (fill). */
export const AVATAR_ART = {
  // ── Le geste ──
  pizza: (
    <path fillRule="evenodd" d="M10 1.6 17 15.6A8.6 8.6 0 0 1 3 15.6ZM10 6.4a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3ZM6.7 12.2a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Zm6.6 0a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Z" />
  ),
  // Boule de pâte posée sur le marbre. Les bulles sont volontairement DÉSAXÉES et de
  // tailles différentes : deux trous symétriques, et le pâton devient un visage.
  paton: (
    <path fillRule="evenodd" d="M10 4.2c-4.4 0-7.9 3-7.9 6.6 0 2.2 1.6 3.7 3.7 3.7h8.4c2.1 0 3.7-1.5 3.7-3.7 0-3.6-3.5-6.6-7.9-6.6Zm3.1 3.5a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Zm-5 2.4a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Zm2.9 1.1a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1ZM3.4 15.6h13.2a.85.85 0 0 1 0 1.7H3.4a.85.85 0 0 1 0-1.7Z" />
  ),
  oven: (
    <path fillRule="evenodd" d="M10 1.9a8.4 8.4 0 0 0-8.4 8.4v3.6h16.8v-3.6A8.4 8.4 0 0 0 10 1.9Zm0 5a5 5 0 0 0-5 5v1.9h10v-1.9a5 5 0 0 0-5-5Zm.75 1.55c.4 1.5.15 2.45-.2 2.95-.3.4-.7.5-.9.1-.2-.35-.1-.75 0-1.3-.8.9-1.55 1.7-1.55 3.2a2.85 2.85 0 0 0 .1.75h4.6a2.85 2.85 0 0 0 .1-.75c0-2.05-1.7-3.6-2.15-4.95ZM1 15.1h18a.9.9 0 0 1 .9.9v1.1a.9.9 0 0 1-.9.9H1a.9.9 0 0 1-.9-.9V16a.9.9 0 0 1 .9-.9Z" />
  ),
  // Pale en CAISSON qui s'évase + manche droit — la construction de Maxime.
  // Une pale en POINTE + un bâton donne une flèche, pas une pelle : erreur commise ici même.
  pelle: (
    <path fillRule="evenodd" d="M8.85 7.35 5.15 10.5a1.15 1.15 0 0 0-.4.87v6.5a1.05 1.05 0 0 0 1.05 1.05h8.4a1.05 1.05 0 0 0 1.05-1.05v-6.5a1.15 1.15 0 0 0-.4-.87L11.15 7.35ZM10 11.1l2.55 4.75a5.6 5.6 0 0 1-5.1 0ZM9.4.9h1.2v6.6H9.4Z" />
  ),
  // Pétrin à spirale : cuve + crochet en spirale traversant, tenu par un bras vertical.
  // Sans la spirale ce n'est qu'un seau ; c'est elle qui nomme la machine.
  petrin: (
    <path fillRule="evenodd" d="M2.7 8.4h14.6a.85.85 0 0 1 0 1.7h-.5l-.6 6.4a2.05 2.05 0 0 1-2.05 1.9H5.85A2.05 2.05 0 0 1 3.8 16.5l-.6-6.4h-.5a.85.85 0 0 1 0-1.7Zm6.35-6.8h1.9v5.1h-1.9Zm3.1 9.6a4.9 4.9 0 0 0-2.4-.6c-1.85 0-3.2 1-3.2 2.35 0 1.05.8 1.7 2 2.05.9.25 1.25.45 1.25.75 0 .3-.4.5-1.05.5a4 4 0 0 1-1.75-.45l-.55 1.5a5.6 5.6 0 0 0 2.3.5c1.95 0 3.3-.95 3.3-2.4 0-1-.7-1.7-2-2.1-.9-.3-1.25-.45-1.25-.75 0-.25.3-.45.9-.45a3.6 3.6 0 0 1 1.6.4Z" />
  ),
  chef: (
    <path fillRule="evenodd" d="M10 1.4a4.3 4.3 0 0 0-3.5 1.8 3.9 3.9 0 0 0-1.2 7.5v1.4h9.4v-1.4a3.9 3.9 0 0 0-1.2-7.5A4.3 4.3 0 0 0 10 1.4ZM5.3 13.3h9.4v4a1.2 1.2 0 0 1-1.2 1.2H6.5a1.2 1.2 0 0 1-1.2-1.2Zm2 1.3a.55.55 0 0 0-.55.55v1.5a.55.55 0 0 0 1.1 0v-1.5A.55.55 0 0 0 7.3 14.6Zm2.7 0a.55.55 0 0 0-.55.55v1.5a.55.55 0 0 0 1.1 0v-1.5A.55.55 0 0 0 10 14.6Zm2.7 0a.55.55 0 0 0-.55.55v1.5a.55.55 0 0 0 1.1 0v-1.5a.55.55 0 0 0-.55-.55Z" />
  ),
  flame: (
    <path fillRule="evenodd" d="M11.35 1.2c.9 3.2.3 5.15-.5 6.2-.55.75-1.35 1.05-1.8.3-.4-.65-.2-1.55.05-2.7-1.7 1.85-3.3 3.5-3.3 6.7a6.2 6.2 0 0 0 12.4 0c0-4.3-3.5-7.6-6.85-10.5ZM10 9.9c1.9 2.15 2.75 3.35 2.75 4.9a2.75 2.75 0 0 1-5.5 0c0-1.55.85-2.75 2.75-4.9Z" />
  ),

  // ── Les farines ──
  wheat: (
    <path fillRule="evenodd" d="M9.4 19.1v-4.55c-1.5-.15-2.6-.75-3.35-1.6a5.1 5.1 0 0 1-1.2-2.6.5.5 0 0 1 .62-.55 5.15 5.15 0 0 1 2.6 1.35 4.4 4.4 0 0 1 1.33 2.1v-1.9c-1.5-.15-2.6-.75-3.35-1.6a5.1 5.1 0 0 1-1.2-2.6.5.5 0 0 1 .62-.55 5.15 5.15 0 0 1 2.6 1.35 4.4 4.4 0 0 1 1.33 2.1v-1.9c-1.5-.15-2.6-.75-3.35-1.6a5.1 5.1 0 0 1-1.2-2.6.5.5 0 0 1 .62-.55 5.15 5.15 0 0 1 2.6 1.35A4.4 4.4 0 0 1 9.4 6.2V4.3c0-1.5.25-2.6.6-3.4.35.8.6 1.9.6 3.4v1.9a4.4 4.4 0 0 1 1.33-2.1 5.15 5.15 0 0 1 2.6-1.35.5.5 0 0 1 .62.55 5.1 5.1 0 0 1-1.2 2.6c-.75.85-1.85 1.45-3.35 1.6v1.9a4.4 4.4 0 0 1 1.33-2.1 5.15 5.15 0 0 1 2.6-1.35.5.5 0 0 1 .62.55 5.1 5.1 0 0 1-1.2 2.6c-.75.85-1.85 1.45-3.35 1.6v1.9a4.4 4.4 0 0 1 1.33-2.1 5.15 5.15 0 0 1 2.6-1.35.5.5 0 0 1 .62.55 5.1 5.1 0 0 1-1.2 2.6c-.75.85-1.85 1.45-3.35 1.6v4.55a.6.6 0 0 1-1.2 0Z" />
  ),
  farine: (
    <path fillRule="evenodd" d="M6.5 5.5c-1.3 1.8-2.2 3.6-2.2 5.7v5.3a2 2 0 0 0 2 2h7.4a2 2 0 0 0 2-2v-5.3c0-2.1-.9-3.9-2.2-5.7ZM10 1.1c-1.75 0-3.1.9-4 2.25a7.2 7.2 0 0 0 8 0c-.9-1.35-2.25-2.25-4-2.25Zm-4.35 9.6h8.7v2.2h-8.7Z" />
  ),

  // ── Les garnitures ──
  tomato: (
    <path fillRule="evenodd" d="M10 5.2a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-2.3 3.1a.7.7 0 0 1 0 1 3.3 3.3 0 0 0-.8 1.5.7.7 0 0 1-1.3-.4 4.6 4.6 0 0 1 1.1-2.1.7.7 0 0 1 1 0ZM10 .9a.9.9 0 0 1 .9.9v1.5a5 5 0 0 1 3.4-1.4.5.5 0 0 1 .5.6 4.4 4.4 0 0 1-3 3.1 4.4 4.4 0 0 1-3.6 0 4.4 4.4 0 0 1-3-3.1.5.5 0 0 1 .5-.6 5 5 0 0 1 3.4 1.4V1.8a.9.9 0 0 1 .9-.9Z" />
  ),
  cheese: (
    <path fillRule="evenodd" d="M10 4.4a7.3 7.3 0 1 0 0 14.6 7.3 7.3 0 0 0 0-14.6Zm-2.6 3a.75.75 0 0 1 0 1.06 3.4 3.4 0 0 0-.85 1.5.75.75 0 0 1-1.4-.45 4.9 4.9 0 0 1 1.2-2.1.75.75 0 0 1 1.05 0ZM10 1.1c1.1-1 2.6-1.3 4-.9a.5.5 0 0 1 .35.62A3.9 3.9 0 0 1 10 3.5Z" />
  ),
  basil: (
    <path fillRule="evenodd" d="M9.4 18.4v-6.2a9 9 0 0 0-4.8-4 7.5 7.5 0 0 0 4 3.1.58.58 0 0 1-.28 1.12C4.4 11.4 2.8 8.3 2.3 5.3a.53.53 0 0 1 .58-.62c2.9.38 5.8 2 7.12 6 1.32-4 4.22-5.62 7.12-6a.53.53 0 0 1 .58.62c-.5 3-2.1 6.1-6.02 7.12a.58.58 0 0 1-.28-1.12 7.5 7.5 0 0 0 4-3.1 9 9 0 0 0-4.8 4v6.2a.6.6 0 0 1-1.2 0Z" />
  ),
  olive: (
    <path fillRule="evenodd" d="M9.2 5.4c-3.05 0-5.5 3.05-5.5 6.9s2.45 6.9 5.5 6.9 5.5-3.05 5.5-6.9-2.45-6.9-5.5-6.9Zm2.55 3.7a1.55 1.55 0 0 1 0 3.1 1.55 1.55 0 0 1 0-3.1ZM11 4.4c1-2.5 3.45-4 6.3-4a.5.5 0 0 1 .5.6c-.6 2.75-2.75 4.45-5.5 4.45a4.1 4.1 0 0 1-1.3-.2Z" />
  ),
  chili: (
    <path fillRule="evenodd" d="M13.4 4.3c2.6 3.3 2.4 8.5-1 11.4-2.8 2.4-6.9 2.3-9.2-.4a.6.6 0 0 1 .6-1c3.6.7 6.2-.8 7.5-3.3 1-1.9 1.1-4.2 1-6.5a.65.65 0 0 1 1.1-.2ZM13.6 3.9a2.6 2.6 0 0 1 2.6-2.6.9.9 0 0 1 0 1.8.8.8 0 0 0-.8.8Z" />
  ),
  mushroom: (
    <path fillRule="evenodd" d="M10 1.6a8.4 8.4 0 0 0-8.4 8.4.9.9 0 0 0 .9.9h15a.9.9 0 0 0 .9-.9A8.4 8.4 0 0 0 10 1.6ZM6.3 5.1a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm7 .8a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM10 8.4a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6ZM7.6 12.1h4.8v4.7a2.4 2.4 0 0 1-4.8 0Z" />
  ),
  huile: (
    <path fillRule="evenodd" d="M8.3 1h3.4a.85.85 0 0 1 .85.85v1.7a.85.85 0 0 1-.85.85v1.35l1.95 2.9a3.2 3.2 0 0 1 .55 1.8v6.4a2.1 2.1 0 0 1-2.1 2.1H7.9a2.1 2.1 0 0 1-2.1-2.1v-6.4a3.2 3.2 0 0 1 .55-1.8l1.95-2.9V4.4a.85.85 0 0 1-.85-.85V1.85A.85.85 0 0 1 8.3 1Zm-1.55 10.4h6.5v2.1h-6.5Z" />
  ),
};

export const AVATAR_IDS = Object.keys(AVATAR_ART);
