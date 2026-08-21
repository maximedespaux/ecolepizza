import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { etatContrat } from "../lib/contrat.js";
import { exporterPartenaire, getTransmissionsPartenaire } from "../api/apiClient.js";
import { dateHeure } from "../lib/format.js";

/**
 * EXPORTER LES STAGIAIRES CONSENTANTS d'un partenaire, sur une période.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * UN SEUL BOUTON POUR LA PAGE, et non un par fiche. Exporter est une action que l'on fait UNE
 * fois de temps en temps, en choisissant à qui l'on écrit — pas une propriété de chaque
 * partenaire. Répétée sur vingt-deux cartes, l'icône devenait un élément d'interface de plus à
 * ignorer, et faisait croire que chaque fiche avait son propre export.
 *
 * C'est aussi le SEUL point d'export depuis qu'il a été retiré de la page d'une session. Un même
 * geste offert à deux endroits oblige à se demander lequel des deux fait quoi — et sur un écran
 * qui manipule des coordonnées, cette hésitation est un coût.
 *
 * LA LISTE DÉROULANTE NE PROPOSE QUE LES PARTENAIRES ÉLIGIBLES : destinataire déclaré, contrat en
 * cours. Le serveur refuse les autres ; les offrir mènerait à un refus, qui se lit comme une
 * panne alors que c'est un réglage qui manque. Aucun éligible, aucun bouton.
 *
 * L'APPLICATION N'ENVOIE RIEN ELLE-MÊME : elle prépare un tableau à copier ou à télécharger, que
 * l'école joint à son propre courriel. Produire la liste l'inscrit malgré tout au journal des
 * transmissions, y compris si l'envoi ne suit pas : annoncer un destinataire de trop est
 * réparable, en oublier un ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA PÉRIODE EST OBLIGATOIRE, ET PROPOSÉE À DOUZE MOIS. « Tout depuis toujours » enverrait à un
 * fournisseur les coordonnées de gens formés il y a six ans, qui ont consenti dans un tout autre
 * contexte et ne se souviennent probablement plus de l'école. La minimisation ne porte pas que
 * sur les CHAMPS : elle porte aussi sur COMBIEN DE PERSONNES.
 *
 * L'ÉCRAN NE COMPOSE RIEN. Le serveur écarte ceux qui n'ont pas consenti, n'envoie que les champs
 * annoncés à CHACUN, refuse un partenaire non destinataire ou au contrat échu, et inscrit l'envoi
 * au journal. Il n'existe aucun chemin, ici, pour ajouter quelqu'un à la liste.
 */

/** Le 1er janvier d'il y a un an → aujourd'hui, au format que l'`<input type="date">` attend. */
function periodeParDefaut() {
  const j = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const debut = new Date(j.getFullYear() - 1, j.getMonth(), j.getDate());
  return { depuis: iso(debut), jusquA: iso(j) };
}

