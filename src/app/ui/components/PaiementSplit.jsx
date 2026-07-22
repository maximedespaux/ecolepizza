import { Icon } from "./Icon.jsx";
import { euro } from "../lib/format.js";

/**
 * Répartition d'un règlement sur PLUSIEURS moyens de paiement.
 *
 * Le client règle « 300 € espèces + 700 € carte » : on saisit le montant des premiers moyens, et
 * le DERNIER prend automatiquement le reste. C'est la seule ligne non modifiable — elle affiche
 * le solde, pour qu'on ne puisse pas fabriquer une répartition qui ne boucle pas.
 *
 * Une seule ligne = paiement simple : on ne montre aucun montant, la ligne vaut tout le total.
 */

/** Ventile : montants saisis pour toutes les lignes sauf la dernière, qui prend le reste. */
export function resolvePayments(rows, total) {
  const n = rows.length;
  const autres = rows.slice(0, n - 1).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const reste = Math.round((total - autres) * 100) / 100;
  const parts = rows
    .map((r, i) => ({ method: r.method, amount: i < n - 1 ? (Number(r.amount) || 0) : reste }))
    .filter((p) => p.method && p.amount > 0.005);
  // Valide si le reste n'est pas négatif (pas de dépassement) et chaque ligne a un moyen.
  const valid = reste >= -0.005 && rows.every((r) => r.method);
  return { parts, reste, valid };
}

export default function PaiementSplit({ options, total, rows, onChange }) {
  const n = rows.length;
  const { reste } = resolvePayments(rows, total);
  const depassement = reste < -0.005;

  const setRow = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => {
    const libre = options.find((o) => !rows.some((r) => r.method === o)) || options[0] || "";
    onChange([...rows, { method: libre, amount: "" }]);
  };
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="field">
      <label>Paiement</label>
      {rows.map((r, i) => {
        const dernier = i === n - 1;
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <select className="inp" value={r.method} onChange={(e) => setRow(i, { method: e.target.value })} style={{ flex: 1 }}>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {n > 1 && (dernier ? (
              // Le solde, calculé et non saisissable : c'est ce qui reste à couvrir.
              <div className="inp mono" title="Solde automatique"
                style={{ width: 104, textAlign: "right", background: "var(--surface2)", color: depassement ? "var(--ember1)" : "var(--text)" }}>
                {euro(Math.max(0, reste))}
              </div>
            ) : (
              <input className="inp mono" type="number" min="0" step="0.01" value={r.amount} placeholder="0,00"
                onChange={(e) => setRow(i, { amount: e.target.value })} style={{ width: 104, textAlign: "right" }} />
            ))}
            {n > 1 && !dernier
              ? <button type="button" className="iconbtn" onClick={() => remove(i)} aria-label="Retirer ce moyen"><Icon name="x" size={13} /></button>
              : n > 1 ? <span style={{ width: 28, flex: "0 0 28px" }} /> : null}
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
        <button type="button" className="btn ghost sm" onClick={add} disabled={rows.length >= options.length}>
          <Icon name="plus" size={13} /> Ajouter un moyen
        </button>
        {n > 1 && (
          <span className="hint" style={{ color: depassement ? "var(--ember1)" : "var(--muted)" }}>
            {depassement ? `Dépassement de ${euro(-reste)}` : `Solde sur le dernier : ${euro(Math.max(0, reste))}`}
          </span>
        )}
      </div>
    </div>
  );
}
