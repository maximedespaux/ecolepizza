/** Carte de contenu avec en-tête et lien « voir plus » optionnel. */
function Card({ title, more, children, className = "", style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || more) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {more}
        </div>
      )}
      {children}
    </div>
  );
}

export default Card;
