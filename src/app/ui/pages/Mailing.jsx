import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOrganisation, updateOrganisation, getModelesMail, saveModeleMail, resetModeleMail,
  apercuMail, destinatairesMail, envoyerMailGroupe, getEnvoisMail, getSessions, getFormations,
  getReglesMail, creerRegleMail, modifierRegleMail, supprimerRegleMail,
  televerserImageMail, getImagesMail, supprimerImageMail, API_BASE_URL,
  getStagiaires, getCompanies,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { Squelette } from "../components/Squelette.jsx";
import { dateHeure } from "../lib/format.js";
import { reduireSiImage, PROFILS } from "../lib/image.js";

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

/**
 * LA BARRE D'INSERTION — jetons, lien nommé, image. Commune aux messages écrits par l'école.
 *
 * TOUT S'INSÈRE EN TEXTE, et c'est ce qui rend l'ensemble tenable : le message reste une chaîne
 * qu'on relit et corrige à la main, pas un document HTML qu'un éditeur riche aurait produit et
 * qu'aucun client mail ne rendrait pareil.
 *
 * LE LIEN DEMANDE DEUX CHOSES, dans cet ordre : les MOTS puis l'adresse. On écrit « cliquez
 * ICI », on colle l'adresse, et le marqueur `[ICI](https://…)` part dans le texte — c'est lui
 * qu'on relit, et il se corrige comme le reste.
 */
