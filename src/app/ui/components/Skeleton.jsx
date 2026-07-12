/**
 * Bloc de chargement animé (shimmer). Utiliser en attendant les données.
 * <Skeleton w="60%" h={14} /> ; `round` pour un cercle (avatar, pastille).
 */
export function Skeleton({ w = "100%", h = 14, r, round = false, className = "", style }) {
  return (
    <span
      className={`skeleton ${round ? "sk-round" : ""} ${className}`.trim()}
      style={{ display: "block", width: w, height: h, borderRadius: round ? "50%" : r, ...style }}
      aria-hidden="true"
    />
  );
}

export default Skeleton;
