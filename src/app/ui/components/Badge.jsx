/**
 * Pastille de statut. tone : "g" | "a" | "r" | "b" | "n".
 *
 * `className`, `title` et `style` sont transmis — sans quoi ils seraient SILENCIEUSEMENT JETÉS,
 * le même défaut qu'avait `EmptyState`. Un composant qui ignore les props qu'on lui passe fait
 * perdre du temps à celui qui les passe, puis à celui qui cherche pourquoi ça ne marche pas.
 *
 * `style` a été ajouté pour les catégories de partenaires, dont la couleur est choisie par
 * l'école et ne peut donc pas vivre dans une classe : elle n'est connue qu'à l'exécution. Le
 * défaut décrit juste au-dessus s'était reproduit à l'identique — la couleur était passée, et
 * il ne se passait rien.
 */
function Badge({ tone = "n", className = "", title, style, children }) {
  return <span className={`badge ${tone} ${className}`.trim()} title={title} style={style}>{children}</span>;
}

export default Badge;
