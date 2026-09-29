import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";
import { euro } from "../lib/format.js";
import { num, computeBuild } from "../lib/dough.js";
import { coutFiche } from "../lib/coutFiche.js";

/**
 * FICHE TECHNIQUE IMPRIMABLE — au format des fiches de l'école (les 2 PDF de référence) :
 * un tableau Ingrédient · Mesure · Prix/Kg/L/u · Poids/kg/l/u · Coût, la procédure numérotée à
 * droite, puis Total (poids + coût) et Total prix Kg (coût au kg = coût total ÷ poids total).
 *
 * D'où viennent les lignes selon le type de fiche :
 *  • PÂTE        → le calculateur (`computeBuild`) : farine, eau, sel, huile, levure… avec leur
 *                  poids et leur coût, et un déroulé de fabrication GÉNÉRÉ.
 *  • PRÉPARATION / RECETTE → les lignes de `coutFiche` (lib/coutFiche.js), les MÊMES que
 *                  l'éditeur : produits de la mercuriale, fiches importées, et la pâte estimée
 *                  d'une réalisation qui n'importe pas d'empâtement — elle manquait à la feuille,
 *                  dont le total ne tombait donc pas sur celui de l'écran. Le coût au kg d'une
 *                  garniture est celui du PRODUIT FINI quand un rendement est déclaré : la feuille
 *                  divisait par le poids des ingrédients (3,28 €/kg) quand l'écran et l'import
 *                  divisaient par le rendement (8,40 €/kg), pour la même sauce.
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
  // Une pièce ne s'ajoute PAS au poids total comme un kilo : « 1 pâton » pesait 1 kg sur la
  // feuille. Elle ne compte que si l'on connaît son poids (le pâton d'un empâtement importé).
  const cf = coutFiche(r);
  const rows = cf.lignes.map((l) => {
    const auPoids = l.unit !== "piece";
    return { label: l.label, mesure: auPoids ? "kg" : "unité", prix: num(l.unit_price),
      poids: auPoids ? num(l.qty) / 1000 : num(l.qty), piece: !auPoids, cout: l.cout };
  });
  const p = r.kind === "PREPARATION" ? cf.prep : null;
  return {
    rows, poidsTotal: cf.poids / 1000, poidsIncomplet: cf.poidsIncomplet, coutTotal: cf.total, coutKg: cf.coutKg,
    // Garniture à rendement déclaré : la ligne « Produit fini » (et sa perte), puis le prix du
    // kilo — ou de la pièce — du produit fini.
    fini: p && p.source === "rendement" ? { quantite: p.quantite, unite: p.unit, perte: cf.perte } : null,
    prixPiece: p && p.unit === "piece" && p.source === "rendement" ? p.unitPrice : null,
    steps: (r.steps || []).map((s) => String(s).trim()).filter(Boolean),
  };
}

export default function FichePrint({ fiche, onClose }) {
  const { rows, poidsTotal, poidsIncomplet, coutTotal, coutKg, fini, prixPiece, steps } = contenu(fiche);
  const titre = fiche.kind === "RECETTE" ? `Fiche technique ${fiche.name || ""}`.trim() : (fiche.name || "Fiche technique");
  // La cellule « procédure » couvre la ligne des en-têtes de colonnes + les ingrédients + les 2 totaux.
  const procSpan = rows.length + 3 + (fini ? 1 : 0);

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
                <td className="fp-r">{fr(l.poids)}{l.piece ? " u" : ""}</td>
                <td className="fp-r">{euro(l.cout)}</td>
              </tr>
            ))}
            <tr className="fp-total">
              <td colSpan={3}><b>Total</b></td>
              <td className="fp-r"><b>{fr(poidsTotal)} kg</b>{poidsIncomplet ? " (hors pièces)" : ""}</td>
              <td className="fp-r"><b>{euro(coutTotal)}</b></td>
            </tr>
            {fini && (
              <tr className="fp-total">
                <td colSpan={3}><b>Produit fini</b>{fini.perte != null && Math.abs(fini.perte) >= 0.005 ? ` (${fini.perte < 0 ? "perte" : "gain"} ${Math.abs(Math.round(fini.perte * 100))} %)` : ""}</td>
                <td colSpan={2} className="fp-r"><b>{fini.unite === "piece" ? `${fr(fini.quantite, 2)} pièces` : `${fr(fini.quantite)} kg`}</b></td>
              </tr>
            )}
            <tr className="fp-total">
              <td colSpan={3}><b>{prixPiece != null ? "Total prix pièce" : "Total prix Kg"}</b></td>
              <td colSpan={2} className="fp-r"><b>{euro(prixPiece != null ? prixPiece : coutKg)}</b> / {prixPiece != null ? "pièce" : "kg"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>,
    document.body
  );
}
