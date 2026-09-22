import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getMemos, createMemo, updateMemo, deleteMemo, clearMemosFaits, chercherCiblesMemo } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { etatEcheance, trierMemos, mentionEnCours, insererMention, TYPES_LIEN, MAX_TEXTE } from "../lib/memos.js";
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
 *   · COCHER, c'est faire : le mémo passe barré en bas de liste. Supprimer l'efface pour de bon ;
 *   · @ DÉSIGNE QUI (stagiaire, entreprise, collègue) et # DÉSIGNE QUOI (session, partenaire,
 *     facture). On tape, on choisit, et le mémo garde un lien cliquable. Mentionner un COLLÈGUE lui
 *     montre le mémo et allume une pastille sur son bouton : c'est le seul lien qui prévient
 *     quelqu'un (migration 177).
 *
 * LE TEXTE RESTE CE QU'ON A TAPÉ. Les liens vivent à côté, en puces sous la phrase — retoucher la
 * phrase après coup ne casse donc aucun lien, et rien n'oblige à relire des marqueurs dans la prose.
 */
export default function MemoListe({ autoFocus = false, onNaviguer }) {
  const [memos, setMemos] = useState(undefined); // undefined : chargement · null : migration 176 absente
  const [indispo, setIndispo] = useState(null);
  const [texte, setTexte] = useState("");
  const [liens, setLiens] = useState([]);
  const [echeance, setEcheance] = useState("");
  const [partage, setPartage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [mention, setMention] = useState(null);
  const [suggestions, setSuggestions] = useState(null);  // null : fermé
  const [actif, setActif] = useState(0);
  const champRef = useRef(null);
  const minuteur = useRef(null);

  const charger = () => getMemos()
    .then((r) => {
      setMemos(Array.isArray(r?.data) ? trierMemos(r.data) : null);
      setIndispo(r?.message || null);
    })
    .catch((e) => { setErreur(e.message); setMemos((m) => (m === undefined ? [] : m)); });
  useEffect(() => { charger(); return onMemosChange(charger); }, []);
  useAutoRefresh(charger, { interval: 60000 });
  useEffect(() => () => clearTimeout(minuteur.current), []);

  /* Chaque geste prévient l'autre endroit, qui se relit — et celui-ci avec, par le même signal. */
  async function agir(fn) {
    setErreur(null);
    try { await fn(); annoncerMemos(); }
    catch (e) { setErreur(e.message); }
  }

  /* LA RECHERCHE ATTEND 180 ms : une lettre tapée ne doit pas valoir une requête, et la liste ne
     doit pas sauter sous les doigts. */
  function chercher(m) {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      chercherCiblesMemo(m.requete, m.genre)
        .then((r) => { setSuggestions(r?.data || []); setActif(0); })
        .catch(() => setSuggestions([]));
    }, 180);
  }

  function surSaisie(e) {
    const v = e.target.value;
    setTexte(v);
    const m = mentionEnCours(v, e.target.selectionStart);
    setMention(m);
    if (!m) { setSuggestions(null); clearTimeout(minuteur.current); return; }
    chercher(m);
  }

  function choisir(c) {
    if (!mention) return;
    const { texte: t, curseur } = insererMention(texte, mention, c.libelle);
    setTexte(t);
    setLiens((l) => (l.some((x) => x.type === c.type && x.id === c.id) ? l : [...l, c]));
    setSuggestions(null); setMention(null);
    /* Le curseur se replace APRÈS le nom posé : on continue la phrase là où on l'avait laissée. */
    requestAnimationFrame(() => {
      const el = champRef.current;
      if (el) { el.focus(); el.setSelectionRange(curseur, curseur); }
    });
  }

  /* Tant que la liste est ouverte, les flèches et Entrée lui appartiennent : Entrée choisit, elle
     n'envoie pas le mémo à moitié écrit. */
  function surTouche(e) {
    if (!suggestions || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter") { e.preventDefault(); choisir(suggestions[actif]); }
    else if (e.key === "Escape") { e.preventDefault(); setSuggestions(null); }
  }

  async function ajouter(e) {
    e.preventDefault();
    if (!texte.trim() || busy) return;
    setBusy(true);
    await agir(async () => {
      await createMemo({ texte, echeance: echeance || null, partage, liens });
      setTexte(""); setEcheance(""); setPartage(false); setLiens([]); setSuggestions(null); setMention(null);
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
        <div className="memo-champ">
          <input ref={champRef} className="inp" value={texte} onChange={surSaisie} onKeyDown={surTouche} maxLength={MAX_TEXTE}
            placeholder="Nouveau mémo. @ pour un stagiaire, # pour une session" aria-label="Nouveau mémo" autoFocus={autoFocus}
            autoComplete="off" role="combobox" aria-expanded={!!(suggestions && suggestions.length)} aria-controls="memo-suggestions" />
          {suggestions && (
            <ul className="memo-suggestions" id="memo-suggestions" role="listbox">
              {suggestions.length === 0 ? (
                <li className="memo-suggestion-vide">Rien à ce nom.</li>
              ) : suggestions.map((c, i) => (
                <li key={`${c.type}-${c.id}`} role="option" aria-selected={i === actif}>
                  <button type="button" className={"memo-suggestion" + (i === actif ? " actif" : "")}
                    onMouseEnter={() => setActif(i)} onClick={() => choisir(c)}>
                    <Icon name={TYPES_LIEN[c.type]?.icone || "link"} size={14} aria-hidden="true" />
                    <b>{c.libelle}</b>
                    <span className="hint">{TYPES_LIEN[c.type]?.mot}{c.detail ? ` · ${c.detail}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {liens.length > 0 && (
          <div className="memo-liens-choisis">
            {liens.map((l) => (
              <span key={`${l.type}-${l.id}`} className="memo-lien">
                <Icon name={TYPES_LIEN[l.type]?.icone || "link"} size={12} aria-hidden="true" />
                {l.libelle}
                <button type="button" onClick={() => setLiens((v) => v.filter((x) => !(x.type === l.type && x.id === l.id)))}
                  aria-label={`Retirer le lien ${l.libelle}`}>×</button>
              </span>
            ))}
          </div>
        )}

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
        <ul className="memo-liste">{aFaire.map((m) => <LigneMemo key={m.id} m={m} agir={agir} onNaviguer={onNaviguer} />)}</ul>
      ) : (
        <p className="hint memo-vide">{faits.length ? "Tout est fait." : "Rien à faire pour l'instant."}</p>
      )}

      {faits.length > 0 && (
        <div className="memo-faits">
          <div className="memo-faits-tete">
            <span>Faits ({faits.length})</span>
            {mesFaits > 0 && <button type="button" className="btn ghost sm" onClick={effacerFaits}>Effacer les mémos faits</button>}
          </div>
          <ul className="memo-liste">{faits.map((m) => <LigneMemo key={m.id} m={m} agir={agir} onNaviguer={onNaviguer} />)}</ul>
        </div>
      )}
    </div>
  );
}

function LigneMemo({ m, agir, onNaviguer }) {
  const etat = m.fait_le ? null : etatEcheance(m.echeance);
  const du = etat && (etat.ton === "retard" || etat.ton === "jour");
  return (
    <li className={"memo-ligne" + (m.fait_le ? " fait" : "") + (du ? " du" : "") + (m.nouveau ? " neuf" : "")}>
      <input type="checkbox" checked={!!m.fait_le} onChange={() => agir(() => updateMemo(m.id, { fait: !m.fait_le }))}
        aria-label={m.fait_le ? `Remettre à faire : ${m.texte}` : `Marquer comme fait : ${m.texte}`} />
      <div className="memo-corps">
        <span className="memo-texte">{m.texte}</span>
        {(m.liens || []).length > 0 && (
          <span className="memo-liens">
            {m.liens.map((l) => {
              const t = TYPES_LIEN[l.type] || {};
              const contenu = <><Icon name={t.icone || "link"} size={12} aria-hidden="true" />{l.libelle}</>;
              /* Un MEMBRE n'est pas une fiche à ouvrir : l'annuaire de l'équipe est réservé au
                 responsable, et le mémo ne doit pas promettre une page interdite. */
              return t.lien
                ? <Link key={`${l.type}-${l.id}`} to={t.lien(l.id)} className="memo-lien" onClick={onNaviguer} title={t.mot}>{contenu}</Link>
                : <span key={`${l.type}-${l.id}`} className="memo-lien" title={t.mot}>{contenu}</span>;
            })}
          </span>
        )}
        <span className="memo-meta">
          {m.nouveau && <span className="memo-neuf">Nouveau pour vous</span>}
          {etat && <span className={`memo-echeance ton-${etat.ton}`}><Icon name="calendar" size={12} aria-hidden="true" /> {etat.libelle}</span>}
          {!m.mien && <span className="memo-equipe"><Icon name="users" size={12} aria-hidden="true" /> De {m.auteur || "l'équipe"}</span>}
          {m.mien && m.partage && <span className="memo-equipe"><Icon name="users" size={12} aria-hidden="true" /> Partagé avec l'équipe</span>}
          {m.fait_le && m.fait_par && <span className="memo-equipe">Fait par {m.fait_par}</span>}
        </span>
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
