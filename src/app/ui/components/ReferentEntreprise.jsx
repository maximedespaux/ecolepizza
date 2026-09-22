import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { Requis } from "./Field.jsx";
import { nomReferent } from "../lib/referent.js";

/**
 * LE RÉFÉRENT D'UNE ENTREPRISE : UN STAGIAIRE, OU UNE AUTRE PERSONNE (demandé le 2026-09-22, migration 174).
 *
 * Le référent tenait dans un seul champ, « Nom du référent » : il se retapait à la main même quand
 * c'était un stagiaire de l'école — le patron d'une petite pizzeria qui se forme chez nous —, et rien
 * n'y séparait le prénom du nom. Deux façons de le dire désormais :
 *   · UN STAGIAIRE, choisi : sa civilité, son prénom et son nom sont ceux de sa fiche. Le serveur les
 *     recopie, puis les tient à jour quand elle change (src/api/lib/referentEntreprise.js) ;
 *   · UNE AUTRE PERSONNE : civilité, NOM et prénom, saisis.
 *
 * UN SEUL COMPOSANT pour les trois endroits où l'on nomme un référent : la fiche entreprise, la
 * création d'une entreprise, et le sous-formulaire « Nouvelle entreprise » de la fiche stagiaire.
 *
 * `valeur`       { representative_civ, representative_first_name, representative_name, representative_learner_id, representative_role }
 * `onChange(m)`  ce qui change, à fusionner dans le formulaire parent
 * `suggestions`  les stagiaires proposés d'emblée — ceux de l'entreprise, ou celui de la fiche ouverte
 * `stagiaire`    le stagiaire référent déjà enregistré (getCompany → referent_stagiaire)
 * `fonctions`    la liste des fonctions, quand le formulaire la propose
 */
