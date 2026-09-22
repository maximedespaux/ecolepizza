import { useRef, useState } from "react";
import { importStagiaires, importEntreprises } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import Badge from "./Badge.jsx";
import { decoderCsv, lireCsv } from "../lib/csv.js";
import { CHAMPS_IMPORT, associerColonnes, lignesPourServeur, modeleCsv, nomModele } from "../lib/importFiches.js";

/**
 * L'IMPORT D'UN FICHIER CSV — stagiaires ou entreprises (demandé le 2026-09-22).
 *
 * TROIS TEMPS, et le serveur a le dernier mot à chacun :
 *   1. le FICHIER. Le modèle se télécharge ici, et le bouton est là dès l'ouverture, avant même
 *      d'avoir un fichier. Le fichier choisi se lit dans le navigateur (lib/csv.js) et ses colonnes
 *      se reconnaissent (lib/importFiches.js) ; celles qui ne le sont pas se choisissent à la main ;
 *   2. la VÉRIFICATION, un essai qui n'écrit rien : le serveur dit ligne par ligne ce qu'il fera —
 *      créer, sauter (déjà là), refuser (sans nom) — et ce qu'il laissera de côté ;
 *   3. l'IMPORT, qui ne se propose qu'après la vérification, et refait les mêmes contrôles.
 */
const TEXTES = {
  stagiaires: {
    titre: "Importer des stagiaires", une: "stagiaire", unite: ["fiche", "fiches"],
    aide: "Seuls le nom et le prénom sont obligatoires. Une fiche déjà présente (même e-mail) est sautée, jamais modifiée. Le n° de sécurité sociale et l'identifiant France Travail ne s'importent pas : ils se saisissent sur la fiche.",
  },
  entreprises: {
    titre: "Importer des entreprises", une: "entreprise", unite: ["fiche", "fiches"],
    aide: "Seul le nom de l'entreprise est obligatoire. Une fiche déjà présente (même SIRET, ou même nom au même code postal) est sautée, jamais modifiée.",
  },
};
const ENVOI = { stagiaires: importStagiaires, entreprises: importEntreprises };
const MAX_LIGNES = 2000; // le plafond du serveur (src/api/lib/importFiches.js)
const AFFICHEES = 200; // lignes signalées montrées ; au-delà, un compte
const STATUT = { doublon: ["Déjà présente", "n"], erreur: ["Refusée", "r"], a_creer: ["À créer", "g"], cree: ["Créée", "g"] };
const pluriel = (n, [un, plusieurs]) => `${n} ${n > 1 ? plusieurs : un}`;

