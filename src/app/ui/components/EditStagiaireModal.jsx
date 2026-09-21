import { useEffect, useState } from "react";
import { getStagiaire, createStagiaire, updateStagiaire, getOpcos, getFormations, getCompanies, createCompany } from "../api/apiClient.js";
import { Field, SelectField } from "./Field.jsx";
import { OPCOS } from "../lib/opco.js";
import { colorForLevel, setBadgeColors } from "../lib/levels.js";
import { compterMots, NOTE_STAGIAIRE_MOTS_MAX } from "../lib/mots.js";
import { bumpBadges } from "../lib/events.js";

const CIVILITES = ["M.", "Mme"];
const STATUTS = ["En activité", "Demandeur d'emploi", "Sans activité", "Étudiant", "Retraité", "Autre"];
const UNITES = ["mois", "année(s)"];
const CONTRATS = ["CDI", "CDD", "Intérim", "Saisonnier", "Apprentissage", "Indépendant / Gérant", "Fonctionnaire", "Autre"];
const STATUTS_ENTREPRISE = ["SARL", "SAS", "SASU", "EURL", "EI", "Auto-entrepreneur", "EIRL", "SA", "Autre"];
/* DEUX CHAMPS LIBRES PASSÉS EN LISTES. Saisis à la main, ils accumulaient « mail », « Mail »,
   « e-mail », « tel », « Tél. », « bac+2 », « Bac + 2 » : impossible de compter d'où viennent les
   contacts, ni de filtrer sur un niveau. Une liste tranche la question à la saisie. */
/* « EDOF » (2026-09-21) : la plateforme du CPF, par où arrivent les demandes de formation financées
   par le compte personnel — un canal à part entière, qu'on veut pouvoir compter comme les deux autres. */
const CONTACTS = ["Mail", "Téléphone", "EDOF"];
/* « BTS » est rangé à côté de « BAC +2 », qui EST son niveau : la liste mêle des NOMS de
   diplôme (CAP, BEP, BAC, BTS) et des NIVEAUX (BAC +1 … +8), et c'est voulu — on demande ici
   le plus haut diplôme, que les gens nomment tantôt d'une façon, tantôt de l'autre. Les
   placer côte à côte évite qu'on cherche le BTS en fin de liste. */
const DIPLOMES = ["Sans diplôme", "CAP", "BEP", "BAC", "BAC +1", "BAC +2", "BTS", "BAC +3", "BAC +4", "BAC +5", "BAC +8"];
/* Conserve une valeur HÉRITÉE hors liste : passer un champ libre en liste déroulante ne doit pas
   effacer en silence ce qu'un ancien dossier contenait (« Site web », « Bac pro »…). Elle reste
   proposée pour ce dossier-là, sans polluer la liste des autres. */
const optionsAvec = (liste, valeur) => (valeur && !liste.includes(valeur) ? [valeur, ...liste] : liste);

const EMPTY = {
  contacted_at: "", contacted_by: "", civility: "", first_name: "", last_name: "",
  email: "", phone: "", birthday: "", birth_place: "", address: "", zip_code: "", town: "",
  diploma_level: "", diploma_name: "", diploma_year: "", last_experience: "",
  experience_value: "", experience_unit: "", professional_status: "", cpf_amount: "",
  france_travail_id: "", current_contract: "", social_security: "",
  financing: "PARTICULIER", opco: "", levels: "", completed_levels: "", company_id: "",
  project_creation: false, project_takeover: false, project_oven: false, project_truck: false, project_job: false,
  project_improvement: false,
  note_libre: "", // migration 168 : la note en texte simple, sous « Votre projet »
  a_recontacter: false, // migration 169 : le rappel (liste de priorité, tableau de bord, pastille du menu)
};

/* LA LISTE DOIT SUIVRE `EMPTY` : `toForm` lit les autres clés en `?? ""`, si bien qu'un booléen
   oublié ici arriverait à `false`… puis à la chaîne vide au premier enregistrement. Trois listes
   disent le même ensemble dans ce fichier (EMPTY, BOOL_FIELDS, les cases rendues) — un test le
   vérifie, parce qu'elles ont vocation à diverger. */
const BOOL_FIELDS = ["project_creation", "project_takeover", "project_oven", "project_truck", "project_job", "project_improvement", "a_recontacter"];
const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");