function BarreInsertion({ jetons, onInserer, onStatus }) {
  const fichierRef = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  /* LA BIBLIOTHÈQUE EST REPLIÉE PAR DÉFAUT, et c'est elle qui justifie la table : une école
     réutilise son affiche ou son logo d'un message à l'autre. Sans elle, chaque envoi
     redéposerait le même fichier, et la base grossirait d'autant de copies. */
  const [biblio, setBiblio] = useState(null); // null = jamais ouverte
  const voirBiblio = () => (biblio
    ? setBiblio(null)
    : getImagesMail().then((r) => setBiblio(r.data || [])).catch((e) => onStatus?.({ type: "error", message: e.message })));

  async function retirer(img) {
    if (!window.confirm(`Retirer « ${img.nom} » de la bibliothèque ? Les messages déjà envoyés la gardent.`)) return;
    try {
      await supprimerImageMail(img.id);
      setBiblio((l) => (l || []).filter((x) => x.id !== img.id));
      onStatus?.({ type: "success", message: "Image retirée." });
    } catch (e) { onStatus?.({ type: "error", message: e.message }); }
  }

  function poserLien() {
    const mots = window.prompt("Quels mots seront cliquables ?", "ICI");
    if (!mots) return;
    const url = window.prompt("Adresse du lien (https://…)", "https://");
    if (!url) return;
    if (!/^https?:\/\//i.test(url.trim())) {
      onStatus?.({ type: "error", message: "L'adresse doit commencer par http:// ou https://." });
      return;
    }
    onInserer(`[${mots.trim()}](${url.trim()})`);
  }

  async function choisirImage(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnvoi(true);
    onStatus?.(null);
    try {
      /* RÉDUITE AVANT L'ENVOI : le serveur plafonne à 600 Ko, une photo de téléphone en pèse
         3 à 5 — elle repartait en 413 sans que rien n'explique quoi faire. Et l'image voyage
         en PIÈCE JOINTE avec CHAQUE message du groupe : son poids se multiplie par le nombre
         de destinataires. */
      const r = await televerserImageMail(await reduireSiImage(f, PROFILS.mail));
      onInserer(`![${r.data.nom || "image"}](image:${r.data.id})`);
      onStatus?.({ type: "success", message: "Image ajoutée : elle partira avec le message." });
    } catch (err) { onStatus?.({ type: "error", message: err.message }); }
    finally { setEnvoi(false); }
  }

  return (
    <div className="mail-jetons">
      {jetons.map((j) => (
        <button key={j} type="button" className="btn ghost sm" onClick={() => onInserer(`{${j}}`)}>{`{${j}}`}</button>
      ))}
      <button type="button" className="btn ghost sm" onClick={poserLien}>
        <Icon name="link" size={13} /> Lien
      </button>
      <button type="button" className="btn ghost sm" onClick={() => fichierRef.current?.click()} disabled={envoi}>
        <Icon name="image" size={13} /> {envoi ? "Envoi…" : "Image"}
      </button>
      <button type="button" className="btn ghost sm" onClick={voirBiblio}>
        {biblio ? "Fermer la bibliothèque" : "Bibliothèque"}
      </button>
      <input ref={fichierRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={choisirImage} style={{ display: "none" }} aria-hidden="true" tabIndex={-1} />
      <span className="hint">Insérés à la fin du message.</span>
      {biblio && (
        <div className="mail-biblio">
          {biblio.length === 0 ? (
            <span className="hint">Aucune image déposée.</span>
          ) : biblio.map((img) => (
            <span key={img.id} className="mail-biblio-vignette">
              {/* La vignette passe par l'API (authentifiée) ; l'aperçu de l'e-mail, lui, porte
                  l'image en `data:` — son iframe en bac à sable ne peut rien aller chercher. */}
              <button type="button" title={`Insérer « ${img.nom} »`}
                onClick={() => onInserer(`![${img.nom}](image:${img.id})`)}>
                <img src={`${API_BASE_URL}/mailing/images/${img.id}`} alt={img.nom} />
              </button>
              <button type="button" className="mail-biblio-x" onClick={() => retirer(img)}
                aria-label={`Retirer ${img.nom}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 3. Écrire à un groupe (migration 178) ─────────────────────────────────────────────────── */
function Groupe({ onStatus }) {
  const [type, setType] = useState("session");
  const [id, setId] = useState("");
  /* UNE SEMAINE SE DÉSIGNE PAR DEUX NOMBRES, pas par un identifiant : « S38 — 2026 » n'est pas
     une ligne en base, c'est ce qu'ont en commun les sessions de ces jours-là. */
  const [semaine, setSemaine] = useState("");
  /* CEUX QU'ON RETIRE DE L'ENVOI. On part de « tout le monde » : décocher est un geste rare, et
     une liste qu'il faudrait cocher personne par personne ferait manquer quelqu'un. */
  const [ecartes, setEcartes] = useState(() => new Set());
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
    setEcartes(new Set());
    const quoi = type === "semaine"
      ? (semaine ? { type, annee: Number(semaine.split("-")[0]), semaine: Number(semaine.split("-")[1]) } : null)
      : (id ? { type, id } : null);
    if (!quoi) return;
    destinatairesMail(quoi).then((r) => setCibles(r.data)).catch((e) => onStatus({ type: "error", message: e.message }));
  }, [type, id, semaine, onStatus]);

  /* LES SEMAINES QUI ONT DES SESSIONS, tirées des sessions elles-mêmes : proposer les
     cinquante-deux semaines de l'année ferait chercher les trois qui comptent. */
  const semaines = useMemo(() => {
    const m = new Map();
    for (const s of sessions) {
      if (!s.week || !s.year) continue;
      const cle = `${s.year}-${s.week}`;
      m.set(cle, (m.get(cle) || 0) + 1);
    }
    return [...m.entries()]
      .map(([cle, n]) => ({ cle, annee: Number(cle.split("-")[0]), sem: Number(cle.split("-")[1]), n }))
      .sort((a, b) => (b.annee - a.annee) || (b.sem - a.sem));
  }, [sessions]);

  const retenus = (cibles?.destinataires || []).filter((d) => !ecartes.has(d.id));
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
    const n = retenus.length;
    if (!window.confirm(`Envoyer ce message à ${n} stagiaire${n > 1 ? "s" : ""} ? L'envoi part tout de suite et ne se rattrape pas.`)) return;
    setBusy(true); onStatus(null);
    try {
      /* ON GARDE LA CIBLE D'ORIGINE tant que personne n'est écarté : le journal dit alors
         « Semaine 38 — 2026 (2 sessions) », ce qui se relit. Dès qu'on décoche, l'envoi porte la
         liste des personnes — le serveur ne saurait pas deviner lesquelles on a retirées. */
      const cible = ecartes.size === 0
        ? (type === "semaine"
          ? { type, annee: Number(semaine.split("-")[0]), semaine: Number(semaine.split("-")[1]) }
          : { type, id })
        : { type: "stagiaires", ids: retenus.map((d) => d.id) };
      const r = await envoyerMailGroupe({ ...cible, objet, corps });
      const d = r.data;
      const comment = d.mode === "cci" ? " en un seul envoi, adresses masquées" : "";
      onStatus({ type: d.echecs ? "info" : "success",
        message: d.echecs
          ? `${d.envoyes} envoyé(s), ${d.echecs} en échec — les adresses en échec sont à vérifier.`
          : `${d.envoyes} destinataire(s)${comment}.${d.copie ? " Une copie est partie à l'école." : ""}` });
      setObjet(""); setCorps(""); setApercu(null);
      getEnvoisMail().then((x) => setJournal(x.data || [])).catch(() => {});
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }

  const pret = objet.trim() && corps.trim() && retenus.length > 0;
  /* COMMENT CE MESSAGE PARTIRA, dit AVANT de l'envoyer — et c'est le message lui-même qui décide.
     La même règle qu'au serveur : un texte qui porte {Prénom} ou {Nom} ne peut pas partir en une
     seule fois, puisqu'un envoi en copie cachée n'a qu'un seul corps pour tout le monde. */
  const personnalise = /\{(Prénom|Nom)\}/.test(`${objet} ${corps}`);
  const nbDest = retenus.length;
  const enCci = !personnalise && nbDest > 1 && !!cibles?.copie_ecole;
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
            <select id="mail-type" className="inp" value={type}
              onChange={(e) => { setType(e.target.value); setId(""); setSemaine(""); }}>
              <option value="session">Les inscrits d'une session</option>
              {/* LA SEMAINE, parce que c'est ainsi que l'école voit son planning : la S38 porte
                  deux sessions et cinq personnes, et on leur écrit UNE fois. */}
              <option value="semaine">Tous les inscrits d'une semaine</option>
              <option value="formation">Tous les inscrits d'une formation</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="mail-cible">
              {type === "session" ? "Session" : type === "semaine" ? "Semaine" : "Formation"}
            </label>
            {type === "semaine" ? (
              <select id="mail-cible" className="inp" value={semaine} onChange={(e) => setSemaine(e.target.value)}>
                <option value="">Choisir…</option>
                {semaines.map((w) => (
                  <option key={w.cle} value={w.cle}>
                    S{w.sem} — {w.annee} ({w.n} session{w.n > 1 ? "s" : ""})
                  </option>
                ))}
              </select>
            ) : (
              <select id="mail-cible" className="inp" value={id} onChange={(e) => setId(e.target.value)}>
                <option value="">Choisir…</option>
                {choix.map((o) => <option key={o.id} value={o.id}>{nom(o)}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* QUI VA RECEVOIR, NOMMÉMENT, ET DÉCOCHABLE. Une session porte parfois quelqu'un à qui
            ce message-là ne s'adresse pas (il a déjà répondu, il est parti) : sans la liste, il
            fallait renoncer à l'envoi groupé et écrire à la main. On part de tout le monde
            coché — décocher est le geste rare. */}
        {cibles && cibles.destinataires.length > 0 && (
          <details className="mail-destinataires">
            <summary>
              Voir et choisir les destinataires
              <span className="arch-count">{retenus.length} sur {cibles.destinataires.length}</span>
            </summary>
            <div className="mail-destinataires-liste">
              {cibles.destinataires.map((d) => (
                <label key={d.id} className={ecartes.has(d.id) ? "off" : ""}>
                  <input type="checkbox" checked={!ecartes.has(d.id)}
                    onChange={() => setEcartes((e) => {
                      const n2 = new Set(e);
                      if (n2.has(d.id)) n2.delete(d.id); else n2.add(d.id);
                      return n2;
                    })} />
                  <span>{d.nom}</span>
                  <span className="hint">{d.email}</span>
                </label>
              ))}
            </div>
          </details>
        )}

        {cibles && (
          <p className="hint" style={{ margin: "0 0 10px" }}>
            <b>{retenus.length}</b> destinataire{retenus.length > 1 ? "s" : ""}
            {cibles.sans_email.length > 0 && (
              <> · <b>{cibles.sans_email.length}</b> sans adresse e-mail ({cibles.sans_email.join(", ")}) —
                leur fiche est à compléter, ils ne recevront rien.</>
            )}
            {!cibles.envoi_possible && <> · <b>Aucun SMTP configuré</b> : rien ne peut partir.</>}
          </p>
        )}

        <BarreInsertion jetons={["Prénom", "Nom", "Organisme"]} onStatus={onStatus}
          onInserer={(txt) => setCorps((c) => `${c}${txt}`)} />
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
        {/* CE QUE LES DESTINATAIRES VERRONT LES UNS DES AUTRES : la question se pose avant
            l'envoi, jamais après. Un « Cc » n'existe pas ici — il exposerait l'adresse de chaque
            stagiaire à tous les autres. */}
        {nbDest > 0 && (
          <p className="hint" style={{ margin: "0 0 10px" }}>
            {enCci ? (
              <><Icon name="eye-off" size={12} /> Un <b>seul envoi</b>, tous les destinataires en
                <b> copie cachée</b>&nbsp;: personne ne voit l'adresse des autres.</>
            ) : personnalise ? (
              <><Icon name="info" size={12} /> Votre message contient <b>{"{Prénom}"}</b> ou <b>{"{Nom}"}</b>&nbsp;:
                il partira <b>une fois par personne</b>, chacune avec ses propres informations. Retirez ces
                jetons pour un envoi unique en copie cachée.</>
            ) : (
              <><Icon name="info" size={12} /> Un message par personne.</>
            )}
            {cibles?.copie_ecole
              ? <> Une <b>copie</b> part à <b>{cibles.copie_ecole}</b>.</>
              : <> Aucune copie pour l'école&nbsp;: renseignez son adresse dans Paramètres → Organisme.</>}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={voir} disabled={!objet.trim() || !corps.trim()}>
            <Icon name="eye" size={13} /> Aperçu
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primary sm" onClick={envoyer} disabled={!pret || busy || !cibles?.envoi_possible}>
            <Icon name="send" size={13} /> {busy ? "Envoi…" : `Envoyer${cibles ? ` à ${retenus.length}` : ""}`}
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
          Un e-mail qui part tout seul — à une date calculée («&nbsp;3&nbsp;mois après la fin&nbsp;»,
          «&nbsp;7&nbsp;jours avant le début&nbsp;»), ou dès qu'un document est envoyé ou signé.
          <b> Une règle ne rattrape jamais le passé</b> : elle ne vaut que pour ce qui arrive après
          sa création.
        </p>

        {edite && (
          <EditeurRegle regle={edite === "neuve" ? null : edite} cat={cat} formations={formations}
            onFerme={() => setEdite(null)} onEnregistre={() => { setEdite(null); charger(); }} onStatus={onStatus} />
        )}

        {!edite && (regles.length === 0 ? (
          <div className="mail-vide">
            <span className="mail-vide-ico"><Icon name="clock" size={22} /></span>
            <p>Aucune règle pour l'instant.</p>
            {!indispo && (
              <button type="button" className="btn sm primary" onClick={() => setEdite("neuve")}>
                <Icon name="plus" size={13} /> Créer la première
              </button>
            )}
          </div>
        ) : (
          <ul className="mail-regles">
            {regles.map((r) => {
              const doc = estDocDecl(cat, r.declencheur);
              return (
                <li key={r.id} className={"mail-regle" + (r.actif ? "" : " off")}>
                  <span className={"mail-regle-ico " + (doc ? "doc" : "date")} aria-hidden="true">
                    <Icon name={doc ? "file-text" : "calendar"} size={16} />
                  </span>
                  <div className="mail-regle-corps">
                    <b className="mail-regle-nom">{r.nom}</b>
                    <span className="mail-regle-phrase">
                      {r.phrase}
                      {doc && (r.modele_titre ? ` · ${r.modele_titre}` : " · tous les documents")}
                    </span>
                    <div className="mail-regle-tags">
                      <span className="chip"><Icon name="target" size={11} /> {cibleRegleTexte(r)}</span>
                      {r.destinataire && r.destinataire !== "stagiaire" && (
                        <span className="chip"><Icon name="send" size={11} /> {libelleDestinataireMail(r.destinataire)}</span>
                      )}
                      <span className="mail-regle-stat">
                        {r.envoyes > 0 ? `${r.envoyes} envoyé${r.envoyes > 1 ? "s" : ""}` : "aucun envoi pour l'instant"}
                        {r.echecs > 0 && ` · ${r.echecs} en échec`}
                        {r.dernier && ` · dernier le ${r.dernier}`}
                      </span>
                    </div>
                  </div>
                  <span className="mail-regle-actions">
                    <button type="button" className={"btn sm" + (r.actif ? "" : " ghost")} onClick={() => basculer(r)}
                      title={r.actif ? "Mettre en pause" : "Réactiver"}>
                      <Icon name={r.actif ? "pause" : "play"} size={12} /> {r.actif ? "Active" : "En pause"}
                    </button>
                    <button type="button" className="btn sm ghost" onClick={() => setEdite(r)}>
                      <Icon name="pencil" size={13} /> Modifier
                    </button>
                    <button type="button" className="btn sm ghost icone" onClick={() => supprimer(r)} aria-label={`Supprimer ${r.nom}`}>
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
      </Card>
    </>
  );
}

/* Un déclencheur d'ÉVÉNEMENT (document envoyé / signé, 196) ? L'écran cache alors le décalage et
   montre le modèle + le destinataire. */
const estDocDecl = (cat, d) => (cat?.declencheursDoc || []).some((x) => x.cle === d);
const libelleDestinataireMail = (d) => ({
  stagiaire: "au stagiaire", entreprise: "à l’entreprise", stagiaire_entreprise: "au stagiaire et à l’entreprise",
}[d] || "");
function cibleRegleTexte(r) {
  if (r.cible_stagiaire) return `pour ${r.cible_stagiaire}`;
  if (r.cible_entreprise) return `pour ${r.cible_entreprise}`;
  return (r.formation_code || r.formation_titre) ? (r.formation_code || r.formation_titre) : "toutes les formations";
}

/* La règle dite en une phrase VIVANTE, mise à jour à chaque frappe — « 3 mois après la fin de la
   session, au stagiaire, pour RS7404 ». Elle rassure : l'école voit ce qu'elle construit. */
function resumeRegle(v, cat, formations) {
  const est = estDocDecl(cat, v.declencheur);
  let quand;
  if (est) {
    const d = (cat.declencheursDoc || []).find((x) => x.cle === v.declencheur);
    const m = v.template_slug ? (cat.modeles || []).find((x) => x.slug === v.template_slug) : null;
    quand = `Quand ${d ? d.libelle : "un document change"}${m ? ` (${m.label})` : ""}`;
  } else {
    const d = (cat.declencheurs || []).find((x) => x.cle === v.declencheur);
    const n = Math.max(0, Math.round(Number(v.decalage) || 0));
    const u = (cat.unites || []).find((x) => x.cle === v.unite);
    const s = (cat.sens || []).find((x) => x.cle === v.sens);
    quand = n === 0 ? `Le jour de ${d ? d.libelle : "…"}` : `${n} ${u ? u.libelle : ""} ${s ? s.libelle : ""} ${d ? d.libelle : ""}`;
  }
  const dest = est ? libelleDestinataireMail(v.destinataire || "stagiaire") : "au stagiaire";
  let scope;
  if (v.learner_id) scope = v.cible_stagiaire || "un stagiaire";
  else if (v.company_id) scope = v.cible_entreprise || "une entreprise";
  else if (v.program_id) { const f = formations.find((x) => x.id === v.program_id); scope = f ? (f.code || f.title) : "une formation"; }
  else scope = "toutes les formations";
  return { est, quand, dest, scope };
}

function EditeurRegle({ regle, cat, formations, onFerme, onEnregistre, onStatus }) {
  const [v, setV] = useState(() => regle || {
    nom: "", declencheur: "fin_session", sens: "apres", decalage: 3, unite: "mois",
    program_id: null, template_slug: null, destinataire: "stagiaire",
    learner_id: null, company_id: null, objet: "", corps: "", actif: 1,
  });
  const [busy, setBusy] = useState(false);
  const [apercu, setApercu] = useState(null);
  const maj = (champ) => (e) => setV((p) => ({ ...p, [champ]: e.target.value }));
  const estDoc = estDocDecl(cat, v.declencheur);

  /* Bascule « date » ⇄ « document » : on garde le déclencheur s'il est déjà du bon type, sinon un
     défaut (la fin de session, ou « document signé »). */
  function choisirType(type) {
    setV((p) => {
      if (type === "document") {
        const dejaDoc = estDocDecl(cat, p.declencheur);
        const parDefaut = (cat.declencheursDoc || []).some((x) => x.cle === "document_signe") ? "document_signe" : ((cat.declencheursDoc || [])[0] || {}).cle;
        return { ...p, declencheur: dejaDoc ? p.declencheur : (parDefaut || p.declencheur), destinataire: p.destinataire || "stagiaire" };
      }
      return { ...p, declencheur: estDocDecl(cat, p.declencheur) ? "fin_session" : p.declencheur };
    });
  }

  async function voir() {
    onStatus(null);
    // `contexte: 'regle'` : l'aperçu connaît les jetons de la règle (formation, dates, {Document}),
    // pas seulement les trois d'« Écrire à un groupe » — sinon {Document} casse l'aperçu (et l'image).
    try { setApercu((await apercuMail({ objet: v.objet, corps: v.corps, contexte: "regle" })).data); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }
  async function enregistrer() {
    setBusy(true); onStatus(null);
    try {
      const payload = {
        ...v, decalage: Number(v.decalage) || 0, program_id: v.program_id || null,
        template_slug: v.template_slug || null, destinataire: v.destinataire || "stagiaire",
        learner_id: v.learner_id || null, company_id: v.company_id || null, actif: v.actif !== 0,
      };
      if (regle) await modifierRegleMail(regle.id, payload); else await creerRegleMail(payload);
      onStatus({ type: "success", message: regle ? "Règle enregistrée."
        : estDoc ? "Règle créée : elle part dès qu'un document correspond." : "Règle créée : elle vaut pour les dates atteintes à partir d'aujourd'hui." });
      onEnregistre();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }

  const res = resumeRegle(v, cat, formations);
  return (
    <div className="mail-editeur">
      <div className="field">
        <label htmlFor="regle-nom">Nom de la règle</label>
        <input id="regle-nom" className="inp" value={v.nom} onChange={maj("nom")} placeholder="Merci — convention signée" />
      </div>

      <section className="mail-ed-bloc">
        <h4 className="mail-ed-titre"><span className="mail-ed-num">1</span> Quand l'e-mail part-il&nbsp;?</h4>
        <div className="seg mail-ed-seg">
          <button type="button" className={"seg-btn" + (!estDoc ? " on" : "")} onClick={() => choisirType("date")}>
            <Icon name="calendar" size={13} /> À une date
          </button>
          <button type="button" className={"seg-btn" + (estDoc ? " on" : "")} onClick={() => choisirType("document")}>
            <Icon name="file-text" size={13} /> Quand un document…
          </button>
        </div>
        {estDoc ? (
          <div className="mail-ed-grille">
            <div className="field">
              <label htmlFor="regle-evt">Événement</label>
              <select id="regle-evt" className="inp" value={v.declencheur} onChange={maj("declencheur")}>
                {(cat.declencheursDoc || []).map((d) => <option key={d.cle} value={d.cle}>{d.libelle}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="regle-modele">Modèle concerné</label>
              <select id="regle-modele" className="inp" value={v.template_slug || ""}
                onChange={(e) => setV((p) => ({ ...p, template_slug: e.target.value || null }))}>
                <option value="">Tous les documents</option>
                {(cat.modeles || []).map((m) => <option key={m.slug} value={m.slug}>{m.label}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="mail-ed-grille date">
            <div className="field fx-petit">
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
              <label htmlFor="regle-sens">Avant / après</label>
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
          </div>
        )}
      </section>

      <section className="mail-ed-bloc">
        <h4 className="mail-ed-titre"><span className="mail-ed-num">2</span> Pour qui&nbsp;?</h4>
        {estDoc && (
          <div className="field">
            <label htmlFor="regle-dest">Destinataire</label>
            <select id="regle-dest" className="inp" value={v.destinataire || "stagiaire"} onChange={maj("destinataire")}>
              {cat.destinataires.map((d) => <option key={d.cle} value={d.cle}>{d.libelle}</option>)}
            </select>
          </div>
        )}
        <CibleRegle v={v} setV={setV} formations={formations} />
      </section>

      <section className="mail-ed-bloc">
        <h4 className="mail-ed-titre"><span className="mail-ed-num">3</span> Le message</h4>
        <div className="field">
          <label htmlFor="regle-objet">Objet</label>
          <input id="regle-objet" className="inp" value={v.objet} onChange={maj("objet")}
            placeholder={estDoc ? "Votre document {Document} est bien reçu, {Prénom}" : "Comment se passe la suite, {Prénom} ?"} />
        </div>
        <div className="field">
          <label htmlFor="regle-corps">Contenu</label>
          <BarreInsertion jetons={cat.jetons} onStatus={onStatus}
            onInserer={(txt) => setV((p) => ({ ...p, corps: `${p.corps}${txt}` }))} />
          <textarea id="regle-corps" className="inp" rows={7} value={v.corps} onChange={maj("corps")}
            placeholder={estDoc ? "Bonjour {Prénom},\n\nNous avons bien reçu votre {Document} signé. Merci !"
              : "Bonjour {Prénom},\n\nVous avez terminé {Formation} il y a trois mois. Où en êtes-vous de votre projet ?"} />
        </div>
      </section>

      <div className="mail-ed-resume">
        <Icon name={res.est ? "file-text" : "calendar"} size={15} />
        <span><b>{res.quand}</b>, {res.dest}, pour <b>{res.scope}</b>.</span>
      </div>

      <div className="mail-ed-pied">
        <button type="button" className="btn sm ghost" onClick={voir} disabled={!v.objet.trim() || !v.corps.trim()}>
          <Icon name="eye" size={13} /> Aperçu
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" onClick={onFerme}>Annuler</button>
        <button type="button" className="btn primary sm" onClick={enregistrer} disabled={busy || !v.nom.trim()}>
          {busy ? "…" : regle ? "Enregistrer" : "Créer la règle"}
        </button>
      </div>
      {apercu && <Apercu rendu={apercu} />}
    </div>
  );
}

/* POUR QUI la règle vaut : une formation (comme avant), OU un stagiaire précis, OU une entreprise
   précise — « au lieu d'une session entière » (196). Les trois s'excluent : choisir l'un efface
   les autres. La recherche va au serveur pour les stagiaires (ils sont un millier) et filtre en
   local les entreprises (elles sont quelques centaines). */
function CibleRegle({ v, setV, formations }) {
  const [mode, setMode] = useState(v.learner_id ? "stagiaire" : v.company_id ? "entreprise" : "formation");
  function choisirMode(m) {
    setMode(m);
    setV((p) => ({ ...p,
      program_id: m === "formation" ? p.program_id : null,
      learner_id: null, company_id: null, cible_stagiaire: null, cible_entreprise: null }));
  }
  const MODES = [["formation", "Une formation", "target"], ["stagiaire", "Un stagiaire", "user"], ["entreprise", "Une entreprise", "building"]];
  return (
    <div className="mail-cible">
      <div className="seg mail-cible-seg">
        {MODES.map(([m, lib, ico]) => (
          <button key={m} type="button" className={"seg-btn" + (mode === m ? " on" : "")} onClick={() => choisirMode(m)}>
            <Icon name={ico} size={12} /> {lib}
          </button>
        ))}
      </div>
      {mode === "formation" && (
        <div className="field" style={{ margin: 0 }}>
          <select className="inp" value={v.program_id || ""} aria-label="Formation"
            onChange={(e) => setV((p) => ({ ...p, program_id: e.target.value || null }))}>
            <option value="">Toutes les formations</option>
            {formations.map((f) => <option key={f.id} value={f.id}>{f.code ? `${f.code} — ` : ""}{f.title}</option>)}
          </select>
        </div>
      )}
      {mode === "stagiaire" && (
        <RechercheCible type="stagiaire" labelActuel={v.cible_stagiaire}
          onChoisir={(o) => setV((p) => ({ ...p, learner_id: o.id, company_id: null, cible_stagiaire: o.label, cible_entreprise: null }))}
          onEffacer={() => setV((p) => ({ ...p, learner_id: null, cible_stagiaire: null }))} />
      )}
      {mode === "entreprise" && (
        <RechercheCible type="entreprise" labelActuel={v.cible_entreprise}
          onChoisir={(o) => setV((p) => ({ ...p, company_id: o.id, learner_id: null, cible_entreprise: o.label, cible_stagiaire: null }))}
          onEffacer={() => setV((p) => ({ ...p, company_id: null, cible_entreprise: null }))} />
      )}
    </div>
  );
}

function RechercheCible({ type, labelActuel, onChoisir, onEffacer }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [toutes, setToutes] = useState(null); // entreprises chargées une fois
  useEffect(() => {
    if (type !== "entreprise") return;
    getCompanies().then((r) => setToutes(Array.isArray(r) ? r : (r.data || []))).catch(() => setToutes([]));
  }, [type]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setRes([]); return; }
    if (type === "entreprise") {
      const bas = s.toLowerCase();
      setRes((toutes || []).filter((c) => (c.name || "").toLowerCase().includes(bas)).slice(0, 12)
        .map((c) => ({ id: c.id, label: c.name })));
      return undefined;
    }
    let vif = true;
    const t = setTimeout(async () => {
      try {
        const r = await getStagiaires(s);
        const liste = Array.isArray(r) ? r : (r.data || []);
        if (vif) setRes(liste.slice(0, 12).map((l) => ({ id: l.id, label: [l.civility, l.first_name, l.last_name].filter(Boolean).join(" ") || l.email })));
      } catch { if (vif) setRes([]); }
    }, 250);
    return () => { vif = false; clearTimeout(t); };
  }, [q, type, toutes]);

  if (labelActuel) {
    return (
      <div className="field">
        <span className="mail-cible-chip"><b>{labelActuel}</b>
          <button type="button" className="lien" onClick={onEffacer}>changer</button></span>
      </div>
    );
  }
  return (
    <div className="field mail-cible-search">
      <input className="inp" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={type === "stagiaire" ? "Chercher un stagiaire (nom, e-mail)…" : "Chercher une entreprise…"} />
      {res.length > 0 && (
        <ul className="mail-cible-res">
          {res.map((o) => (
            <li key={o.id}><button type="button" onClick={() => { onChoisir(o); setQ(""); setRes([]); }}>{o.label}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Mailing;
