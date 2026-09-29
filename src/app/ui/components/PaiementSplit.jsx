import { Icon } from "./Icon.jsx";
import { euro } from "../lib/format.js";
import { lireMontant } from "../lib/montantSaisi.js";

/**
 * Répartition d'un règlement sur PLUSIEURS moyens de paiement.
 *
 * Le client règle « 300 € espèces + 700 € carte » : on saisit le montant des premiers moyens, et
 * le DERNIER prend automatiquement le reste. C'est la seule ligne non modifiable — elle affiche
 * le solde, pour qu'on ne puisse pas fabriquer une répartition qui ne boucle pas.
 *
 * Une seule ligne = paiement simple : on ne montre aucun montant, la ligne vaut tout le total.
 */

/** Un moyen est-il un chèque ? On demande alors la banque et le numéro. */
export const estCheque = (m) => /ch[eè]que/i.test(String(m || ""));

/** Un montant de ligne TAPÉ (« 300,50 ») : vide → 0 ; illisible → NaN (cf. lib/montantSaisi.js). */
const montantDe = (r) => (r.amount === "" || r.amount == null ? 0 : lireMontant(r.amount));
/** … et ce qu'il pèse dans le calcul : rien s'il est illisible — `illisible` le signale à part. */
const poidsDe = (r) => (Number.isFinite(montantDe(r)) ? montantDe(r) : 0);

/** Ventile : montants saisis pour toutes les lignes sauf la dernière, qui prend le reste.
 *
 *  UN MONTANT ILLISIBLE REND LA RÉPARTITION INVALIDE, et `illisible` dit lequel. `Number("300,50")`
 *  valait NaN, donc 0 : la part disparaissait, et tout le règlement retombait sur le dernier moyen,
 *  sans un mot — 1000 € « en carte » pour un client qui en avait donné 300,50 en espèces. */
export function resolvePayments(rows, total) {
  const n = rows.length;
  const saisies = rows.slice(0, n - 1);
  const fautive = saisies.find((r) => !Number.isFinite(montantDe(r)));
  const illisible = fautive ? `Montant illisible pour « ${fautive.method} » : écrivez-le par exemple 300,50.` : null;
  const autres = saisies.reduce((s, r) => s + poidsDe(r), 0);
  const reste = Math.round((total - autres) * 100) / 100;
  const parts = rows
    .map((r, i) => {
      const part = { method: r.method, amount: i < n - 1 ? poidsDe(r) : reste };
      // Les infos du chèque ne partent que si elles sont renseignées, et pour un chèque.
      if (estCheque(r.method)) {
        if (String(r.bank || "").trim()) part.bank = String(r.bank).trim();
        if (String(r.cheque_number || "").trim()) part.cheque_number = String(r.cheque_number).trim();
      }
      return part;
    })
    .filter((p) => p.method && p.amount > 0.005);
  // Valide si le reste n'est pas négatif (pas de dépassement), chaque ligne a un moyen, et chaque
  // montant se lit. `motif` dit POURQUOI elle ne l'est pas, pour que l'écran ne devine pas.
  const valid = reste >= -0.005 && rows.every((r) => r.method) && !illisible;
  const motif = illisible || (reste < -0.005 ? "La répartition du règlement dépasse le total à régler." : null);
  return { parts, reste, valid, illisible, motif };
}

export default function PaiementSplit({ options, total, rows, onChange }) {
  const n = rows.length;
  const { reste, illisible } = resolvePayments(rows, total);
  const depassement = reste < -0.005;

  const setRow = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // On autorise le même moyen deux fois (deux chèques, par exemple), donc pas d'unicité imposée.
  const add = () => onChange([...rows, { method: options[0] || "", amount: "" }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="field">
      <label>Paiement</label>
      {rows.map((r, i) => {
        const dernier = i === n - 1;
        return (
          <div key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                /* TEXTE en `inputMode="decimal"`, plus `type="number"` : un champ numérique ne rend
                   jamais ce qu'on a tapé — il lit la virgule selon la langue de l'APPAREIL, et là où
                   elle n'est pas le séparateur décimal, « 300,50 » y devient une valeur VIDE, donc
                   0 €, sans un mot. En texte, lireMontant la lit partout, et l'illisible se dit. */
                <input className="inp mono" inputMode="decimal" autoComplete="off" value={r.amount} placeholder="0,00"
                  aria-label={`Montant réglé en ${r.method || "ce moyen"}`}
                  aria-invalid={!Number.isFinite(montantDe(r)) || undefined}
                  onChange={(e) => setRow(i, { amount: e.target.value })}
                  style={{ width: 104, textAlign: "right", ...(Number.isFinite(montantDe(r)) ? null : { borderColor: "var(--ember1)" }) }} />
              ))}
              {n > 1 && !dernier
                ? <button type="button" className="iconbtn" onClick={() => remove(i)} aria-label="Retirer ce moyen"><Icon name="x" size={13} /></button>
                : n > 1 ? <span style={{ width: 28, flex: "0 0 28px" }} /> : null}
            </div>
            {/* Chèque : la banque et le numéro, pour le rapprochement et le suivi de l'encaissement. */}
            {estCheque(r.method) && (
              <div style={{ display: "flex", gap: 8, margin: "5px 0 2px 12px" }}>
                <input className="inp" value={r.bank || ""} placeholder="Banque du chèque"
                  onChange={(e) => setRow(i, { bank: e.target.value })} style={{ flex: 1 }} />
                <input className="inp mono" value={r.cheque_number || ""} placeholder="N° de chèque"
                  onChange={(e) => setRow(i, { cheque_number: e.target.value })} style={{ width: 150 }} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
        <button type="button" className="btn ghost sm" onClick={add} disabled={rows.length >= 8}>
          <Icon name="plus" size={13} /> Ajouter un moyen
        </button>
        {n > 1 && (
          <span className="hint" role={illisible ? "alert" : undefined}
            style={{ color: illisible || depassement ? "var(--ember1)" : "var(--muted)" }}>
            {illisible || (depassement ? `Dépassement de ${euro(-reste)}` : `Solde sur le dernier : ${euro(Math.max(0, reste))}`)}
          </span>
        )}
      </div>
    </div>
  );
}
