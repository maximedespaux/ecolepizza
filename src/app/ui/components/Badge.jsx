/** Pastille de statut. tone : "g" | "a" | "r" | "b" | "n". */
function Badge({ tone = "n", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export default Badge;
