import { useEffect, useState } from "react";
import { getMemos, createMemo, updateMemo, deleteMemo, clearMemosFaits } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { etatEcheance, trierMemos, MAX_TEXTE } from "../lib/memos.js";
import { annoncerMemos, onMemosChange } from "../lib/events.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";

/**
 * LE MÉMO — pense-bête et liste de choses à faire du personnel (demandé le 2026-09-22).
 *
 * LA MÊME LISTE À DEUX ENDROITS : le panneau du bouton de la barre du haut, et la carte du tableau de
 * bord. Chacun se relit quand l'autre écrit (`annoncerMemos`), et suit l'équipe par le signal temps
 * réel (`useAutoRefresh`) : un mémo partagé coché par un collègue se coche ici aussi.
 *
 * CE QUE L'ÉCOLE A CHOISI :
 *   · un mémo naît PRIVÉ ; « Partager avec l'équipe » le montre à tout le personnel ;
 *   · une ÉCHÉANCE facultative : échu ou dû aujourd'hui, il se colore et se compte sur le bouton ;
 *   · COCHER, c'est faire : le mémo passe barré en bas de liste. Supprimer l'efface pour de bon.
 * Supprimer et partager ne s'offrent qu'à l'auteur ; le serveur refuserait de toute façon.
 */
export default function MemoListe({ autoFocus = false }) {
  const [memos, setMemos] = useState(undefined); // undefined : chargement · null : migration 176 absente
  const [indispo, setIndispo] = useState(null);
  const [texte, setTexte] = useState("");
  const [echeance, setEcheance] = useState("");
  const [partage, setPartage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = () => getMemos()
    .then((r) => {
      setMemos(Array.isArray(r?.data) ? trierMemos(r.data) : null);
      setIndispo(r?.message || null);
    })
    .catch((e) => { setErreur(e.message); setMemos((m) => (m === undefined ? [] : m)); });
  useEffect(() => { charger(); return onMemosChange(charger); }, []);
  useAutoRefresh(charger, { interval: 60000 });

  /* Chaque geste prévient l'autre endroit, qui se relit — et celui-ci avec, par le même signal. */
  async function agir(fn) {
    setErreur(null);
    try { await fn(); annoncerMemos(); }
    catch (e) { setErreur(e.message); }
  }

  async function ajouter(e) {
    e.preventDefault();
    if (!texte.trim() || busy) return;
    setBusy(true);
    await agir(async () => {
      await createMemo({ texte, echeance: echeance || null, partage });
      setTexte(""); setEcheance(""); setPartage(false);
    });
    setBusy(false);
  }

  if (memos === undefined) return <p className="hint memo-vide">Chargement…</p>;
  if (memos === null) return <p className="hint memo-vide">{indispo || "Les mémos ne sont pas encore disponibles."}</p>;

  const aFaire = memos.filter((m) => !m.fait_le);
  const faits = memos.filter((m) => m.fait_le);
  const mesFaits = faits.filter((m) => m.mien).length;

  function effacerFaits() {
    const n = mesFaits;
    if (!window.confirm(n > 1 ? `Effacer vos ${n} mémos faits ?` : "Effacer votre mémo fait ?")) return;
    agir(() => clearMemosFaits());
  }

  return (
    <div className="memo">
      <form className="memo-form" onSubmit={ajouter}>
        <input className="inp" value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={MAX_TEXTE}
          placeholder="Nouveau mémo, par exemple rappeler le fournisseur" aria-label="Nouveau mémo" autoFocus={autoFocus} />
        <div className="memo-form-options">
          <label className="memo-date" title="Échéance (facultatif)">
            <Icon name="calendar" size={14} aria-hidden="true" />
            <input type="date" className="inp" value={echeance} onChange={(e) => setEcheance(e.target.value)} aria-label="Échéance (facultatif)" />
          </label>
          <label className="memo-partage">
            <input type="checkbox" checked={partage} onChange={(e) => setPartage(e.target.checked)} />
            Partager avec l'équipe
          </label>
          <button type="submit" className="btn primary sm" disabled={busy || !texte.trim()}>
            <Icon name="plus" size={14} aria-hidden="true" /> Ajouter
          </button>
        </div>
      </form>

      {erreur && <p className="memo-erreur" role="alert">{erreur}</p>}

      {aFaire.length ? (
        <ul className="memo-liste">{aFaire.map((m) => <LigneMemo key={m.id} m={m} agir={agir} />)}</ul>
      ) : (
        <p className="hint memo-vide">{faits.length ? "Tout est fait." : "Rien à faire pour l'instant."}</p>
      )}

      {faits.length > 0 && (
        <div className="memo-faits">
          <div className="memo-faits-tete">
            <span>Faits ({faits.length})</span>
            {mesFaits > 0 && <button type="button" className="btn ghost sm" onClick={effacerFaits}>Effacer les mémos faits</button>}
          </div>
          <ul className="memo-liste">{faits.map((m) => <LigneMemo key={m.id} m={m} agir={agir} />)}</ul>
        </div>
      )}
    </div>
  );
}

function LigneMemo({ m, agir }) {
  const etat = m.fait_le ? null : etatEcheance(m.echeance);
  const du = etat && (etat.ton === "retard" || etat.ton === "jour");
  return (
    <li className={"memo-ligne" + (m.fait_le ? " fait" : "") + (du ? " du" : "")}>
      <input type="checkbox" checked={!!m.fait_le} onChange={() => agir(() => updateMemo(m.id, { fait: !m.fait_le }))}
        aria-label={m.fait_le ? `Remettre à faire : ${m.texte}` : `Marquer comme fait : ${m.texte}`} />
      <div className="memo-corps">
        <span className="memo-texte">{m.texte}</span>
        {(etat || m.partage) && (
          <span className="memo-meta">
            {etat && <span className={`memo-echeance ton-${etat.ton}`}><Icon name="calendar" size={12} aria-hidden="true" /> {etat.libelle}</span>}
            {m.partage && (
              <span className="memo-equipe">
                <Icon name="users" size={12} aria-hidden="true" />
                {m.mien ? " Partagé avec l'équipe" : ` De ${m.auteur || "l'équipe"}`}
                {m.fait_le && m.fait_par ? `, fait par ${m.fait_par}` : ""}
              </span>
            )}
          </span>
        )}
      </div>
      {m.mien && (
        <span className="memo-actions">
          <button type="button" className={"memo-action" + (m.partage ? " on" : "")} aria-pressed={m.partage}
            onClick={() => agir(() => updateMemo(m.id, { partage: !m.partage }))}
            title={m.partage ? "Ne plus partager" : "Partager avec l'équipe"}
            aria-label={m.partage ? `Ne plus partager : ${m.texte}` : `Partager avec l'équipe : ${m.texte}`}>
            <Icon name="users" size={15} />
          </button>
          <button type="button" className="memo-action danger" onClick={() => agir(() => deleteMemo(m.id))}
            title="Supprimer" aria-label={`Supprimer : ${m.texte}`}>
            <Icon name="trash" size={15} />
          </button>
        </span>
      )}
    </li>
  );
}