export default function ImportCsv({ type, onClose, onImporte }) {
  const champs = CHAMPS_IMPORT[type];
  const t = TEXTES[type];
  const fichierRef = useRef(null);
  const [fichier, setFichier] = useState(null);
  const [colonnes, setColonnes] = useState([]);
  const [verif, setVerif] = useState(null);
  const [fait, setFait] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  function telechargerModele() {
    const url = URL.createObjectURL(new Blob([modeleCsv(type)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = nomModele(type);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function choisir(e) {
    const f = e.target.files?.[0];
    e.target.value = ""; // re-choisir le même fichier, corrigé, doit relancer la lecture
    if (!f) return;
    setErreur(null); setVerif(null); setFait(null);
    try {
      const { entetes, lignes } = lireCsv(decoderCsv(await f.arrayBuffer()));
      if (!entetes.length || !lignes.length) { setFichier(null); setErreur("Ce fichier ne contient aucune ligne sous son en-tête."); return; }
      if (lignes.length > MAX_LIGNES) { setFichier(null); setErreur(`${lignes.length} lignes : ${MAX_LIGNES} au plus par import. Coupez le fichier en plusieurs.`); return; }
      setFichier({ nom: f.name, entetes, lignes });
      setColonnes(associerColonnes(entetes, champs));
    } catch {
      setFichier(null); setErreur("Ce fichier ne se lit pas comme un CSV.");
    }
  }

  /* Une colonne choisie à la main : le champ qu'elle prend quitte toute autre colonne, et la
     vérification est à refaire — elle portait sur l'ancienne correspondance. */
  function associer(i, k) {
    setColonnes((c) => c.map((x, j) => (j === i ? k : (k && x === k ? "" : x))));
    setVerif(null);
  }
  const manquants = champs.filter((c) => c.requis && !colonnes.includes(c.k)).map((c) => c.l);

  async function envoyer(essai) {
    setBusy(true); setErreur(null);
    try {
      const r = await ENVOI[type](lignesPourServeur(fichier.lignes, colonnes), essai);
      if (essai) setVerif(r.data);
      else { setFait(r.data); onImporte?.(r.data?.bilan?.crees || 0); }
    } catch (e) {
      setErreur(e.message);
    } finally {
      setBusy(false);
    }
  }

  const resultat = fait || verif;
  const b = resultat?.bilan;
  const signalees = (resultat?.resultats || []).filter((r) => !["a_creer", "cree"].includes(r.statut) || r.avertissements.length);
  const exemple = (i) => fichier?.lignes.map((l) => String(l.cellules[i] ?? "").trim()).find(Boolean) || "";

  return (
    <div className="overlay">
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="import-csv-titre">
        <div className="mhead">
          <h3 id="import-csv-titre">{t.titre}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody import-csv">
          <p className="hint import-csv-aide">
            Un fichier CSV, une ligne par {t.une}. Depuis Excel : « Enregistrer sous », format « CSV (séparateur : point-virgule) ». {t.aide}
          </p>
          <div className="import-csv-boutons">
            <button type="button" className="btn ghost" onClick={telechargerModele}><Icon name="download" size={15} /> Télécharger le modèle</button>
            {!fait && (
              <button type="button" className="btn" onClick={() => fichierRef.current?.click()} disabled={busy}>
                <Icon name="upload" size={15} /> {fichier ? "Choisir un autre fichier" : "Choisir le fichier CSV"}
              </button>
            )}
            <input ref={fichierRef} type="file" accept=".csv,text/csv" hidden onChange={choisir} />
          </div>
          {erreur && <p className="import-csv-erreur" role="alert">{erreur}</p>}

          {fichier && !fait && (
            <div className="import-csv-fichier">
              <p className="import-csv-nom"><Icon name="file-text" size={15} aria-hidden="true" /><b>{fichier.nom}</b> : {pluriel(fichier.lignes.length, ["ligne", "lignes"])}</p>
              <div className="import-csv-colonnes" role="table" aria-label="Correspondance des colonnes">
                {fichier.entetes.map((h, i) => (
                  <div className="import-csv-colonne" role="row" key={i}>
                    <span role="cell" className="import-csv-entete">
                      <b>{h || "(colonne sans titre)"}</b>
                      {exemple(i) && <span className="hint">ex. : {exemple(i)}</span>}
                    </span>
                    <span role="cell">
                      <select className="inp" value={colonnes[i] || ""} onChange={(e) => associer(i, e.target.value)} aria-label={`Champ pour la colonne ${h || i + 1}`}>
                        <option value="">Ignorer cette colonne</option>
                        {champs.map((c) => <option key={c.k} value={c.k}>{c.l}{c.requis ? " *" : ""}</option>)}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
              {manquants.length > 0 && <p className="import-csv-erreur">Aucune colonne pour : {manquants.join(", ")}. Choisissez-la ci-dessus.</p>}
            </div>
          )}

          {b && (
            <div className="import-csv-bilan" aria-live="polite">
              <p className="import-csv-comptes">
                {fait
                  ? <Badge tone="g">{pluriel(b.crees, ["fiche créée", "fiches créées"])}</Badge>
                  : <Badge tone="g">{pluriel(b.a_creer, ["fiche à créer", "fiches à créer"])}</Badge>}
                {b.doublons > 0 && <Badge tone="n">{pluriel(b.doublons, ["déjà présente, sautée", "déjà présentes, sautées"])}</Badge>}
                {b.erreurs > 0 && <Badge tone="r">{pluriel(b.erreurs, ["refusée", "refusées"])}</Badge>}
                {b.avertissements > 0 && <Badge tone="a">{pluriel(b.avertissements, ["ligne avec un champ laissé de côté", "lignes avec un champ laissé de côté"])}</Badge>}
              </p>
              {signalees.length > 0 && (
                <ul className="import-csv-lignes">
                  {signalees.slice(0, AFFICHEES).map((r) => (
                    <li key={r.ligne}>
                      <span className="import-csv-ligne">Ligne {r.ligne}</span>
                      <span className="import-csv-qui">{r.nom || "(sans nom)"}</span>
                      <Badge tone={STATUT[r.statut]?.[1] || "n"}>{STATUT[r.statut]?.[0] || r.statut}</Badge>
                      {r.motif && <span className="import-csv-motif">{r.motif}</span>}
                      {r.avertissements.length > 0 && (
                        <ul className="import-csv-avert">{r.avertissements.map((a) => <li key={a}>{a}</li>)}</ul>
                      )}
                    </li>
                  ))}
                  {signalees.length > AFFICHEES && <li className="hint">Et {signalees.length - AFFICHEES} autres lignes signalées.</li>}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="mfoot">
          <div className="mfoot-actions">
            <button type="button" className="btn ghost" onClick={onClose}>{fait ? "Fermer" : "Annuler"}</button>
            {fichier && !fait && !verif && (
              <button type="button" className="btn primary" onClick={() => envoyer(true)} disabled={busy || manquants.length > 0}>
                <Icon name="check" size={15} /> {busy ? "Vérification…" : "Vérifier"}
              </button>
            )}
            {verif && !fait && (
              <button type="button" className="btn primary" onClick={() => envoyer(false)} disabled={busy || !verif.bilan.a_creer}>
                <Icon name="upload" size={15} /> {busy ? "Import…" : `Importer ${pluriel(verif.bilan.a_creer, t.unite)}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
