import { Squelette } from "./Squelette.jsx";

/**
 * Le tableau de l'espace d'administration — un seul, pour les trente pages qui en ont un.
 *
 * CE QU'IL RÈGLE, et qu'aucune page ne réglait seule :
 *
 * · SOUS 700 px, LE TABLEAU DEVIENT DES CARTES. C'est la raison d'être du composant. Un
 *   tableau à six colonnes sur un téléphone ne se lit pas : il défile latéralement, on perd
 *   l'en-tête, et on compare des cellules qu'on ne voit jamais ensemble. En cartes, chaque
 *   ligne redevient un bloc où l'intitulé accompagne sa valeur.
 *
 * · La bascule est faite par une REQUÊTE DE CONTENEUR et non par la largeur de la fenêtre :
 *   le même tableau peut vivre pleine page ou dans une colonne étroite à côté d'un panneau.
 *   C'est sa place réelle qui décide, pas la taille de l'écran.
 *
 * · Les trois états (chargement, vide, contenu) sont ici plutôt que recopiés trente fois.
 *   `rows === null` = on charge · `[]` = c'est vide · sinon le contenu.
 *
 * LES COLONNES portent trois marqueurs qui ne servent QU'EN MODE CARTE :
 *   `principal` — la colonne qui identifie la ligne. Elle devient le titre de la carte et
 *      perd son intitulé : « Nom : Dupont » en tête d'une carte n'apprend rien.
 *   `actions`   — la colonne des boutons. Elle passe en pied de carte, séparée du contenu.
 *   `sansCarte` — la colonne DISPARAÎT en mode carte. Pour ce qui n'a de sens qu'en tableau :
 *      un chevron « ouvrir » n'apprend rien au pied d'une carte que l'on ouvre en entier, il
 *      ressemble juste à un bouton qui ferait autre chose.
 * En mode tableau ces marqueurs ne changent rien : les colonnes restent dans leur ordre.
 */
export default function DataTable({
  rows, cols, vide, rowKey = (r, i) => r.id ?? i, rowProps,
  detail, pied, className = "", lignesSquelette = 5,
}) {
  if (rows == null) {
    return (
      <div className="dt-wrap">
        <div className="tablewrap" style={{ border: "none" }}>
          <table className="dt">
            <thead><tr>{cols.map((c) => <th key={c.k} style={c.th}>{c.t}</th>)}</tr></thead>
          </table>
          <Squelette lignes={lignesSquelette} h={38} gap={6} style={{ padding: "10px 14px" }} />
        </div>
      </div>
    );
  }
  if (rows.length === 0) return vide ?? null;

  return (
    <div className="dt-wrap">
      <div className="tablewrap" style={{ border: "none" }}>
        <table className={`dt ${className}`}>
          <thead>
            <tr>{cols.map((c) => <th key={c.k} style={c.th}>{c.t}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const extra = rowProps ? rowProps(r, i) : null;
              return (
                <tr key={rowKey(r, i)} {...extra}>
                  {cols.map((c) => {
                    const v = c.cell ? c.cell(r, i) : r[c.k];
                    /* Une cellule VIDE garde sa place en tableau — sans elle les colonnes se
                       décaleraient — mais disparaît en carte : « VILLE — » sur trois lignes
                       n'apprend rien qu'on ne sache déjà, et allonge la carte d'autant. Il
                       suffit donc qu'une colonne renvoie `null` pour que sa ligne s'efface. */
                    const vide = v === null || v === undefined || v === "";
                    return (
                      // `data-intitule` porte l'en-tête jusqu'à la cellule : c'est lui que la
                      // CSS affiche en mode carte, là où le `<thead>` a disparu. Sans lui, une
                      // carte serait une pile de valeurs sans savoir de quoi elles parlent.
                      <td key={c.k} data-intitule={c.t || undefined}
                        className={[c.principal && "dt-principal", c.actions && "dt-actions",
                                    c.sansCarte && "dt-sans-carte", vide && "dt-vide"].filter(Boolean).join(" ") || undefined}
                        style={c.td}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            }).flatMap((tr, i) => {
              /* LIGNE DÉPLIÉE. `detail` renvoie le contenu à montrer sous la ligne, ou `null`
                 quand elle est repliée — c'est la PAGE qui tient cet état, pas le tableau :
                 elle seule sait ce qu'ouvrir et sur quel critère.
                 Une `<tr>` sœur plutôt qu'une cellule dans la ligne : une cellule ne peut pas
                 contenir une rangée, et un `<tbody>` imbriqué casserait l'alignement des
                 colonnes. En mode carte, la CSS la recolle sous sa carte pour qu'elles se
                 lisent comme un seul bloc. */
              const d = detail ? detail(rows[i], i) : null;
              if (!d) return [tr];
              return [tr, (
                <tr key={`${rowKey(rows[i], i)}-detail`} className="dt-detail">
                  <td colSpan={cols.length}>{d}</td>
                </tr>
              )];
            })}
          </tbody>
          {/* Ligne de TOTAUX. Dans un `<tfoot>` et non dans le corps : c'est ce qui la fait
              annoncer comme un pied de tableau, et c'est aussi ce qui l'empêche d'être
              emportée par un tri à venir. `pied` reçoit les mêmes colonnes que le corps —
              en mode carte, elle devient une carte à part, détachée de la liste. */}
          {pied && (
            <tfoot>
              <tr className="dt-total">
                {cols.map((c) => (
                  <td key={c.k} data-intitule={c.t || undefined}
                    className={c.actions ? "dt-actions" : undefined} style={c.td}>
                    {pied[c.k]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
