/**
 * Pastille de statut. tone : "g" | "a" | "r" | "b" | "n".
 *
 * `className` et `title` sont transmis — sans quoi ils seraient SILENCIEUSEMENT JETÉS, le
 * même défaut qu'avait `EmptyState`. Un composant qui ignore les props qu'on lui passe fait
 * perdre du temps à celui qui les passe, puis à celui qui cherche pourquoi ça ne marche pas.
 */
function Badge({ tone = "n", className = "", title, children }) {
  return <span className={`badge ${tone} ${className}`.trim()} title={title}>{children}</span>;
}

export default Badge;
