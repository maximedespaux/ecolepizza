/**
 * Carte de contenu avec en-tête et lien « voir plus » optionnel.
 *
 * `as` fixe le NIVEAU du titre. Il valait `h3` en dur, si bien que toute page enchaînait
 * `h1` puis `h3` sans jamais de `h2` : à la navigation vocale, la structure du document
 * annonçait un niveau manquant sur chaque page de l'application. `h2` par défaut — c'est le
 * niveau juste sous le titre de page, et donc le bon dans l'immense majorité des cas ; `as`
 * ne sert qu'aux cartes réellement imbriquées dans une section déjà titrée.
 */
function Card({ title, more, children, className = "", style, as: Titre = "h2" }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || more) && (
        <div className="card-head">
          {title && <Titre className="card-h">{title}</Titre>}
          {more}
        </div>
      )}
      {children}
    </div>
  );
}

export default Card;