/** Échappement CSV : une virgule ou un guillemet dans un nom casserait la colonne suivante. */
const csvCell = (v) => {
  const t = String(v ?? "");
  return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function ExportPartenaire({ partenaires, onErreur }) {
  const [ouvert, setOuvert] = useState(false);
  const [choisi, setChoisi] = useState("");
  const [periode, setPeriode] = useState(periodeParDefaut);
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [journal, setJournal] = useState([]);

  /* ÉLIGIBLES : destinataire déclaré ET contrat en cours — les deux conditions que le serveur
     vérifie. Les autres ne sont pas proposés : le serveur les refuserait, et un refus dont on ne
     comprend pas la cause se lit comme une panne. */
  const eligibles = (partenaires || []).filter(
    (p) => Number(p.recoit_coordonnees) === 1 && etatContrat(p).actif !== false);
  const partenaire = eligibles.find((p) => p.id === choisi) || null;

  /* Le journal se charge dès qu'un partenaire est choisi : savoir ce qu'on lui a déjà envoyé
     évite le double envoi, et c'est l'information la plus utile avant de fixer une période. */
  function choisir(id) {
    setChoisi(id); setResultat(null); setJournal([]);
    if (id) getTransmissionsPartenaire(id).then((r) => setJournal(r.data || [])).catch(() => {});
  }

  async function produire() {
    setBusy(true); setResultat(null);
    try {
      const r = await exporterPartenaire(choisi, periode.depuis, periode.jusquA);
      setResultat(r.data);
      if (r.data.journalise) getTransmissionsPartenaire(choisi).then((x) => setJournal(x.data || [])).catch(() => {});
    } catch (e) { onErreur?.(e.message); }
    finally { setBusy(false); }
  }

  function telecharger() {
    if (!resultat?.lignes?.length) return;
    /* POINT-VIRGULE ET BOM : Excel en français lit une virgule comme un séparateur décimal, et
       sans BOM il affiche « Ã© » à la place des accents. Un export illisible serait recopié à la
       main — et une liste recopiée à la main est exactement ce que cet écran remplace. */
    const csv = "﻿" + [resultat.champs.join(";"),
      ...resultat.lignes.map((l) => resultat.champs.map((c) => csvCell(l[c])).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(resultat.partenaire || "partenaire").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${periode.depuis}-${periode.jusquA}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copier() {
    if (!resultat?.lignes?.length) return;
    const txt = [resultat.champs.join("\t"),
      ...resultat.lignes.map((l) => resultat.champs.map((c) => l[c] ?? "").join("\t"))].join("\n");
    navigator.clipboard.writeText(txt).catch(() => onErreur?.("Copie impossible."));
  }

  /* UNE ICÔNE, PAS UN BOUTON DE TEXTE. La fiche d'un partenaire porte déjà beaucoup : sur
     vingt-deux fiches, une phrase de plus par carte allongeait la page sans rien apprendre à
     qui n'exporte pas. L'icône garde son `title` et son `aria-label` — une icône seule sans
     libellé accessible n'existe pas pour un lecteur d'écran. */
  /* AUCUN PARTENAIRE ÉLIGIBLE, AUCUN BOUTON. Un bouton qui n'aurait rien à proposer dans sa liste
     déroulante n'apprend rien — sinon qu'il faut aller cocher « reçoit les coordonnées » quelque
     part, ce qu'il ne dit pas. */
  if (!eligibles.length) return null;

  if (!ouvert) {
    return (
      <button type="button" className="btn ghost" onClick={() => setOuvert(true)}>
        <Icon name="table" size={15} /> Exporter les consentants
      </button>
    );
  }

  return (
    <div className="export-part">
      <b><Icon name="download" size={13} /> Stagiaires consentants à transmettre</b>
      {/* CE QUE L'APPLICATION NE FAIT PAS, dit avant qu'on le découvre. « Produire » à côté d'une
          icône de téléchargement pourrait laisser croire à un envoi automatique — le pire
          malentendu possible sur un écran qui manipule des coordonnées. */}
      <span className="hint" style={{ margin: "0 0 8px" }}>
        L'application <b>n'envoie rien elle-même</b> : elle prépare un tableau à joindre à votre
        courriel. Le préparer l'inscrit au <b>journal des transmissions</b>, même si vous ne
        l'envoyez pas ensuite.
      </span>
      <div className="export-part-periode">
        <label>
          Partenaire
          <select value={choisi} onChange={(e) => choisir(e.target.value)}>
            <option value="">Choisir…</option>
            {eligibles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          Du
          <input type="date" value={periode.depuis}
            onChange={(e) => setPeriode((p) => ({ ...p, depuis: e.target.value }))} />
        </label>
        <label>
          au
          <input type="date" value={periode.jusquA}
            onChange={(e) => setPeriode((p) => ({ ...p, jusquA: e.target.value }))} />
        </label>
        <button className="btn sm primary" disabled={busy || !choisi || !periode.depuis || !periode.jusquA}
          onClick={produire}>
          {busy ? "…" : "Produire"}
        </button>
        <button className="btn sm ghost" onClick={() => { setOuvert(false); setResultat(null); setChoisi(""); setJournal([]); }}>
          Fermer
        </button>
      </div>
      {/* ON DIT SUR QUOI PORTE LA PÉRIODE. « Du … au … » seul laisserait croire à une date
          d'inscription ou de consentement ; c'est la date de FIN de session qui borne, parce
          qu'une session en cours n'a pas encore de stagiaires formés. */}
      <span className="hint">
        Sessions <b>terminées</b> dans cette période. Un stagiaire inscrit à plusieurs sessions
        n'apparaît qu'une fois.
      </span>
      {/* CE QUE LE CHOIX DU PARTENAIRE CHANGE — et surtout ce qu'il NE change PAS.
          La question est légitime : le consentement du stagiaire porte sur « les partenaires de
          l'école », pas sur l'un d'eux en particulier. La liste est donc LA MÊME quel que soit le
          partenaire choisi. Ce que le choix décide, c'est le CONTRÔLE (a-t-il le droit de
          recevoir ?) et la TRACE (à qui l'a-t-on donnée ?) — deux choses invisibles dans le
          tableau, et que l'écran devait donc énoncer. */}
      <span className="hint">
        Le choix du partenaire ne change pas <b>qui</b> figure dans la liste — un stagiaire
        accepte pour les partenaires de l'école, pas pour l'un d'eux. Il décide de deux autres
        choses : <b>vérifier</b> que celui-ci a bien le droit de recevoir ces informations, et
        <b> inscrire à son nom</b> ce qui lui a été communiqué.
      </span>

      {journal.length > 0 && (
        <div className="export-part-journal">
          {/* « DÉJÀ ENVOYÉ » CONTREDISAIT LA LIGNE DU DESSUS, à quarante lignes d'écart :
              l'écran annonce que l'application n'envoie rien, puis affirme qu'elle a envoyé.
              Ce qui est journalisé, c'est une liste PRÉPARÉE — l'envoi, lui, se fait par courriel
              et l'outil n'en sait rien. Le libellé le dit maintenant, et la mention explique à
              quoi sert ce journal : sans lui, l'école ne peut pas répondre à un stagiaire qui
              demande à qui ses coordonnées ont été communiquées. */}
          <b><Icon name="history" size={12} /> Listes déjà préparées pour ce partenaire</b>
          <span className="hint" style={{ display: "block", marginBottom: 5 }}>
            Ce journal est la seule trace : l'envoi part de votre messagerie, l'application ne le
            voit pas. C'est lui qui permet de répondre à « à qui avez-vous donné mes
            coordonnées ? ».
          </span>
          {journal.slice(0, 5).map((j) => (
            <div key={j.id} className="export-part-journal-l">
              {/* `.chiffres` ET NON `.tnum` : cette dernière déclenche le masque des montants
                  (`.money-mask .tnum::after`), et la date du journal se serait affichée
                  « ••••• » dès que l'utilisateur masque les montants. Une date de transmission
                  n'est pas une somme, et la cacher ne protège rien — elle rend seulement le
                  journal illisible au moment où l'on en a besoin. */}
              <span className="chiffres hint">{dateHeure(j.sent_at)}</span>
              <span className="hint">
                {j.learners_count} stagiaire{j.learners_count > 1 ? "s" : ""}
                {/* Les anciennes lignes portent un `session_id` : elles viennent de l'export par
                    session, retiré depuis. Rien ne justifierait de les cacher — ce sont des
                    transmissions qui ont bel et bien eu lieu. */}
                {j.session_id ? " · depuis une session" : ""}
              </span>
              {j.par && <span className="hint">· {j.par}</span>}
            </div>
          ))}
        </div>
      )}

      {resultat && (
        resultat.lignes.length === 0 ? (
          <p className="hint" style={{ margin: "8px 0 0" }}>
            <Icon name="info" size={12} /> {resultat.message} Rien n'a été journalisé.
          </p>
        ) : (
          <div className="export-part-res">
            <div className="export-part-tt">
              <b>{resultat.lignes.length} stagiaire{resultat.lignes.length > 1 ? "s" : ""}</b>
              <span className="hint">{resultat.champs.length} colonnes</span>
              <span style={{ flex: 1 }} />
              <button className="btn sm" onClick={copier}><Icon name="copy" size={12} /> Copier</button>
              <button className="btn sm" onClick={telecharger}><Icon name="download" size={12} /> CSV</button>
            </div>
            <div className="consent-table-wrap">
              <table className="consent-table">
                <thead><tr>{resultat.champs.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
                <tbody>
                  {resultat.lignes.slice(0, 8).map((l, i) => (
                    <tr key={i}>{resultat.champs.map((c) => <td key={c}>{l[c] || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* APERÇU BORNÉ, ET ON LE DIT. Afficher huit lignes sur soixante sans le signaler
                ferait croire à un export tronqué — le fichier, lui, les contient toutes. */}
            {resultat.lignes.length > 8 && (
              <span className="hint">Aperçu des 8 premières lignes ; le fichier les contient toutes.</span>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default ExportPartenaire;
