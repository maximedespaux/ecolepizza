import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { exporterPartenaire } from "../api/apiClient.js";

/**
 * EXPORTER LES STAGIAIRES CONSENTANTS d'un partenaire, sur une période.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * IL COMPLÈTE L'EXPORT PAR SESSION, il ne le remplace pas. L'école transmet d'ordinaire session
 * par session, et l'écran de la session reste le bon endroit pour ça. Mais un partenaire qui
 * demande « envoyez-moi tout ce que vous avez sur l'année » obligeait à ouvrir douze sessions et à
 * recoller douze listes à la main — c'est-à-dire à refaire exactement ce que ces écrans existent
 * pour éviter.
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

  async function produire() {
    setBusy(true); setResultat(null);
    try {
      const r = await exporterPartenaire(partenaire.id, periode.depuis, periode.jusquA);
      setResultat(r.data);
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

  if (!ouvert) {
    return (
      <button type="button" className="btn sm ghost" onClick={() => setOuvert(true)}>
        <Icon name="download" size={14} /> Exporter les stagiaires consentants
      </button>
    );
  }

  return (
    <div className="export-part">
      <b><Icon name="download" size={13} /> Stagiaires consentants à transmettre</b>
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
