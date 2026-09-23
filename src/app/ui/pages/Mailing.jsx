import { useEffect, useRef, useState } from "react";
import {
  getOrganisation, updateOrganisation, getModelesMail, saveModeleMail, resetModeleMail,
  apercuMail, destinatairesMail, envoyerMailGroupe, getEnvoisMail, getSessions, getFormations,
  getReglesMail, creerRegleMail, modifierRegleMail, supprimerRegleMail,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { Squelette } from "../components/Squelette.jsx";
import { dateHeure } from "../lib/format.js";

/**
 * MAILING — les e-mails de l'école : ceux qui partent tout seuls, et ceux qu'elle écrit.
 *
 * TROIS ONGLETS, TROIS QUESTIONS :
 *   · ENVOIS AUTOMATIQUES — lesquels partent (les interrupteurs, migration 138) ;
 *   · TEXTES — ce qu'ils disent, réécrit par l'école (migration 178) ;
 *   · ÉCRIRE À UN GROUPE — un message, une fois, à des stagiaires choisis.
 *
 * CE QUI N'EST PAS MODIFIABLE EST DIT, pas caché : la charpente d'un e-mail (l'encadré des
 * identifiants, le bouton, le garde-fou d'une alerte de sécurité) reste au code. Une école qui
 * réécrirait tout pourrait envoyer une alerte sans son « ce n'était pas moi », et ne s'en
 * apercevrait qu'à la plainte.
 *
 * L'APERÇU VIENT DU SERVEUR, rendu par les VRAIS gabarits : c'est l'e-mail qui partira, pas une
 * imitation. Il s'affiche dans une `iframe` en bac à sable — du HTML d'e-mail injecté dans la
 * page emporterait ses styles avec lui.
 */
const MAILS = [
  ["mail_credentials", "Compte créé — identifiants de connexion", "Au stagiaire quand un compte lui est créé, ou au représentant d'une entreprise quand son accès est ouvert (avec ses identifiants)."],
  ["mail_reset", "Réinitialisation du mot de passe", "Quand vous réinitialisez le mot de passe d'un stagiaire depuis sa fiche."],
  ["mail_forgot", "Lien « mot de passe oublié »", "Quand un utilisateur demande lui-même à réinitialiser son mot de passe."],
  ["mail_security", "Alerte de sécurité (changement d'e-mail / mot de passe)", "Prévient la personne d'un changement, avec un lien « ce n'était pas moi ». Le couper retire ce garde-fou."],
  ["mail_notifications", "Notifications par e-mail", "Double par e-mail les notifications importantes adressées à une personne."],
];

function Mailing() {
  const [onglet, setOnglet] = useState("envois");
  const [status, setStatus] = useState(null);

  return (
    <>
      <PageHead eyebrow="Organisme" title="Mailing"
        lead="Ce que l'école envoie par e-mail : ce qui part tout seul, ce que ça dit, et ce qu'elle écrit elle-même." />
      <StatusMessage status={status} />
      <div className="tabs tabs-defilantes" role="tablist">
        <button type="button" role="tab" aria-selected={onglet === "envois"}
          className={"tab" + (onglet === "envois" ? " on" : "")} onClick={() => { setOnglet("envois"); setStatus(null); }}>
          Envois automatiques
        </button>
        <button type="button" role="tab" aria-selected={onglet === "textes"}
          className={"tab" + (onglet === "textes" ? " on" : "")} onClick={() => { setOnglet("textes"); setStatus(null); }}>
          Textes des e-mails
        </button>
        <button type="button" role="tab" aria-selected={onglet === "groupe"}
          className={"tab" + (onglet === "groupe" ? " on" : "")} onClick={() => { setOnglet("groupe"); setStatus(null); }}>
          Écrire à un groupe
        </button>
        <button type="button" role="tab" aria-selected={onglet === "programmes"}
          className={"tab" + (onglet === "programmes" ? " on" : "")} onClick={() => { setOnglet("programmes"); setStatus(null); }}>
          Envois programmés
        </button>
      </div>
      {onglet === "envois" && <Interrupteurs onStatus={setStatus} />}
      {onglet === "textes" && <Textes onStatus={setStatus} />}
      {onglet === "groupe" && <Groupe onStatus={setStatus} />}
      {onglet === "programmes" && <Programmes onStatus={setStatus} />}
    </>
  );
}

/* ── 1. Les interrupteurs (migration 138) ──────────────────────────────────────────────────── */
function Interrupteurs({ onStatus }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOrganisation().then((r) => setForm(r.data)).catch((e) => onStatus({ type: "error", message: e.message }));
  }, [onStatus]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    onStatus(null);
    try {
      // On n'envoie QUE les cinq interrupteurs : updateOrganisation ignore les champs absents,
      // inutile de renvoyer toute la fiche organisme depuis cet écran.
      const payload = Object.fromEntries(MAILS.map(([k]) => [k, form[k] !== 0 ? 1 : 0]));
      await updateOrganisation(payload);
      onStatus({ type: "success", message: "Réglages d'e-mails enregistrés." });
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <Squelette lignes={3} h={56} />;
  return (
    <Card title="E-mails automatiques">
      <form onSubmit={save}>
        <p className="sub" style={{ marginTop: 0 }}>
          Décocher un type en coupe l'envoi — côté serveur aussi, pas seulement l'affichage.
          Sans SMTP configuré, aucun e-mail ne part de toute façon.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "4px 0 16px" }}>
          {MAILS.map(([k, label, hint]) => (
            <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              {/* `!== 0` et non `!!` : une colonne absente (migration non jouée) ou NULL vaut
                  « activé », comme le serveur. Seul un 0 explicite décoche la case. */}
              <input type="checkbox" style={{ marginTop: 3 }}
                checked={form[k] !== 0}
                onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.checked ? 1 : 0 }))} />
              <span>
                {label}
                <span className="sub" style={{ display: "block", fontSize: 11.5 }}>{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </Card>
  );
}

