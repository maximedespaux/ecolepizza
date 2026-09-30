import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { getMemos, createMemo, updateMemo, deleteMemo, clearMemosFaits, chercherCiblesMemo, memoFichierUrl } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import { Icon } from "./Icon.jsx";
import {
  etatEcheance, trierMemos, mentionEnCours, insererMention, blocsMemo, continuerPuce, resumeMemo, TYPES_LIEN, MAX_TEXTE,
  MAX_FICHIERS, genreFichier, refusDeFichier, poidsLisible, fichiersColles,
} from "../lib/memos.js";
import { lireBrouillon, abonnerBrouillon, ecrireBrouillon, viderBrouillon, brouillonVide } from "../lib/brouillonMemo.js";
import { reduireSiImage, PROFILS } from "../lib/image.js";
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
 *
 * PLUSIEURS LIGNES, ET DES PUCES (demandé le 2026-09-22). Entrée AJOUTE le mémo, Maj + Entrée va à
 * la ligne — l'inverse serait piégeux dans une liste où l'on ajoute vingt fois pour une fois qu'on
 * rédige. Une ligne qui commence par « * » ou « - » est une puce, et Maj + Entrée la continue toute
 * seule ; une puce laissée vide ferme la liste. Rien d'autre n'est interprété : ni gras, ni titre.
 *
 * CE QU'ON ÉCRIT NE SE PERD PLUS (2026-09-30). Le mémo en cours vivait dans ce composant : fermer le
 * panneau — la croix, Échap, un clic à côté — le jetait, et l'on rouvrait un champ vide. Le texte,
 * les liens, l'échéance, le partage et les pièces jointes vivent désormais HORS de l'écran
 * (lib/brouillonMemo.js), jusqu'à l'envoi ou jusqu'à « Effacer » : le panneau et la carte du
 * tableau de bord lisent le même brouillon, et il tient aussi au rechargement de la page.
 *
 * DEUX PIÈCES JOINTES AU PLUS (migration 193) : une image collée dans le champ (Ctrl + V sur une
 * capture d'écran), une image ou un PDF choisis par le trombone. L'image est réduite AVANT de
 * partir ; le serveur revérifie le type et le poids dans les octets.
 */
export default function MemoListe({ autoFocus = false, onNaviguer }) {
  const { user } = useContext(UserContext);
  const uid = user?.id || null;
  const [memos, setMemos] = useState(undefined); // undefined : chargement · null : migration 176 absente
  const [indispo, setIndispo] = useState(null);
  // Les pièces jointes n'existent qu'avec la migration 193 : sans elle, pas de trombone.
  const [pieces, setPieces] = useState(false);
  /* LE BROUILLON, hors du composant : il survit à sa fermeture. Les quatre « set » gardent la forme
     qu'avaient les états qu'ils remplacent, pour que le reste de l'écran n'ait pas à le savoir. */
  const brouillon = useSyncExternalStore(abonnerBrouillon, () => lireBrouillon(uid));
  const { texte, liens, echeance, partage, fichiers } = brouillon;
  const setTexte = (v) => ecrireBrouillon({ texte: v });
  const setLiens = (f) => ecrireBrouillon({ liens: typeof f === "function" ? f(lireBrouillon(uid).liens) : f });
  const setEcheance = (v) => ecrireBrouillon({ echeance: v });
  const setPartage = (v) => ecrireBrouillon({ partage: v });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [mention, setMention] = useState(null);
  const [suggestions, setSuggestions] = useState(null);  // null : fermé
  const [actif, setActif] = useState(0);
  const champRef = useRef(null);
  const choixRef = useRef(null);
  const minuteur = useRef(null);
  const [saisieOuverte, setSaisieOuverte] = useState(false);

  const charger = () => getMemos()
    .then((r) => {
      setMemos(Array.isArray(r?.data) ? trierMemos(r.data) : null);
      setIndispo(r?.message || null);
      setPieces(r?.pieces_jointes === true);
    })
    .catch((e) => { setErreur(e.message); setMemos((m) => (m === undefined ? [] : m)); });
  useEffect(() => { charger(); return onMemosChange(charger); }, []);
  useAutoRefresh(charger, { interval: 60000 });
  useEffect(() => () => clearTimeout(minuteur.current), []);

  /* ON REPREND LÀ OÙ ON S'ÉTAIT ARRÊTÉ : rouvert sur un brouillon, le champ prend le focus avec le
     curseur au DÉBUT — et le premier mot tapé se glisserait devant la phrase. On le pose à la fin. */
  useEffect(() => {
    const el = champRef.current;
    if (autoFocus && el && el.value) el.setSelectionRange(el.value.length, el.value.length);
    // Une seule fois, à l'ouverture : ensuite le curseur appartient à qui écrit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos === undefined]);

  /* LE CHAMP GRANDIT AVEC CE QU'ON ÉCRIT, jusqu'à un plafond : une liste de huit puces ne doit pas
     se lire par une fente de deux lignes, et le panneau de la barre du haut ne doit pas devenir
     une page. Au-delà, le champ défile. `height: auto` AVANT la mesure, sinon `scrollHeight` ne
     redescend jamais — le champ ne ferait que grandir, même en effaçant. */
  useEffect(() => {
    const el = champRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  }, [texte]);

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

  /* SANS SURVOL, PAS DE TOUCHE MAJ : sur un téléphone, la touche Entrée du clavier à l'écran est la
     SEULE façon d'aller à la ligne, et l'y refuser rendrait les listes impossibles à écrire là où
     on écrit le plus de pense-bêtes. Le mémo s'y ajoute par le bouton « Ajouter », juste dessous. */
  const sansTouchMaj = () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: none)")?.matches;

  /* ON LIT LE CHAMP, PAS L'ÉTAT. `texte` est un état React : entre la frappe et le rendu, il est en
     retard d'une fraction de seconde sur ce qu'on voit, et la puce se serait continuée d'après une
     ligne déjà périmée. La valeur du champ, elle, est toujours à jour.
     ÉCRIRE, EN REVANCHE, RESTE LE TRAVAIL DE REACT : poser `el.value` à la main fait rouler la
     saisie en arrière au rendu suivant — essayé, et le retour à la ligne disparaissait purement et
     simplement. Le curseur se replace après ce rendu, sans quoi il retomberait à la fin du texte,
     donc SOUS la puce qu'on vient d'ouvrir au lieu d'être dedans. */
  function allerALaLigne(el) {
    const { texte: t, curseur } = continuerPuce(el.value, el.selectionStart);
    setTexte(t);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(curseur, curseur); });
  }

  /* Tant que la liste est ouverte, les flèches et Entrée lui appartiennent : Entrée choisit, elle
     n'envoie pas le mémo à moitié écrit. */
  function surTouche(e) {
    if (suggestions && suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => (i + 1) % suggestions.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => (i - 1 + suggestions.length) % suggestions.length); }
      else if (e.key === "Enter") { e.preventDefault(); choisir(suggestions[actif]); }
      else if (e.key === "Escape") { e.preventDefault(); setSuggestions(null); }
      return;
    }
    if (e.key === "Escape" && suggestions) { e.preventDefault(); setSuggestions(null); return; }
    /* `isComposing` : sur un clavier à composition (accents, autre alphabet), Entrée VALIDE le
       caractère en cours. L'intercepter ajouterait un mémo au milieu d'un mot. */
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.shiftKey || sansTouchMaj()) { e.preventDefault(); allerALaLigne(e.target); return; }
    ajouter(e);
  }

  /* JOINDRE — une image collée, ou des fichiers choisis. Deux au plus : ce qui dépasse est écarté,
     et dit. L'image est réduite ICI (profil `memo`) ; un PDF part tel quel. `apercu` est une adresse
     locale vers l'image, que le brouillon libère quand la pièce s'en va. */
  async function joindre(recus) {
    const liste = [...(recus || [])];
    if (!liste.length) return;
    setErreur(null);
    const place = MAX_FICHIERS - lireBrouillon(uid).fichiers.length;
    const refus = liste.length > place ? [`${MAX_FICHIERS} pièces jointes au plus par mémo.`] : [];
    const ajoutes = [];
    for (const f of liste.slice(0, Math.max(0, place))) {
      if (!genreFichier(f.type)) { refus.push(`« ${f.name || "fichier"} » : une image ou un PDF seulement.`); continue; }
      const blob = await reduireSiImage(f, PROFILS.memo);
      const non = refusDeFichier(blob);
      if (non) { refus.push(`« ${f.name || "image"} » : ${non}`); continue; }
      ajoutes.push({
        cle: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nom: f.name || (blob.type === "application/pdf" ? "document.pdf" : "image"),
        type: blob.type, octets: blob.size, blob,
        apercu: genreFichier(blob.type) === "image" ? URL.createObjectURL(blob) : null,
      });
    }
    // Relu APRÈS les réductions : une autre pièce a pu arriver pendant qu'on réduisait celle-ci.
    if (ajoutes.length) ecrireBrouillon({ fichiers: [...lireBrouillon(uid).fichiers, ...ajoutes].slice(0, MAX_FICHIERS) });
    if (refus.length) setErreur(refus.join(" "));
  }

  function retirerFichier(cle) {
    const f = fichiers.find((x) => x.cle === cle);
    if (f?.apercu) URL.revokeObjectURL(f.apercu);
    ecrireBrouillon({ fichiers: fichiers.filter((x) => x.cle !== cle) });
  }

  /* COLLER UNE CAPTURE D'ÉCRAN LA JOINT. Du texte collé reste du texte (cf. `fichiersColles`). */
  function surCollage(e) {
    if (!pieces) return;
    const recus = fichiersColles(e.clipboardData);
    if (!recus.length) return;
    e.preventDefault();
    joindre(recus);
  }

  function effacerBrouillon() {
    viderBrouillon();
    setSuggestions(null); setMention(null); setErreur(null);
    champRef.current?.focus();
  }

  async function ajouter(e) {
    e.preventDefault();
    if (!texte.trim() || busy) return;
    setBusy(true);
    await agir(async () => {
      await createMemo({ texte, echeance: echeance || null, partage, liens, fichiers });
      // Envoyé : le brouillon a fini sa vie, en mémoire comme dans la réserve de l'onglet.
      viderBrouillon(); setSuggestions(null); setMention(null);
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
          {/* UN `textarea` ET NON UN `input` : un pense-bête tient souvent en une ligne, mais « ce
              qu'il faut faire » tient en trois. Il commence à la hauteur d'un champ ordinaire et
              grandit avec le texte, pour ne pas promettre un formulaire là où une phrase suffit. */}
          <textarea ref={champRef} className="inp memo-saisie" rows={1} value={texte} onChange={surSaisie} onKeyDown={surTouche} onPaste={surCollage}
            onFocus={() => setSaisieOuverte(true)} onBlur={() => setSaisieOuverte(false)} maxLength={MAX_TEXTE}
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

        {/* L'AIDE NE S'AFFICHE QU'EN ÉCRIVANT : montrée en permanence, elle double la hauteur du
            formulaire pour une règle qu'on n'apprend qu'une fois ; cachée, personne ne devine
            Maj + Entrée. Elle paraît au moment exact où elle sert — dès qu'on entre dans le champ. */}
        {(saisieOuverte || texte) && (
          <p className="hint memo-aide">
            Maj + Entrée pour aller à la ligne. Une ligne qui commence par «&nbsp;*&nbsp;» devient une puce.
          </p>
        )}

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

        {fichiers.length > 0 && (
          <div className="memo-fichiers-choisis">
            {fichiers.map((f) => (
              <span key={f.cle} className="memo-fichier">
                {f.apercu ? <img src={f.apercu} alt="" /> : <Icon name="file-text" size={15} aria-hidden="true" />}
                <span className="memo-fichier-nom" title={f.nom}>{f.nom}</span>
                <span className="memo-fichier-poids">{poidsLisible(f.octets)}</span>
                <button type="button" onClick={() => retirerFichier(f.cle)} aria-label={`Retirer la pièce jointe ${f.nom}`}>×</button>
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
          {pieces && (
            <>
              {/* `e.target.value = ""` : sans lui, rechoisir LE MÊME fichier après l'avoir retiré ne
                  déclenche aucun `change`, et le trombone paraît mort. */}
              <input ref={choixRef} type="file" accept="image/*,application/pdf" multiple hidden
                onChange={(e) => { joindre(e.target.files); e.target.value = ""; }} />
              <button type="button" className="memo-joindre" onClick={() => choixRef.current?.click()} disabled={fichiers.length >= MAX_FICHIERS}
                title={fichiers.length >= MAX_FICHIERS ? `${MAX_FICHIERS} pièces jointes au plus` : "Joindre une image ou un PDF (ou coller une capture dans le champ)"}
                aria-label="Joindre une image ou un PDF">
                <Icon name="paperclip" size={15} />
              </button>
            </>
          )}
          <span className="memo-form-fin">
            {/* Le brouillon tient à la fermeture : il lui faut une sortie en un geste. */}
            {!brouillonVide(brouillon) && (
              <button type="button" className="btn ghost sm" onClick={effacerBrouillon}>Effacer</button>
            )}
            <button type="submit" className="btn primary sm" disabled={busy || !texte.trim()}>
              <Icon name="plus" size={14} aria-hidden="true" /> Ajouter
            </button>
          </span>
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
  /* Les libellés parlés prennent le mémo EN UNE LIGNE : « Supprimer : Il faut faire : * 1 * 2 »
     ferait annoncer des étoiles au milieu d'une phrase. */
  const dit = resumeMemo(m.texte);
  const du = etat && (etat.ton === "retard" || etat.ton === "jour");
  return (
    <li className={"memo-ligne" + (m.fait_le ? " fait" : "") + (du ? " du" : "") + (m.nouveau ? " neuf" : "")}>
      <input type="checkbox" checked={!!m.fait_le} onChange={() => agir(() => updateMemo(m.id, { fait: !m.fait_le }))}
        aria-label={m.fait_le ? `Remettre à faire : ${dit}` : `Marquer comme fait : ${dit}`} />
      <div className="memo-corps">
        {/* LE MÉMO TEL QU'IL A ÉTÉ ÉCRIT : ses lignes, et ses puces rendues en vraie liste — un
            lecteur d'écran l'annonce alors comme une liste, et les retours tiennent quand une
            ligne se replie. `blocsMemo` ne reconnaît que la puce : rien d'autre n'est interprété. */}
        <div className="memo-texte">
          {blocsMemo(m.texte).map((b, i) => (b.type === "puces" ? (
            <ul key={i} className="memo-puces">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
          ) : (
            <p key={i} className="memo-para">{b.lignes.join("\n")}</p>
          )))}
        </div>
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
        {/* LES PIÈCES JOINTES : l'image en vignette, le PDF par son nom. Un clic les ouvre dans un
            nouvel onglet — la route ne les sert qu'à qui voit le mémo. */}
        {(m.fichiers || []).length > 0 && (
          <span className="memo-pieces">
            {m.fichiers.map((f) => {
              const url = memoFichierUrl(m.id, f.id);
              const titre = `${f.nom} · ${poidsLisible(f.octets)}`;
              return f.mime === "application/pdf" ? (
                <a key={f.id} href={url} target="_blank" rel="noopener noreferrer" className="memo-piece" title={titre}>
                  <Icon name="file-text" size={13} aria-hidden="true" />{f.nom}
                </a>
              ) : (
                <a key={f.id} href={url} target="_blank" rel="noopener noreferrer" className="memo-piece image" title={titre}>
                  <img src={url} alt={f.nom} loading="lazy" />
                </a>
              );
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
            aria-label={m.partage ? `Ne plus partager : ${dit}` : `Partager avec l'équipe : ${dit}`}>
            <Icon name="users" size={15} />
          </button>
          <button type="button" className="memo-action danger" onClick={() => agir(() => deleteMemo(m.id))}
            title="Supprimer" aria-label={`Supprimer : ${dit}`}>
            <Icon name="trash" size={15} />
          </button>
        </span>
      )}
    </li>
  );
}
