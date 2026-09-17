import { Icon } from "./Icon.jsx";

/**
 * UNE QUESTION EN GRILLE, CORRIGÉE — sa ligne, la colonne cochée, la bonne colonne, ✓ ou ✗.
 *
 * DEUX ÉCRANS LA DESSINENT, d'où ce composant : la CORRECTION que lit le stagiaire après son QCM, et
 * la PREUVE que l'école ouvre pour une réponse donnée. Écrits chacun de leur côté, ils auraient fini
 * par ne pas marquer la même chose — et l'école lirait « juste » là où le stagiaire a lu « faux ».
 *
 * POURQUOI ELLE EXISTE. La correction traitait une grille comme une question à choix et en listait
 * les « options » — c'est-à-dire ses COLONNES. Sur la question des allergènes (RS7404, S38), un
 * stagiaire qui avait répondu juste aux quatorze lignes lisait deux puces, « Non » et « Oui », ni
 * cochées ni bonnes. Les allergènes eux-mêmes n'apparaissaient nulle part.
 *
 * LECTURE : ● = la colonne cochée ; vert = la bonne réponse ; rouge = une coche là où ce n'était pas la
 * bonne. En bout de ligne, ✓ ou ✗ — rien pour une ligne que l'école n'a pas corrigée.
 *
 * @param {{ colonnes: string[], lignes: Array<{ texte: string, choisies: number[], bonnes: number[],
 *           juste: boolean|null }> }} props  colonnes et choix par POSITION de colonne.
 */
export default function GrilleCorrigee({ colonnes, lignes }) {
  const cell = { padding: "5px 8px", borderBottom: "1px solid var(--border-soft)", fontSize: 13, textAlign: "center" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: "left" }}></th>
            {colonnes.map((c, ci) => <th key={ci} style={{ ...cell, color: "var(--muted)", fontWeight: 600 }}>{c}</th>)}
            <th style={cell}></th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, li) => (
            <tr key={li}>
              <td style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{l.texte}</td>
              {colonnes.map((_, ci) => {
                const bonne = l.bonnes.includes(ci);
                const cochee = l.choisies.includes(ci);
                const lu = [bonne && "bonne réponse", cochee && "réponse donnée"].filter(Boolean).join(", ");
                return (
                  <td key={ci} style={{ ...cell,
                    background: bonne ? "rgba(22,163,74,.13)" : cochee ? "rgba(192,57,43,.12)" : undefined,
                    color: bonne ? "#16a34a" : cochee ? "#c0392b" : "var(--dim)" }}
                    aria-label={lu || undefined}>
                    {cochee ? "●" : bonne ? <Icon name="check" size={13} /> : ""}
                  </td>
                );
              })}
              <td style={{ ...cell, color: l.juste ? "#16a34a" : l.juste === false ? "#c0392b" : "var(--dim)" }}
                aria-label={l.juste === true ? "juste" : l.juste === false ? "faux" : undefined}>
                {l.juste === true ? <Icon name="check" size={15} /> : l.juste === false ? <Icon name="x" size={15} /> : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ margin: "6px 0 0", fontSize: 11.5 }}>
        ● réponse donnée · <span style={{ color: "#16a34a" }}>vert</span> la bonne réponse · <span style={{ color: "#c0392b" }}>rouge</span> une réponse erronée
      </p>
    </div>
  );
}