/* ── 2. Les textes (migration 178) ─────────────────────────────────────────────────────────── */
function Textes({ onStatus }) {
  const [liste, setListe] = useState(null);
  const [indispo, setIndispo] = useState(null);
  const [ouvert, setOuvert] = useState(null);

  const charger = () => getModelesMail()
    .then((r) => { setListe(r.data || []); setIndispo(r.disponible === false ? r.message : null); })
    .catch((e) => onStatus({ type: "error", message: e.message }));
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!liste) return <Squelette lignes={4} h={64} />;
  return (
    <>
      {indispo && <p className="hint" style={{ margin: "0 0 12px" }}><Icon name="info" size={12} /> {indispo}</p>}
      {liste.map((m) => (
        <Card key={m.cle} style={{ marginBottom: 12 }}
          title={<span className="card-ttl"><Icon name="mail" size={15} /> {m.libelle}</span>}
          more={m.perso
            ? <span className="badge b">Texte de l'école</span>
            : <span className="badge n">Texte d'origine</span>}>
          {ouvert === m.cle ? (
            <Editeur modele={m} onFerme={() => setOuvert(null)}
              onEnregistre={() => { setOuvert(null); charger(); }} onStatus={onStatus} />
          ) : (
            <>
              <p className="hint" style={{ margin: "0 0 8px" }}><b>Objet :</b> {m.valeurs.objet}</p>
              <p className="hint" style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{m.valeurs.intro}</p>
              <button type="button" className="btn sm" onClick={() => setOuvert(m.cle)} disabled={!!indispo}>
                <Icon name="edit" size={13} /> Modifier le texte
              </button>
            </>
          )}
        </Card>
      ))}
    </>
  );
}

