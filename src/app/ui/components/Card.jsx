/** Carte de contenu avec en-tête et lien « voir plus » optionnel. */
function Card({ title, more, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
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