export default function ReferentEntreprise({ valeur, onChange, suggestions = [], titreSuggestions = "Stagiaires de l'entreprise :",
  stagiaire = null, requis = false, fonctions = null }) {
  const [mode, setMode] = useState(valeur.representative_learner_id ? "stagiaire" : "autre");
  const [choisi, setChoisi] = useState(stagiaire);
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState([]);
  const [enCours, setEnCours] = useState(false);

  // La fiche se recharge après un enregistrement : le stagiaire affiché suit ce que dit le serveur.
  useEffect(() => {
    setChoisi(stagiaire);
    if (stagiaire) setMode("stagiaire");
  }, [stagiaire]);

  // Recherche débattue, comme « Rattacher un stagiaire » : une réponse tardive n'écrase pas la suivante.
  useEffect(() => {
    const terme = q.trim();
    if (!terme) { setResultats([]); setEnCours(false); return undefined; }
    let vivant = true;
    setEnCours(true);
    const h = setTimeout(() => {
      getStagiaires(terme)
        .then((r) => { if (vivant) setResultats((r.data || []).slice(0, 8)); })
        .catch(() => { if (vivant) setResultats([]); })
        .finally(() => { if (vivant) setEnCours(false); });
    }, 250);
    return () => { vivant = false; clearTimeout(h); };
  }, [q]);

  const nomDe = (s) => [s.first_name, s.last_name].filter(Boolean).join(" ");
  function choisir(s) {
    setChoisi(s); setQ(""); setResultats([]);
    /* Les noms sont recopiés ICI pour que l'écran les montre tout de suite ; le serveur les
       recopie de nouveau depuis la fiche, qui fait foi. La civilité, la liste de recherche ne la
       donne pas : le serveur la prendra. */
    onChange({
      representative_learner_id: s.id,
      ...(s.civility ? { representative_civ: s.civility } : {}),
      representative_first_name: s.first_name || "",
      representative_name: String(s.last_name || "").toLocaleUpperCase("fr"),
    });
  }
  function basculer(m) {
    if (m === mode) return;
    setMode(m);
    /* Vers « une autre personne » : le lien est défait, les noms restent, à corriger au besoin. Vers
       « un stagiaire » : rien ne change tant qu'aucun n'est choisi — basculer pour regarder puis
       enregistrer ne doit pas effacer le référent. */
    if (m === "autre") onChange({ representative_learner_id: "" });
    else if (choisi) onChange({ representative_learner_id: choisi.id });
  }

  const lie = !!choisi && valeur.representative_learner_id === choisi.id;
  const proposes = suggestions.filter((s) => s && s.id && s.id !== (lie ? choisi.id : null));
  const actuel = nomReferent(valeur);
  const options = fonctions && (valeur.representative_role && !fonctions.includes(valeur.representative_role)
    ? [valeur.representative_role, ...fonctions] : fonctions);

  return (
    <fieldset className="referent">
      <legend>Référent{requis && <Requis />}</legend>
      <div className="seg referent-modes" role="group" aria-label="Le référent est">
        <button type="button" className={"seg-btn" + (mode === "stagiaire" ? " on" : "")} aria-pressed={mode === "stagiaire"} onClick={() => basculer("stagiaire")}>
          <Icon name="graduation" size={13} aria-hidden="true" /> Un stagiaire
        </button>
        <button type="button" className={"seg-btn" + (mode === "autre" ? " on" : "")} aria-pressed={mode === "autre"} onClick={() => basculer("autre")}>
          <Icon name="user" size={13} aria-hidden="true" /> Une autre personne
        </button>
      </div>

      {mode === "stagiaire" ? (
        <div className="referent-stagiaire">
          {lie ? (
            <div className="referent-choisi">
              <span className="referent-choisi-nom">
                <b>{[choisi.civility, nomDe(choisi)].filter(Boolean).join(" ")}</b>
                {choisi.email && <span className="hint">{choisi.email}</span>}
              </span>
              <Link className="btn sm ghost" to={`/stagiaires/${choisi.id}`}>Ouvrir sa fiche</Link>
            </div>
          ) : (
            <p className="hint referent-aide">
              {actuel ? `Choisissez le stagiaire. Tant qu'aucun ne l'est, le référent reste ${actuel}.` : "Choisissez le stagiaire référent."}
            </p>
          )}
          {proposes.length > 0 && (
            <div className="referent-proposes">
              <span className="hint">{titreSuggestions}</span>
              {proposes.map((s) => (
                <button key={s.id} type="button" className="btn sm ghost" onClick={() => choisir(s)}>{nomDe(s) || s.email}</button>
              ))}
            </div>
          )}
          <span className="gs-search referent-recherche">
            <Icon name="search" size={14} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un stagiaire"
              placeholder={lie ? "Choisir un autre stagiaire…" : "Rechercher un stagiaire…"} />
            {q && <button type="button" className="gs-clear" aria-label="Effacer la recherche" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
          </span>
          {resultats.length > 0 && (
            <div className="gs-res referent-resultats">
              {resultats.map((s) => (
                <button key={s.id} type="button" className="gs-item referent-resultat" onClick={() => choisir(s)}>
                  <b>{nomDe(s) || s.email}</b>{s.email && <span className="hint">{s.email}</span>}
                </button>
              ))}
            </div>
          )}
          {q.trim() && !enCours && !resultats.length && <p className="hint referent-aide">Aucun stagiaire ne correspond.</p>}
        </div>
      ) : (
        <div className="referent-personne">
          <div className="field">
            <label>Civilité</label>
            <select className="inp" value={valeur.representative_civ || ""} onChange={(e) => onChange({ representative_civ: e.target.value })}>
              <option value="">-</option><option>M.</option><option>Mme</option>
            </select>
          </div>
          {/* Le NOM en capitales dès la frappe, comme partout (src/api/lib/saisie.js) ; le prénom tel quel. */}
          <div className="field">
            <label>Nom{requis && <Requis />}</label>
            <input className="inp" value={valeur.representative_name || ""} placeholder="DUPONT"
              onChange={(e) => onChange({ representative_name: e.target.value.toLocaleUpperCase("fr") })} />
          </div>
          <div className="field">
            <label>Prénom</label>
            <input className="inp" value={valeur.representative_first_name || ""} placeholder="Jean"
              onChange={(e) => onChange({ representative_first_name: e.target.value })} />
          </div>
        </div>
      )}

      {options && (
        <div className="field referent-fonction">
          <label>Fonction du référent</label>
          <select className="inp" value={valeur.representative_role || ""} onChange={(e) => onChange({ representative_role: e.target.value })}>
            <option value="">-</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}
    </fieldset>
  );
}