function Editeur({ modele, onFerme, onEnregistre, onStatus }) {
  const [v, setV] = useState(modele.valeurs);
  const [busy, setBusy] = useState(false);
  const [apercu, setApercu] = useState(null);
  const dernier = useRef(null);

  const maj = (champ) => (e) => setV((p) => ({ ...p, [champ]: e.target.value }));

  /* LE JETON S'INSÈRE LÀ OÙ EST LE CURSEUR, pas à la fin : on l'ajoute au milieu d'une phrase
     bien plus souvent qu'au bout. */
  function insererJeton(champ, jeton) {
    const el = dernier.current;
    setV((p) => {
      const texte = p[champ] || "";
      const pos = el && el.name === champ ? el.selectionStart : texte.length;
      return { ...p, [champ]: `${texte.slice(0, pos)}{${jeton}}${texte.slice(pos)}` };
    });
  }

  async function voir() {
    onStatus(null);
    try { setApercu((await apercuMail({ cle: modele.cle, ...v })).data); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }

  async function enregistrer() {
    setBusy(true); onStatus(null);
    try {
      await saveModeleMail(modele.cle, v);
      onStatus({ type: "success", message: "Texte enregistré : les prochains e-mails partiront avec." });
      onEnregistre();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }

  async function revenir() {
    if (!window.confirm("Revenir au texte livré avec l'application ? Votre version sera perdue.")) return;
    setBusy(true); onStatus(null);
    try {
      await resetModeleMail(modele.cle);
      onStatus({ type: "success", message: "Texte d'origine rétabli." });
      onEnregistre();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }

  const zone = (champ, label, lignes) => (
    <div className="field">
      <label htmlFor={`mail-${modele.cle}-${champ}`}>{label}</label>
      {lignes === 1 ? (
        <input id={`mail-${modele.cle}-${champ}`} name={champ} className="inp" value={v[champ] || ""}
          onChange={maj(champ)} onFocus={(e) => { dernier.current = e.target; }}
          onBlur={(e) => { dernier.current = e.target; }} />
      ) : (
        <textarea id={`mail-${modele.cle}-${champ}`} name={champ} className="inp" rows={lignes}
          value={v[champ] || ""} onChange={maj(champ)}
          onFocus={(e) => { dernier.current = e.target; }} onBlur={(e) => { dernier.current = e.target; }} />
      )}
    </div>
  );

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        <Icon name="info" size={12} /> {modele.charpente}
      </p>
      <div className="mail-jetons">
        {modele.jetons.map((j) => (
          <button key={j} type="button" className="btn ghost sm"
            onClick={() => insererJeton(dernier.current?.name || "intro", j)}>{`{${j}}`}</button>
        ))}
        <span className="hint">Cliquez pour insérer dans le champ où vous écriviez.</span>
      </div>
      {zone("objet", "Objet de l'e-mail", 1)}
      {zone("titre", "Titre (première ligne du message)", 1)}
      {zone("intro", "Texte avant", 5)}
      {zone("pied", "Note après (facultatif)", 3)}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" className="btn sm" onClick={voir}><Icon name="eye" size={13} /> Aperçu</button>
        <span style={{ flex: 1 }} />
        {modele.perso && (
          <button type="button" className="btn ghost sm" onClick={revenir} disabled={busy}>
            Revenir au texte d'origine
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={onFerme}>Annuler</button>
        <button type="button" className="btn primary sm" onClick={enregistrer} disabled={busy}>
          {busy ? "…" : "Enregistrer"}
        </button>
      </div>
      {apercu && <Apercu rendu={apercu} />}
    </div>
  );
}

/* L'e-mail rendu par le serveur, dans un cadre isolé. `sandbox` vide : aucun script, aucune
   navigation — c'est un aperçu, il ne doit rien pouvoir faire. */
function Apercu({ rendu }) {
  return (
    <div className="mail-apercu">
      <b><Icon name="eye" size={13} /> Aperçu — objet : {rendu.subject}</b>
      <iframe title="Aperçu de l'e-mail" sandbox="" srcDoc={rendu.html} />
    </div>
  );
}

/* ── 3. Écrire à un groupe (migration 178) ─────────────────────────────────────────────────── */
function Groupe({ onStatus }) {
  const [type, setType] = useState("session");
  const [id, setId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [formations, setFormations] = useState([]);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [cibles, setCibles] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [journal, setJournal] = useState([]);

  useEffect(() => {
    getSessions().then((r) => setSessions(r.data || [])).catch(() => {});
    getFormations().then((r) => setFormations(r.data || [])).catch(() => {});
    getEnvoisMail().then((r) => setJournal(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setCibles(null);
    if (!id) return;
    destinatairesMail({ type, id }).then((r) => setCibles(r.data)).catch((e) => onStatus({ type: "error", message: e.message }));
  }, [type, id, onStatus]);

  const choix = type === "session" ? sessions : formations;
  const nom = (o) => (type === "session"
    ? `${o.code || o.title || "Session"} — ${o.start_date || ""}`
    : `${o.code ? `${o.code} — ` : ""}${o.title || ""}`);

  async function voir() {
    onStatus(null);
    try { setApercu((await apercuMail({ objet, corps })).data); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }

  async function envoyer() {
    const n = cibles?.destinataires?.length || 0;
    if (!window.confirm(`Envoyer ce message à ${n} stagiaire${n > 1 ? "s" : ""} ? L'envoi part tout de suite et ne se rattrape pas.`)) return;
    setBusy(true); onStatus(null);
    try {
      const r = await envoyerMailGroupe({ type, id, objet, corps });
      const d = r.data;
      onStatus({ type: d.echecs ? "info" : "success",
        message: d.echecs
          ? `${d.envoyes} envoyé(s), ${d.echecs} en échec — les adresses en échec sont à vérifier.`
          : `${d.envoyes} e-mail(s) envoyé(s).` });
      setObjet(""); setCorps(""); setApercu(null);
      getEnvoisMail().then((x) => setJournal(x.data || [])).catch(() => {});
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }

  const pret = objet.trim() && corps.trim() && (cibles?.destinataires?.length || 0) > 0;
  return (
    <>
      <Card title={<span className="card-ttl"><Icon name="send" size={15} /> Écrire à un groupe</span>}>
        {/* CE QUE CET ÉCRAN N'EST PAS, dit avant qu'on s'en serve. Un message commercial se
            heurterait au consentement du stagiaire, qui a son registre et ses règles. */}
        <p className="hint" style={{ marginTop: 0 }}>
          Pour les messages <b>liés à la formation</b> : convocation, rappel, document à signer,
          information pratique. Pas de démarchage — une offre commerciale relève du consentement
          du stagiaire, qui se recueille ailleurs.
        </p>

        <div className="row2" style={{ alignItems: "flex-start" }}>
          <div className="field">
            <label htmlFor="mail-type">À qui</label>
            <select id="mail-type" className="inp" value={type} onChange={(e) => { setType(e.target.value); setId(""); }}>
              <option value="session">Les inscrits d'une session</option>
              <option value="formation">Tous les inscrits d'une formation</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="mail-cible">{type === "session" ? "Session" : "Formation"}</label>
            <select id="mail-cible" className="inp" value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Choisir…</option>
              {choix.map((o) => <option key={o.id} value={o.id}>{nom(o)}</option>)}
            </select>
          </div>
        </div>

        {cibles && (
          <p className="hint" style={{ margin: "0 0 10px" }}>
            <b>{cibles.destinataires.length}</b> destinataire{cibles.destinataires.length > 1 ? "s" : ""}
            {cibles.sans_email.length > 0 && (
              <> · <b>{cibles.sans_email.length}</b> sans adresse e-mail ({cibles.sans_email.join(", ")}) —
                leur fiche est à compléter, ils ne recevront rien.</>
            )}
            {!cibles.envoi_possible && <> · <b>Aucun SMTP configuré</b> : rien ne peut partir.</>}
          </p>
        )}

        <div className="mail-jetons">
          {["Prénom", "Nom", "Organisme"].map((j) => (
            <button key={j} type="button" className="btn ghost sm"
              onClick={() => setCorps((c) => `${c}{${j}}`)}>{`{${j}}`}</button>
          ))}
          <span className="hint">Insérés à la fin du message.</span>
        </div>
        <div className="field">
          <label htmlFor="mail-objet">Objet</label>
          <input id="mail-objet" className="inp" value={objet} onChange={(e) => setObjet(e.target.value)}
            placeholder="Rappel : votre session démarre lundi" />
        </div>
        <div className="field">
          <label htmlFor="mail-corps">Message</label>
          <textarea id="mail-corps" className="inp" rows={8} value={corps} onChange={(e) => setCorps(e.target.value)}
            placeholder={"Bonjour {Prénom},\n\nVotre session démarre lundi à 9 h au 12 rue des Pizzaiolos.\n\nÀ lundi !"} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={voir} disabled={!objet.trim() || !corps.trim()}>
            <Icon name="eye" size={13} /> Aperçu
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primary sm" onClick={envoyer} disabled={!pret || busy || !cibles?.envoi_possible}>
            <Icon name="send" size={13} /> {busy ? "Envoi…" : `Envoyer${cibles ? ` à ${cibles.destinataires.length}` : ""}`}
          </button>
        </div>
        {apercu && <Apercu rendu={apercu} />}
      </Card>

      {journal.length > 0 && (
        <Card title="Déjà envoyés" style={{ marginTop: 12 }}>
          <ul className="mail-journal">
            {journal.map((e) => (
              <li key={e.id}>
                <span className="chiffres hint">{dateHeure(e.quand)}</span>
                <b>{e.objet}</b>
                <span className="hint">{e.cible} · {e.destinataires} envoyé{e.destinataires > 1 ? "s" : ""}
                  {e.echecs > 0 && <> · {e.echecs} en échec</>}</span>
                {e.par && <span className="hint">· {e.par}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/* ── 4. Les envois programmés (migration 179) ──────────────────────────────────────────────── */
/**
 * UNE RÈGLE PART TOUTE SEULE, ENSUITE, SANS QUE PERSONNE NE LA RELISE — c'est ce qui la rend
 * utile, et c'est aussi ce qui demande que l'écran soit franc : la phrase en clair (« 3 mois
 * après la fin de la session »), ce qu'elle a déjà envoyé, et le fait qu'elle ne rattrape pas le
 * passé. Une règle qu'on croit inactive et qui écrit à des stagiaires est le pire défaut possible
 * de cet écran.
 */
function Programmes({ onStatus }) {
  const [regles, setRegles] = useState(null);
  const [cat, setCat] = useState(null);
  const [indispo, setIndispo] = useState(null);
  const [formations, setFormations] = useState([]);
  const [edite, setEdite] = useState(null); // règle en cours d'édition, ou "neuve"

  const charger = () => getReglesMail()
    .then((r) => { setRegles(r.data || []); setCat(r.catalogue || null); setIndispo(r.disponible === false ? r.message : null); })
    .catch((e) => onStatus({ type: "error", message: e.message }));
  useEffect(() => {
    charger();
    getFormations().then((r) => setFormations(r.data || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function supprimer(r) {
    if (!window.confirm(`Supprimer « ${r.nom} » ? La mémoire de ce qui a déjà été envoyé part avec.`)) return;
    try { await supprimerRegleMail(r.id); onStatus({ type: "success", message: "Règle supprimée." }); charger(); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }

  async function basculer(r) {
    try {
      await modifierRegleMail(r.id, { ...r, actif: !r.actif });
      charger();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
  }

  if (!regles || !cat) return <Squelette lignes={3} h={72} />;
  return (
    <>
      <Card title={<span className="card-ttl"><Icon name="clock" size={15} /> Envois programmés</span>}
        more={!edite && !indispo && (
          <button type="button" className="btn sm primary" onClick={() => setEdite("neuve")}>
            <Icon name="plus" size={13} /> Nouvelle règle
          </button>
        )}>
        {indispo && <p className="hint" style={{ marginTop: 0 }}><Icon name="info" size={12} /> {indispo}</p>}
        <p className="hint" style={{ marginTop: 0 }}>
          Un e-mail qui part tout seul, une fois par stagiaire, à une date calculée : «&nbsp;3 mois
          après la fin de la session&nbsp;», «&nbsp;7 jours avant le début&nbsp;». <b>Une règle ne
          rattrape jamais le passé</b> : elle ne vaut que pour les dates atteintes après sa création.
        </p>

        {edite && (
          <EditeurRegle regle={edite === "neuve" ? null : edite} cat={cat} formations={formations}
            onFerme={() => setEdite(null)} onEnregistre={() => { setEdite(null); charger(); }} onStatus={onStatus} />
        )}

        {!edite && (regles.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucune règle pour l'instant.</p>
        ) : (
          <ul className="mail-regles">
            {regles.map((r) => (
              <li key={r.id} className={r.actif ? "" : "off"}>
                <div>
                  <b>{r.nom}</b>
                  <span className="hint">
                    {r.phrase}
                    {r.formation_code || r.formation_titre ? ` · ${r.formation_code || r.formation_titre}` : " · toutes les formations"}
                    {" · depuis le "}{r.depuis}
                  </span>
                  <span className="hint">
                    {r.envoyes > 0 ? `${r.envoyes} envoyé${r.envoyes > 1 ? "s" : ""}` : "aucun envoi pour l'instant"}
                    {r.echecs > 0 && ` · ${r.echecs} en échec`}
                    {r.dernier && ` · dernier le ${r.dernier}`}
                  </span>
                </div>
                <span className="mail-regle-actions">
                  <button type="button" className={"btn sm" + (r.actif ? "" : " ghost")} onClick={() => basculer(r)}>
                    {r.actif ? "Active" : "En pause"}
                  </button>
                  <button type="button" className="btn sm ghost" onClick={() => setEdite(r)}>Modifier</button>
                  <button type="button" className="btn sm ghost" onClick={() => supprimer(r)} aria-label={`Supprimer ${r.nom}`}>
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ))}
      </Card>
    </>
  );
}

function EditeurRegle({ regle, cat, formations, onFerme, onEnregistre, onStatus }) {
  const [v, setV] = useState(() => regle || {
    nom: "", declencheur: "fin_session", sens: "apres", decalage: 3, unite: "mois",
    program_id: null, objet: "", corps: "", actif: 1,
  });
  const [busy, setBusy] = useState(false);
  const [apercu, setApercu] = useState(null);
  const maj = (champ) => (e) => setV((p) => ({ ...p, [champ]: e.target.value }));

  async function voir() {
    onStatus(null);
    try { setApercu((await apercuMail({ objet: v.objet, corps: v.corps })).data); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }

  async function enregistrer() {
    setBusy(true); onStatus(null);
    try {
      const payload = { ...v, decalage: Number(v.decalage) || 0, program_id: v.program_id || null, actif: v.actif !== 0 };
      if (regle) await modifierRegleMail(regle.id, payload); else await creerRegleMail(payload);
      onStatus({ type: "success", message: regle ? "Règle enregistrée." : "Règle créée : elle vaut pour les dates atteintes à partir d'aujourd'hui." });
      onEnregistre();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="mail-regle-form">
      <div className="field">
        <label htmlFor="regle-nom">Nom de la règle</label>
        <input id="regle-nom" className="inp" value={v.nom} onChange={maj("nom")}
          placeholder="Suivi à froid — 3 mois" />
      </div>
      <div className="mail-regle-quand">
        <div className="field">
          <label htmlFor="regle-decalage">Combien</label>
          <input id="regle-decalage" className="inp" type="number" min="0" value={v.decalage} onChange={maj("decalage")} />
        </div>
        <div className="field">
          <label htmlFor="regle-unite">Unité</label>
          <select id="regle-unite" className="inp" value={v.unite} onChange={maj("unite")}>
            {cat.unites.map((u) => <option key={u.cle} value={u.cle}>{u.libelle}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="regle-sens">Avant ou après</label>
          <select id="regle-sens" className="inp" value={v.sens} onChange={maj("sens")}>
            {cat.sens.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="regle-declencheur">Quelle date</label>
          <select id="regle-declencheur" className="inp" value={v.declencheur} onChange={maj("declencheur")}>
            {cat.declencheurs.map((d) => <option key={d.cle} value={d.cle}>{d.libelle}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="regle-formation">Formation</label>
          <select id="regle-formation" className="inp" value={v.program_id || ""}
            onChange={(e) => setV((p) => ({ ...p, program_id: e.target.value || null }))}>
            <option value="">Toutes les formations</option>
            {formations.map((f) => <option key={f.id} value={f.id}>{f.code ? `${f.code} — ` : ""}{f.title}</option>)}
          </select>
        </div>
      </div>
      <div className="mail-jetons">
        {cat.jetons.map((j) => (
          <button key={j} type="button" className="btn ghost sm"
            onClick={() => setV((p) => ({ ...p, corps: `${p.corps}{${j}}` }))}>{`{${j}}`}</button>
        ))}
        <span className="hint">Insérés à la fin du message.</span>
      </div>
      <div className="field">
        <label htmlFor="regle-objet">Objet</label>
        <input id="regle-objet" className="inp" value={v.objet} onChange={maj("objet")}
          placeholder="Comment se passe la suite, {Prénom} ?" />
      </div>
      <div className="field">
        <label htmlFor="regle-corps">Message</label>
        <textarea id="regle-corps" className="inp" rows={7} value={v.corps} onChange={maj("corps")}
          placeholder={"Bonjour {Prénom},\n\nVous avez terminé {Formation} il y a trois mois. Où en êtes-vous de votre projet ?"} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn sm" onClick={voir} disabled={!v.objet.trim() || !v.corps.trim()}>
          <Icon name="eye" size={13} /> Aperçu
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" onClick={onFerme}>Annuler</button>
        <button type="button" className="btn primary sm" onClick={enregistrer} disabled={busy}>
          {busy ? "…" : regle ? "Enregistrer" : "Créer la règle"}
        </button>
      </div>
      {apercu && <Apercu rendu={apercu} />}
    </div>
  );
}

export default Mailing;
