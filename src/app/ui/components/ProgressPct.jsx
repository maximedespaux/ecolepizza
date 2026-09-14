/**
 * AVANCEMENT D'UN DOSSIER : une barre courte, son pourcentage, et la couleur du score.
 *
 * ELLE REMPLACE UNE PASTILLE QUI MENTAIT. Le tableau de bord et la page session affichaient
 * `enrollment.conformite_score` — une colonne écrite « ROUGE » à l'inscription et JAMAIS
 * recalculée. Mesuré en production : les cinq dossiers de l'école étaient tous stockés à
 * « ROUGE » alors que leur avancement valait 31, 0, 19, 44 et 19 %. Ce n'était pas un
 * indicateur imprécis, c'était une constante déguisée en indicateur.
 *
 * LA COULEUR EST CONSERVÉE, pas remplacée. Un pourcentage seul oblige à lire un nombre sur
 * chaque ligne pour repérer celle qui va mal ; la teinte se voit sans lecture, et le nombre
 * dit ensuite de combien. Les deux ensemble valent mieux que l'un ou l'autre — d'où la barre
 * teintée par le score plutôt qu'une couleur unique.
 *
 * Extrait de l'écran Suivi, où il vivait en double emploi : trois écrans montrent désormais
 * la même chose, et une divergence de forme se verrait immédiatement.
 */
const TEINTE = {
  VERT: "var(--green, #16a34a)",
  ORANGE: "var(--orange, #d97706)",
  ROUGE: "var(--ember1, #c0392b)",
};

export default function ProgressPct({ percent, score, width = 90 }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  /* Sans score fourni, on le déduit du pourcentage : l'appelant n'a pas toujours les deux, et
     une barre grise n'apprendrait rien. */
  const s = score || (p >= 100 ? "VERT" : p > 0 ? "ORANGE" : "ROUGE");
  return (
    <span style={{ width, flexShrink: 0 }} title={`${p}% du parcours documentaire`}>
      <span style={{ display: "block", height: 6, borderRadius: 4, background: "var(--border-soft, #e3e3e6)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${p}%`, background: TEINTE[s] || TEINTE.ROUGE, transition: "width .3s var(--ease, ease)" }} />
      </span>
      <span style={{ display: "block", fontSize: 11, color: "var(--muted)", textAlign: "right", marginTop: 2 }}>{p}%</span>
    </span>
  );
}
