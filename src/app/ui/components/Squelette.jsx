/**
 * Squelettes de chargement — la forme de ce qui arrive, avant que ça arrive.
 *
 * Trente et une pages initialisent leurs listes à `[]`. Conséquence : entre l'affichage et la
 * réponse du serveur, elles montrent leur ÉTAT VIDE — « Aucun stagiaire », « Aucune facture ».
 * L'information est fausse pendant une demi-seconde, et c'est la pire des demi-secondes :
 * celle où l'on décide si la page a fini de charger. Deux pages font pire encore et
 * n'affichent rien du tout (`StagiaireDetail`, `SessionDetail`).
 *
 * La convention, celle que `DemandesBoutique` applique déjà : `null` = on charge, `[]` = c'est
 * vide. Un squelette pour le premier, `<EmptyState>` pour le second.
 *
 * Pourquoi un squelette plutôt qu'un « Chargement… » : il RÉSERVE LA PLACE. Le texte fait
 * sauter la page au moment où les données arrivent, et ce saut est ce qui fait cliquer à côté.
 * Registre sobre : un dégradé qui balaie, pas de rebond — on est dans l'administration.
 */

/** `lignes` blocs de hauteur `h`, à la largeur de leur conteneur. */
export function Squelette({ lignes = 3, h = 44, gap = 8, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }} aria-hidden="true">
      {Array.from({ length: lignes }, (_, i) => (
        // Largeur dégressive sur la dernière : une pile de barres parfaitement égales se lit
        // comme un tableau chargé, pas comme un chargement.
        <span key={i} className="skel" style={{ height: h, width: i === lignes - 1 ? "72%" : "100%" }} />
      ))}
    </div>
  );
}

/**
 * Squelette de tableau : garde l'en-tête (il est déjà connu, il n'a pas à clignoter) et ne
 * remplace que les lignes.
 */
export function SqueletteTable({ colonnes = 4, lignes = 5 }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: lignes }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: colonnes }, (_, c) => (
            <td key={c}><span className="skel" style={{ height: 14, width: c === 0 ? "70%" : "45%", display: "block" }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Le rendu d'une liste dans ses trois états, en un seul endroit.
 *
 * `data` : `null` = chargement · `[]` = vide · sinon le contenu.
 * `erreur` prime sur tout : une liste vide APRÈS un échec n'est pas une liste vide, et le dire
 * « aucun résultat » ferait croire à une réponse alors qu'il n'y en a pas eu.
 */
export function ListeEtat({ data, erreur, vide, children, lignes = 4, h = 52 }) {
  if (erreur) return <div className="status err">{erreur}</div>;
  if (data == null) return <Squelette lignes={lignes} h={h} />;
  if (data.length === 0) return vide;
  return children;
}

export default Squelette;