function toForm(d) {
  const form = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) form[k] = d[k] ?? "";
  for (const b of BOOL_FIELDS) form[b] = !!d[b];
  form.contacted_at = dateOnly(d.contacted_at);
  form.birthday = dateOnly(d.birthday);
  form.financing = d.financing || "PARTICULIER";
  form.company_id = d.company_id || (d.company && d.company.id) || "";
  return form;
}

/**
 * Modale complète d'édition/création d'un stagiaire (fiche d'expression).
 * `id` : identifiant du stagiaire à modifier, ou null/undefined pour une création.
 * Utilisée aussi bien depuis la liste des stagiaires que depuis la fiche détaillée.
 */
function EditStagiaireModal({ id, onClose, onSaved, onError, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [opcos, setOpcos] = useState([]);
  const [formations, setFormations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newCo, setNewCo] = useState(null); // formulaire compact « nouvelle entreprise » (ou null)

  useEffect(() => { getOpcos().then((r) => setOpcos(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { getCompanies().then((r) => setCompanies(r.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    getFormations().then((r) => {
      const list = r.data || [];
      setFormations(list);
      const map = {};
      for (const f of list) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!id) { setForm(EMPTY); setLoading(false); return; }
    setLoading(true);
    getStagiaire(id).then(({ data }) => setForm(toForm(data)))
      .catch((e) => onError?.(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const opcoNames = opcos.length ? opcos.filter((o) => o.active).map((o) => o.name) : OPCOS;
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  // NOM en majuscules dès la frappe (usage administratif français). Les accents sont conservés
  // dans tous les cas (« Déspaux » → « DÉSPAUX ») ; la locale est ÉPINGLÉE à "fr" pour que la
  // casse ne dépende pas de celle du poste — sans argument, un navigateur en turc écrirait
  // « İLE » pour « ile ».
  const setNom = (e) => setForm((p) => ({ ...p, last_name: e.target.value.toLocaleUpperCase("fr") }));
  // VILLE en majuscules aussi, même règle et même locale — le serveur l'applique de toute façon
  // (src/api/lib/saisie.js) ; la faire dès la frappe évite qu'elle change de casse à l'enregistrement.
  const setVille = (e) => setForm((p) => ({ ...p, town: e.target.value.toLocaleUpperCase("fr") }));
  // E-MAIL en minuscules et sans espace : c'est aussi l'identifiant de connexion du stagiaire,
  // et « Jean@X.fr » puis « jean@x.fr » finiraient en deux comptes pour la même personne.
  const setEmail = (e) => setForm((p) => ({ ...p, email: e.target.value.trim().toLowerCase() }));
  const toggle = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));
  const toggleLevel = (code) => setForm((p) => {
    const s = new Set((p.levels || "").split(",").map((x) => x.trim()).filter(Boolean));
    const cs = new Set((p.completed_levels || "").split(",").map((x) => x.trim()).filter(Boolean));
    if (s.has(code)) { s.delete(code); cs.delete(code); } else s.add(code); // retirer un niveau retire aussi « terminé »
    return { ...p, levels: [...s].join(","), completed_levels: [...cs].join(",") };
  });
  // Marque / démarque une formation comme TERMINÉE (indépendant de la complétion auto des docs).
  const toggleFinished = (code) => setForm((p) => {
    const cs = new Set((p.completed_levels || "").split(",").map((x) => x.trim()).filter(Boolean));
    cs.has(code) ? cs.delete(code) : cs.add(code);
    return { ...p, completed_levels: [...cs].join(",") };
  });
  async function saveNewCompany() {
    /* Mêmes cinq champs que la route, nommés un par un : « champs requis » sur six champs
       oblige à tous les relire pour trouver lequel manque. */
    const manquants = [["name", "Nom de l'entreprise"], ["siret", "SIRET"], ["email", "E-mail"],
      ["phone", "Téléphone"], ["representative_name", "Représentant"]]
      .filter(([k]) => !String(newCo[k] || "").trim()).map(([, l]) => l);
    if (manquants.length) { onError?.(`Champ${manquants.length > 1 ? "s" : ""} requis : ${manquants.join(", ")}.`); return; }
    try {
      const r = await createCompany(newCo);
      const list = (await getCompanies()).data || [];
      setCompanies(list);
      setForm((p) => ({ ...p, company_id: r.data?.id || p.company_id }));
      setNewCo(null);
    } catch (e) { onError?.(e.message); }
  }
  const codeColor = (code) => {
    const f = formations.find((x) => x.code === code);
    return (f && f.color) || colorForLevel(code);
  };

  /* LA NOTE : 128 MOTS AU PLUS, comptés comme le serveur les recompte (lib/mots.js). La frappe
     n'est PAS coupée à la limite — un texte collé serait tronqué en silence, au milieu d'une
     phrase — : le compteur passe au rouge, dit de combien, et l'enregistrement attend. */
  const motsNote = compterMots(form.note_libre);
  const noteTropLongue = motsNote > NOTE_STAGIAIRE_MOTS_MAX;

  const isPro = form.financing === "PROFESSIONNEL";
  const isJobSeeker = form.professional_status === "Demandeur d'emploi";
  const isEmployed = form.professional_status === "En activité";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!String(form.first_name).trim() || !String(form.last_name).trim()) { onError?.("Prénom et nom requis."); return; }
    /* Téléphone et e-mail sont exigés À LA CRÉATION seulement (`!id`). Les imposer aussi en
       modification bloquerait toute correction sur une ancienne fiche dont le numéro n'a jamais
       été collecté : on serait incapable de corriger une adresse faute d'un téléphone qu'on n'a
       pas. Les fiches neuves sont complètes, l'existant reste réparable. */
    if (!id && (!String(form.phone || "").trim() || !String(form.email || "").trim())) {
      onError?.("Téléphone et adresse e-mail requis pour créer un stagiaire."); return;
    }
    // Même règle que le serveur, dite ICI : un 422 après enregistrement fait perdre la saisie de vue.
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) { onError?.("Adresse email invalide."); return; }
    if (noteTropLongue) { onError?.(`La note dépasse ${NOTE_STAGIAIRE_MOTS_MAX} mots (${motsNote}) : raccourcissez-la pour enregistrer.`); return; }
    setSaving(true);
    try {
      // On lie l'entreprise via sa FK (company_id) : plus de saisie dupliquée par stagiaire.
      const payload = { ...form, company_id: isPro ? (form.company_id || null) : null };
      /* LE SERVEUR DIT CE QU'IL A LAISSÉ TOMBER (`ignores` : colonne absente, migration non jouée).
         Même règle que l'écran de l'organisme : un « enregistré » qui tairait la note perdue serait
         un succès qui ment — elle aurait disparu à la réouverture, sans un mot. */
      const PERDUS = { note_libre: ["la note", 168], a_recontacter: ["le rappel « à recontacter »", 169] };
      const sauf = (r) => {
        const p = (r?.ignores || []).filter((k) => PERDUS[k]);
        if (!p.length) return null;
        const plusieurs = p.length > 1;
        return `, sauf ${p.map((k) => PERDUS[k][0]).join(" et ")} : ${plusieurs ? "les migrations" : "la migration"} `
          + `${p.map((k) => PERDUS[k][1]).join(" et ")} ${plusieurs ? "ne sont pas jouées" : "n'est pas jouée"}.`;
      };
      if (id) {
        const r = await updateStagiaire(id, payload);
        onSaved?.(sauf(r) ? `Stagiaire mis à jour${sauf(r)}` : "Stagiaire mis à jour.", sauf(r) ? "info" : "success");
      } else {
        /* PLUS DE COMPTE À LA CRÉATION DE LA FICHE : il naît à l'inscription à une session, quand
           l'espace a enfin quelque chose à montrer (cf. createLearner). On le dit, sinon on
           chercherait le mot de passe qu'affichait ce message. */
        const r = await createStagiaire(payload);
        onSaved?.(sauf(r)
          ? `Stagiaire ajouté${sauf(r)} Son compte de connexion sera créé à son inscription à une session.`
          : "Stagiaire ajouté. Son compte de connexion sera créé à son inscription à une session.", sauf(r) ? "info" : "success");
      }
      bumpBadges(); // la pastille « Stagiaires » du menu suit la case « à recontacter », sans attendre la minute
    } catch (err) { onError?.(err.message); }
    finally { setSaving(false); }
  }

  const current = (form.levels || "").split(",").map((s) => s.trim()).filter(Boolean);
  const finished = (form.completed_levels || "").split(",").map((s) => s.trim()).filter(Boolean);
  // « Terminée » ne compte que parmi les formations cochées : décocher un accès retire aussi son « terminé ».
  const nbTerminees = finished.filter((c) => current.includes(c)).length;
  const codes = [...new Set([...formations.map((f) => f.code).filter(Boolean), ...current])];

  return (
    <div className="overlay">
      <div className="modal wide">
        <div className="mhead">
          <h3>{id ? "Modifier le stagiaire" : "Nouveau stagiaire"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {loading ? <p className="hint">Chargement…</p> : (
            <form id="stagiaire-form" onSubmit={handleSubmit}>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Prise de contact &amp; identité</h3>
              <div className="row2">
                <Field label="Contact le" type="date" value={form.contacted_at} onChange={set("contacted_at")} />
                <SelectField label="Contacté par" value={form.contacted_by} onChange={set("contacted_by")}>
                  <option value="">-</option>
                  {optionsAvec(CONTACTS, form.contacted_by).map((c) => <option key={c} value={c}>{c}</option>)}
                </SelectField>
              </div>
              {/* LE RAPPEL (2026-09-21), dans la prise de contact : c'est en notant l'appel qu'on sait
                  s'il faudra rappeler. Cochée, la fiche passe en tête de la page des stagiaires, sur
                  le tableau de bord, et dans la pastille du menu. */}
              <label className="case-rappel">
                <input type="checkbox" checked={!!form.a_recontacter} onChange={toggle("a_recontacter")} />
                <span><b>À recontacter</b> : un rappel en tête de la liste des stagiaires et sur le tableau de bord</span>
              </label>
              <div className="row3">
                <SelectField label="Civilité" value={form.civility} onChange={set("civility")}>
                  <option value="">-</option>
                  {CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
                </SelectField>
                <Field label="Prénom" value={form.first_name} onChange={set("first_name")} placeholder="Marie" requis required />
                <Field label="Nom" value={form.last_name} onChange={setNom} placeholder="DUPONT" requis required />
              </div>
              <div className="row2">
                <Field label="Date de naissance" type="date" value={form.birthday} onChange={set("birthday")} />
                <Field label="Lieu de naissance" value={form.birth_place} onChange={set("birth_place")} placeholder="Tarbes" />
              </div>
              <div className="row2">
                <Field label="Téléphone" value={form.phone} onChange={set("phone")} placeholder="06 12 34 56 78" requis />
                <Field label="Adresse email" type="email" value={form.email} onChange={setEmail} placeholder="marie.dupont@exemple.fr" requis />
              </div>
              <div className="row3">
                <Field label="Adresse" value={form.address} onChange={set("address")} placeholder="12 rue des Lilas" />
                <Field label="Code postal" value={form.zip_code} onChange={set("zip_code")} placeholder="65300" />
                <Field label="Ville" value={form.town} onChange={setVille} placeholder="LANNEMEZAN" />
              </div>

              <div className="divider" />
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Parcours scolaire</h3>
              <div className="row3">
                <SelectField label="Niveau du diplôme le plus élevé" value={form.diploma_level} onChange={set("diploma_level")}>
                  <option value="">-</option>
                  {optionsAvec(DIPLOMES, form.diploma_level).map((d) => <option key={d} value={d}>{d}</option>)}
                </SelectField>
                <Field label="Nom du diplôme" value={form.diploma_name} onChange={set("diploma_name")} placeholder="CAP Cuisine" />
                <Field label="Année d'obtention" value={form.diploma_year} onChange={set("diploma_year")} placeholder="2015" />
              </div>
              <div className="row3">
                <Field label="Dernière expérience professionnelle" value={form.last_experience} onChange={set("last_experience")} placeholder="Commis de cuisine" />
                <Field label="Durée (nombre)" value={form.experience_value} onChange={set("experience_value")} placeholder="18" />
                <SelectField label="Durée (unité)" value={form.experience_unit} onChange={set("experience_unit")}>
                  <option value="">-</option>
                  {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                </SelectField>
              </div>

              <div className="divider" />
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Statut actuel &amp; financement</h3>
              <div className="row3">
                <SelectField label="Êtes-vous ?" value={form.professional_status} onChange={set("professional_status")}>
                  <option value="">-</option>
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectField>
                <Field label="Montant CPF (€)" type="number" step="0.01" value={form.cpf_amount} onChange={set("cpf_amount")} placeholder="1500" />
                <Field label="N° de sécurité sociale" value={form.social_security} onChange={set("social_security")} placeholder="1 85 07 65 123 456 78" />
              </div>
              {isJobSeeker && (
                <div className="row2">
                  <Field label="Identifiant France Travail (Pôle emploi)" value={form.france_travail_id} onChange={set("france_travail_id")} placeholder="1234567A" />
                </div>
              )}
              {isEmployed && (
                <div className="row2">
                  <SelectField label="Votre contrat actuel" value={form.current_contract} onChange={set("current_contract")}>
                    <option value="">-</option>
                    {CONTRATS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                </div>
              )}
              <div className="row2">
                <SelectField label="Type de devis" value={form.financing} onChange={set("financing")}>
                  <option value="PARTICULIER">Personnel (particulier)</option>
                  <option value="PROFESSIONNEL">Professionnel (entreprise)</option>
                </SelectField>
                <SelectField label="OPCO / financeur" value={form.opco} onChange={set("opco")}>
                  <option value="">-</option>
                  {[...new Set([...(form.opco ? [form.opco] : []), ...opcoNames])].map((o) => <option key={o} value={o}>{o}</option>)}
                </SelectField>
              </div>

              <div className="divider" />
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Votre projet</h3>
              {/* `marginBottom: 12` : l'écart d'un champ (`.field`). Sans lui, la section suivante
                  (« Note », « Entreprise ») se collait aux cases. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
                {/* « Perfectionnement » (migration 158) : les cinq autres cases disent toutes un projet de
                    CHANGEMENT — créer, reprendre, s'équiper, chercher un poste. Qui exerce déjà et vient
                    se perfectionner n'avait aucune case, et ressortait donc avec un projet VIDE,
                    indiscernable d'une fiche non remplie. */}
                {[["project_creation", "Création"], ["project_takeover", "Reprise"], ["project_oven", "Four"], ["project_truck", "Camion / Remorque"], ["project_job", "Cherche poste pizzaïolo(la)"], ["project_improvement", "Perfectionnement"]].map(([k, lab]) => (
                  <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                    <input type="checkbox" checked={!!form[k]} onChange={toggle(k)} /> {lab}
                  </label>
                ))}
              </div>

              {/* LA NOTE, sous le projet (demandé le 2026-09-21) : du texte simple, 128 mots au plus.
                  Le titre de la section nomme le champ (`aria-labelledby`) ; le compteur est annoncé
                  aux lecteurs d'écran, sinon la limite n'existerait que pour qui voit la couleur. */}
              <div className="divider" />
              <h3 id="note-libre-titre" style={{ fontSize: 15, marginBottom: 10 }}>Note</h3>
              <div className="field">
                <textarea className="inp note-libre" rows={4} value={form.note_libre} onChange={set("note_libre")}
                  aria-labelledby="note-libre-titre" aria-describedby="note-libre-compte" aria-invalid={noteTropLongue || undefined}
                  placeholder="Texte libre : précisions sur le projet, disponibilités, contexte…" />
                <div id="note-libre-compte" className={"mots-compte" + (noteTropLongue ? " trop" : "")} aria-live="polite">
                  {noteTropLongue
                    ? `${motsNote} / ${NOTE_STAGIAIRE_MOTS_MAX} mots : retirez-en ${motsNote - NOTE_STAGIAIRE_MOTS_MAX} pour enregistrer`
                    : `${motsNote} / ${NOTE_STAGIAIRE_MOTS_MAX} mots`}
                </div>
              </div>

              {isPro && (
                <>
                  <div className="divider" />
                  <h3 style={{ fontSize: 15, marginBottom: 4 }}>Entreprise</h3>
                  <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Rattache le stagiaire à une entreprise. Ses coordonnées (SIRET, adresse, représentant, OPCO…) se gèrent dans la section <b>Entreprises</b> et servent aux documents.</p>
                  <div className="row2">
                    <SelectField label="Entreprise rattachée" value={form.company_id} onChange={set("company_id")}>
                      <option value="">Aucune</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.town ? ` · ${c.town}` : ""}</option>)}
                    </SelectField>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      {!newCo && <button type="button" className="btn ghost" onClick={() => setNewCo({ name: "", siret: "", town: "", email: "", phone: "", representative_name: "" })}>＋ Nouvelle entreprise</button>}
                    </div>
                  </div>
                  {newCo && (
                    <div className="card" style={{ padding: 12, marginTop: 4 }}>
                      {/* E-mail et téléphone AJOUTÉS ici : ce sous-formulaire appelle la MÊME route que
                          « Nouvelle entreprise », qui les exige désormais. Sans eux, créer une entreprise
                          depuis une fiche stagiaire serait devenu impossible — un 422 portant sur un champ
                          que l'écran ne proposait même pas, donc ni compréhensible ni corrigeable. */}
                      <div className="row3">
                        <Field label="Nom" requis value={newCo.name} onChange={(e) => setNewCo((n) => ({ ...n, name: e.target.value }))} />
                        <Field label="SIRET" requis placeholder="879 955 136 00012" value={newCo.siret} onChange={(e) => setNewCo((n) => ({ ...n, siret: e.target.value }))} />
                        <Field label="Ville" placeholder="LANNEMEZAN" value={newCo.town} onChange={(e) => setNewCo((n) => ({ ...n, town: e.target.value.toLocaleUpperCase("fr") }))} />
                      </div>
                      <div className="row3">
                        <Field label="E-mail" requis type="email" placeholder="contact@lepetitfour.fr" value={newCo.email} onChange={(e) => setNewCo((n) => ({ ...n, email: e.target.value }))} />
                        <Field label="Téléphone" requis placeholder="05 62 98 12 34" value={newCo.phone} onChange={(e) => setNewCo((n) => ({ ...n, phone: e.target.value }))} />
                        <Field label="Représentant (nom & prénom)" requis placeholder="DUPONT" value={newCo.representative_name} onChange={(e) => setNewCo((n) => ({ ...n, representative_name: e.target.value }))} />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn sm ghost" onClick={() => setNewCo(null)}>Annuler</button>
                        <button type="button" className="btn sm primary" onClick={saveNewCompany}>Créer &amp; rattacher</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* NIVEAUX / ACCÈS — EN BAS, ET REPLIÉS (déplacés le 2026-09-17, à la demande de l'école).
                  La section coupait « Statut & financement » de « Votre projet », au milieu de la
                  fiche d'expression du stagiaire, alors qu'elle se remplit en grande partie seule :
                  l'inscription en session ajoute l'accès (cf. enrollment.controller). On y revient
                  pour corriger, ou pour cocher « terminé ». Repliée, elle garde son résumé visible —
                  combien de formations, combien de terminées — pour qu'on sache sans l'ouvrir s'il
                  y a quelque chose à voir. */}
              <div className="divider" />
              <details className="acces-formations">
                <summary className="arch-sum arch-y">
                  Niveaux / accès, codes formation
                  <span className="arch-count">
                    {current.length === 0 ? "aucune formation"
                      : `${current.length} formation${current.length > 1 ? "s" : ""} · ${nbTerminees} terminée${nbTerminees > 1 ? "s" : ""}`}
                  </span>
                </summary>
                <p className="hint" style={{ margin: "6px 0 10px" }}>Cochez <b>terminé</b> quand la formation est finie.</p>
                {codes.length === 0 ? (
                  <p className="hint">Aucune formation. Créez-en dans « Formations ».</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {codes.map((code) => {
                      const on = current.includes(code);
                      const fin = finished.includes(code);
                      return (
                        <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px", border: "1px solid var(--border-soft)", borderRadius: 8, background: on ? "var(--surface2)" : "transparent" }}>
                          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                            <input type="checkbox" checked={on} onChange={() => toggleLevel(code)} />
                            <i style={{ width: 11, height: 11, borderRadius: "50%", background: codeColor(code), display: "inline-block" }} /> {code}
                          </label>
                          {on && (
                            <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, color: fin ? "#2e9e5b" : "var(--muted)", cursor: "pointer" }}>
                              <input type="checkbox" checked={fin} onChange={() => toggleFinished(code)} /> terminé
                            </label>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </details>
            </form>
          )}
        </div>
        <div className="mfoot" style={{ justifyContent: onDelete ? "space-between" : "flex-end" }}>
          {onDelete && <button type="button" className="btn ghost danger" onClick={onDelete}>Supprimer le stagiaire</button>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" form="stagiaire-form" className="btn primary" disabled={saving || loading || noteTropLongue}>
              {saving ? "Enregistrement…" : id ? "Enregistrer" : "Ajouter le stagiaire"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditStagiaireModal;
