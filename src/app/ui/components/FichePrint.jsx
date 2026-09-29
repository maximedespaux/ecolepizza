import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";
import { euro } from "../lib/format.js";
import { num, computeBuild } from "../lib/dough.js";

/**
 * FICHE TECHNIQUE IMPRIMABLE — au format des fiches de l'école (les 2 PDF de référence) :
 * un tableau Ingrédient · Mesure · Prix/Kg/L/u · Poids/kg/l/u · Coût, la procédure numérotée à
 * droite, puis Total (poids + coût) et Total prix Kg (coût au kg = coût total ÷ poids total).
 *
 * D'où viennent les lignes selon le type de fiche :
 *  • PÂTE        → le calculateur (`computeBuild`) : farine, eau, sel, huile, levure… avec leur
 *                  poids et leur coût, et un déroulé de fabrication GÉNÉRÉ.
 *  • PRÉPARATION / RECETTE → les lignes à plat (`ingredients`) : produits de la mercuriale ET
 *                  fiches importées (à leur coût au kg), avec la procédure saisie.
 *
 * Aperçu plein écran ; « Imprimer » lance l'impression du navigateur (→ PDF). Le CSS `@media print`
 * (app.css, `.fiche-print`) masque le reste de l'application et ne garde que la feuille.
 */
const jour = (v) => { const d = v ? new Date(v) : new Date(); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const fr = (n, dec = 3) => Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: dec });

// Lignes + totaux + procédure, unifiés quel que soit le type de fiche.
function contenu(r) {
  if (r.kind === "PATE") {
    const b = computeBuild(r);
    // TOUTE la composition (`dough`, eau comprise), pas seulement les lignes chiffrées : sinon les
    // lignes ne totalisent pas le poids de pâte. L'eau n'a pas de prix (l'app la compte gratuite,
    // `pk` absent → prix 0) — le coût au kg reste celui que l'import de la fiche utilisera.
    return {
      rows: b.dough.filter((l) => num(l.v) > 0).map((l) => ({
        label: l.k, mesure: "kg", prix: num(b.prices[l.pk]),
        poids: l.v / 1000, cout: (l.v / 1000) * num(b.prices[l.pk]),
      })),
      poidsTotal: b.totalDough / 1000, coutTotal: b.totalCost, coutKg: b.costPerKg,
      steps: (b.steps || []).map((s) => (s.d ? `${s.t} — ${s.d}` : s.t)),
    };
  }
  const rows = (r.ingredients || []).map((i) => {
    const auPoids = i.unit === "g";
    return { label: i.label, mesure: auPoids ? "kg" : "unité", prix: num(i.unit_price),
      poids: auPoids ? num(i.qty) / 1000 : num(i.qty), cout: auPoids ? (num(i.qty) / 1000) * num(i.unit_price) : num(i.qty) * num(i.unit_price) };
  });
  const poidsTotal = rows.reduce((s, x) => s + x.poids, 0);
  const coutTotal = rows.reduce((s, x) => s + x.cout, 0);
  return { rows, poidsTotal, coutTotal, coutKg: poidsTotal ? coutTotal / poidsTotal : 0, steps: (r.steps || []).map((s) => String(s).trim()).filter(Boolean) };
}

export default function FichePrint({ fiche, onClose }) {
  const { rows, poidsTotal, coutTotal, coutKg, steps } = contenu(fiche);
  const titre = fiche.kind === "RECETTE" ? `Fiche technique ${fiche.name || ""}`.trim() : (fiche.name || "Fiche technique");
  // La cellule « procédure » couvre la ligne des en-têtes de colonnes + les ingrédients + les 2 totaux.
  const procSpan = rows.length + 3;

  return createPortal(
    <div className="fiche-print">
      <div className="fp-bar no-print">
        <button className="btn primary sm" onClick={() => window.print()}><Icon name="printer" size={14} /> Imprimer</button>
        <button className="btn ghost sm" onClick={onClose}><Icon name="x" size={14} /> Fermer</button>
        <span className="hint" style={{ marginLeft: 8 }}>Astuce : dans la fenêtre d'impression, choisis « Enregistrer au format PDF ».</span>
      </div>
      <div className="fp-sheet">
        <table className="fp-table">
          <tbody>
            <tr>
              <th colSpan={3} className="fp-title">{titre}</th>
              <th colSpan={2} className="fp-date">Date : {jour(fiche.updated_at)}</th>
              <th className="fp-proc-h">Procéder technique</th>
            </tr>
            <tr className="fp-cols">
              <th>Ingrédient</th><th>Mesure</th><th>Prix/Kg/L/u</th><th>Poids/kg/l/u</th><th>Coût</th>
              <td className="fp-proc" rowSpan={procSpan}>
                {steps.length === 0 ? <span className="hint">—</span> : (
                  <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                )}
              </td>
            </tr>
            {rows.map((l, i) => (
              <tr key={i}>
                <td>{l.label || "—"}</td>
                <td className="fp-c">{l.mesure}</td>
                <td className="fp-r">{euro(l.prix)}</td>
                <td className="fp-r">{fr(l.poids)}</td>
                <td className="fp-r">{euro(l.cout)}</td>
              </tr>
            ))}
            <tr className="fp-total">
              <td colSpan={3}><b>Total</b></td>
              <td className="fp-r"><b>{fr(poidsTotal)} kg</b></td>
              <td className="fp-r"><b>{euro(coutTotal)}</b></td>
            </tr>
            <tr className="fp-total">
              <td colSpan={3}><b>Total prix Kg</b></td>
              <td colSpan={2} className="fp-r"><b>{euro(coutKg)}</b> / kg</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>,
    document.body
  );
}
