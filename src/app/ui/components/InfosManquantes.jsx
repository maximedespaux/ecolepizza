/**
 * Liste des informations à compléter avant qu'un document puisse être émis.
 *
 * POURQUOI PARTAGÉ. Le serveur refuse en 422 avec un tableau `missing` — même forme pour un
 * document (`document.controller`) et pour une facture (`invoice.controller`). L'écran des
 * documents savait déjà l'afficher ; l'écran Facturation, lui, ne gardait que `err.message` et
 * jetait la liste. On se retrouvait avec « Facture non générée : 2 information(s) à compléter »
 * sans jamais dire LESQUELLES — un message qui annonce un problème et cache sa solution.
 *
 * Regroupé par origine (`group`) : savoir qu'il manque un e-mail ne sert à rien si l'on ignore
 * de quelle fiche il s'agit — celle de l'organisme, celle du client, ou celle du dossier.
 */
function InfosManquantes({ missing, titre = "Document non généré", children }) {
  if (!missing || !missing.length) return null;
  const groupes = {};
  for (const m of missing) (groupes[m.group || "Autres"] ||= []).push(m.label);
  return (
    <div>
      <div className="status err" style={{ marginBottom: 12 }}>
        <b>{titre} :</b> {missing.length} information(s) manquante(s). Complétez la fiche puis réessayez.
      </div>
      <div className="doc-sheet" style={{ padding: 16 }}>
        {Object.entries(groupes).map(([g, labels]) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ember1)", marginBottom: 4 }}>{g}</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {labels.map((l) => <li key={l} style={{ fontSize: 13 }}>{l}</li>)}
            </ul>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}

export default InfosManquantes;
