import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { exporterPartenaire, getTransmissionsPartenaire } from "../api/apiClient.js";

/**
 * EXPORTER LES STAGIAIRES CONSENTANTS d'un partenaire, sur une période.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE SEUL POINT D'EXPORT, depuis qu'il a été retiré de la page d'une session. Il y en avait deux,
 * et l'école a tranché : c'est ICI qu'on choisit à qui l'on écrit, donc ici que la liste se
 * prépare. Un même geste offert à deux endroits oblige à se demander lequel des deux fait quoi —
 * et sur un écran qui manipule des coordonnées, cette hésitation est un coût.
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

function ExportPartenaire({ partenaire, onErreur }) {
  const [ouvert, setOuvert] = useState(false);
  const [periode, setPeriode] = useState(periodeParDefaut);
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [journal, setJournal] = useState([]);

  /* Le journal se charge à l'OUVERTURE : savoir ce qu'on a déjà envoyé évite le double envoi,
     et c'est l'information la plus utile avant de choisir une période. */
  function ouvrirJournal() {
    getTransmissionsPartenaire(partenaire.id).then((r) => setJournal(r.data || [])).catch(() => {});
  }

  async function produire() {
    setBusy(true); setResultat(null);
    try {
      const r = await exporterPartenaire(partenaire.id, periode.depuis, periode.jusquA);
      setResultat(r.data);
      if (r.data.journalise) getTransmissionsPartenaire(partenaire.id).then((x) => setJournal(x.data || [])).catch(() => {});
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
    a.download = `${partenaire.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${periode.depuis}-${periode.jusquA}.csv`;
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
  if (!ouvert) {
    return (
      <button type="button" className="iconbtn" onClick={() => { setOuvert(true); ouvrirJournal(); }}
        title="Exporter les stagiaires consentants (tableur)"
        aria-label={`Exporter les stagiaires consentants de ${partenaire.name}`}>
        <Icon name="table" size={15} />
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
          Du
          <input type="date" value={periode.depuis}
            onChange={(e) => setPeriode((p) => ({ ...p, depuis: e.target.value }))} />
        </label>
        <label>
          au
          <input type="date" value={periode.jusquA}
            onChange={(e) => setPeriode((p) => ({ ...p, jusquA: e.target.value }))} />
        </label>
        <button className="btn sm primary" disabled={busy || !periode.depuis || !periode.jusquA}
          onClick={produire}>
          {busy ? "…" : "Produire"}
        </button>
        <button className="btn sm ghost" onClick={() => { setOuvert(false); setResultat(null); }}>
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

      {journal.length > 0 && (
        <div className="export-part-journal">
          <b><Icon name="history" size={12} /> Déjà envoyé à ce partenaire</b>
          {journal.slice(0, 5).map((j) => (
            <div key={j.id} className="export-part-journal-l">
              <span className="tnum hint">{j.sent_at}</span>
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
