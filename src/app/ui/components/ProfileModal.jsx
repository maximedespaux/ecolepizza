import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMyFormations, getMyInfos, updateMyInfos, updateMyVisibility, changeMyEmail, changeMyPassword, getCurrentUser, getMyProfile, deactivateMyProfile, reactivateMyProfile } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { initials, colorOf } from "../lib/format.js";
import {AVATARS, getAvatar, setAvatar} from "../lib/gamification.js";
import { CADRES, cadreFor, cadrePossede, cadrePorte, cadreDeQuest, EXPLOITS_QUEST, adopterCadreServeur, cadreClass, cadreStyle, cadreValeur, parseCadre, estCadreQuest, getCadreChoisi, setCadreChoisi } from "../lib/cadres.js";
import { useEchap } from "../lib/useEchap.js";
import { getMyConsents, setMyConsent, getMyNewsletter, setMyNewsletter } from "../api/apiClient.js";
/* L'HEURE N'EST PAS UN DÉTAIL. Accepter puis se rétracter le même jour donne deux lignes que
   seule l'heure distingue : sans elle, l'écran affirme « votre réponse du 03/08 » pour deux
   réponses opposées, et le registre devient inutilisable là où il sert le plus. `dateHeure`
   découpe la chaîne du serveur sans passer par `new Date()`, qui la retraduirait dans le
   fuseau du navigateur — soit une heure différente de celle qui est en base. */
import { dateHeure } from "../lib/format.js";

/**
 * Profil stagiaire, en quatre onglets :
 *  • Profil  : avatar (picker pizza), cadre & progression.
 *  • Mes infos : coordonnées personnelles — modifiables et synchronisées côté organisme.
 *  • Confidentialité : ce que voient les autres stagiaires, et « Mes autorisations » (partenaires,
 *    photos). L'onglet s'appelait « Visibilité » alors que la fenêtre de consentement envoyait vers
 *    « Mon profil → Confidentialité » : un chemin vers un onglet qui n'existait pas. Renommé le
 *    2026-09-22 à la demande de l'école ; le titre de la section a changé avec lui, pour ne pas
 *    répéter le nom de l'onglet.
 *  • Compte  : changement d'e-mail et de mot de passe.
 */
const CIVILITIES = ["", "M.", "Mme"];
// Fonds proposés (charte pizza) — plus le sélecteur libre pour une couleur personnalisée.
const PALETTE = ["#dc3e37", "#ff6900", "#fcb900", "#2f9e6f", "#3aa0e0", "#2c3371", "#7b3f9e", "#8a5a2b", "#e0533e", "#111827"];

/**
 * LE CHEMIN DU RETOUR — se rétracter doit être aussi simple qu'accepter (art. 7.3).
 *
 * C'est la contrepartie de la règle « on ne redemande pas après un refus » : puisque la fenêtre ne
 * revient plus, il faut un endroit stable où changer d'avis, DANS LES DEUX SENS. Quelqu'un qui a
 * refusé doit pouvoir accepter plus tard sans qu'on l'ait harcelé entre-temps.
 *
 * Chaque bascule AJOUTE une ligne au registre : l'historique daté est ce qui permettra de
 * démontrer qu'une transmission passée était licite au moment où elle a eu lieu.
 */
function ConsentementsBloc() {
  const [liste, setListe] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    getMyConsents().then((r) => setListe(Array.isArray(r?.data) ? r.data : [])).catch(() => setListe([]));
  }, []);

  // `null` : pas encore chargé. `[]` : rien à proposer (migration non jouée, ou pas de fiche).
  if (!liste || !liste.length) return null;

  const basculer = async (f, valeur) => {
    setBusy(f.cle);
    try {
      await setMyConsent(f.cle, valeur);
      /* ON RELIT LE REGISTRE au lieu de rapiécer l'état local. Une première version ne changeait
         que `accorde` : l'écran affichait alors la NOUVELLE réponse sous l'ANCIENNE date, ce qui,
         sur une preuve de consentement, est un mensonge — et précisément le genre de ligne qu'on
         irait citer pour dater une rétractation. L'horodatage vient du SERVEUR, jamais de
         l'horloge du navigateur, qui peut être fausse ou simplement dans un autre fuseau. */
      const r = await getMyConsents();
      if (Array.isArray(r?.data)) setListe(r.data);
    } catch { /* l'écran garde l'ancienne valeur : mieux vaut ne rien changer que mentir */ }
    finally { setBusy(null); }
  };

  return (
    <div className="consent-bloc">
      <div className="consent-bloc-t">Mes autorisations</div>
      {liste.map((f) => (
        <div key={f.cle} className="consent-ligne">
          <div>
            <b>{f.titre}</b>
            <span className="hint">{f.formulation}</span>
            {f.decide_at && (
              <span className="hint">
                Votre réponse du {dateHeure(f.decide_at)} :
                <b> {f.accorde ? "accepté" : "refusé"}</b>
              </span>
            )}
          </div>
          <span className="seg" style={{ flex: "none" }}>
            <button className={"seg-btn" + (f.accorde === false ? " on" : "")}
              disabled={busy === f.cle} onClick={() => basculer(f, false)}>Refuser</button>
            <button className={"seg-btn" + (f.accorde === true ? " on" : "")}
              disabled={busy === f.cle} onClick={() => basculer(f, true)}>Accepter</button>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * La newsletter (actualités de l'école par e-mail) — un OPT-OUT, à part des autorisations.
 *
 * Ce n'est PAS une question « Oui / Non » comme les consentements : le stagiaire est inscrit par
 * défaut (il est déjà client de l'école), et cet interrupteur ne sert qu'à PARTIR, ou à revenir.
 * D'où « Recevoir / Ne plus recevoir », et jamais une demande en attente.
 */
function NewsletterBloc() {
  const [inscrit, setInscrit] = useState(null); // null = pas encore chargé ; undefined = non concerné
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyNewsletter()
      .then((r) => setInscrit(r?.data ? !!r.data.inscrit : undefined))
      .catch(() => setInscrit(undefined));
  }, []);

  if (inscrit === null || inscrit === undefined) return null; // en cours, ou compte sans fiche stagiaire

  const basculer = async (valeur) => {
    if (valeur === inscrit) return;
    setBusy(true);
    try {
      const r = await setMyNewsletter(valeur);
      setInscrit(r?.inscrit ?? valeur);
    } catch { /* on garde l'ancienne valeur plutôt que d'afficher un état qui n'a pas été enregistré */ }
    finally { setBusy(false); }
  };

  return (
    <div className="consent-bloc">
      <div className="consent-bloc-t">Les actualités de l'école</div>
      <div className="consent-ligne">
        <div>
          <b>Recevoir les actualités par e-mail</b>
          <span className="hint">
            Les annonces de l'école, envoyées par e-mail. Se désinscrire n'a aucune conséquence sur
            votre formation, et vous retrouverez toujours les annonces dans la Communauté.
          </span>
        </div>
        <span className="seg" style={{ flex: "none" }}>
          <button className={"seg-btn" + (inscrit === false ? " on" : "")}
            disabled={busy} onClick={() => basculer(false)}>Ne plus recevoir</button>
          <button className={"seg-btn" + (inscrit === true ? " on" : "")}
            disabled={busy} onClick={() => basculer(true)}>Recevoir</button>
        </span>
      </div>
    </div>
  );
}

export default function ProfileModal({ onClose }) {
  useEchap(onClose);
  const { user, setUser } = useContext(UserContext);
  const uid = user?.id;
  const [tab, setTab] = useState("profil");
  const [avatar, setAv] = useState(() => getAvatar(uid));
  const [formations, setFormations] = useState([]);

  useEffect(() => { getMyFormations().then((r) => setFormations(r.data || [])).catch(() => {}); }, []);

  // Niveaux attribués = les BADGES du stagiaire (mêmes que ceux qui débloquent Pizza Quest),
  // avec repli sur les formations suivies.
  const access = formations.filter((f) => f.finished || ((f.has_badge || f.enrolled) && !f.revoked));
  // Terminées = formations marquées finies (manuel) ou complétées (auto) parmi les attribuées.
  const done = access.filter((f) => f.finished).length;
  const enrolled = access.length; // dénominateur = formations attribuées
  const roleLabel = user?.role === "INTERVENANT" ? "Intervenant" : "Stagiaire";
  // L'XP et les cœurs ont disparu : la progression se lit aux CADRES, gagnés sur les
  // formations réellement terminées (cf. lib/cadres.js).
  const { cadre: palier, suivant } = cadreFor(done);
  // `attribues` : les cadres exclusifs accordés par l'école (migration 113). Tant qu'aucun
  // n'est accordé la liste reste vide et ils s'affichent verrouillés AVEC leur condition —
  // un objectif visible vaut mieux qu'une case cachée.
  const [attribues, setAttribues] = useState([]);
  /* Cadres de PIZZA QUEST : gagnés en jouant, un par formation, à SA couleur. Ils ne sont pas
     dans `CADRES` — ils n'existent qu'une fois la formation connue — et c'est le serveur qui
     dit lesquels sont acquis (il recalcule sur la banque de questions du moment). */
  const [quest, setQuest] = useState([]);
  const auMontage = useRef(getCadreChoisi(uid)); // témoin : a-t-on cliqué pendant le chargement ?
  useEffect(() => {
    getMyProfile().then((r) => {
      /* Le choix enregistré en base fait foi au chargement : sans cette ligne, la modale
         affichait le cadre du NAVIGATEUR alors que la Communauté montrait celui de la base.
         SAUF SI ON A CLIQUÉ DEPUIS : la modale est utilisable avant que cette requête revienne,
         et une réponse en retard annulerait le choix qu'on vient de faire — l'utilisateur
         verrait son cadre revenir tout seul au précédent. Le serveur ne gagne qu'au repos. */
      if (r?.data?.cadre && getCadreChoisi(uid) === auMontage.current) {
        adopterCadreServeur(uid, r.data.cadre); setChoisi(r.data.cadre);
      }
      setAttribues(r?.data?.cadres_exclusifs || []);
      const q = r?.data?.quest_cadres || [];
      setQuest(q);
      recolorerSiBesoin(q);
    }).catch(() => {});
  }, []);

  const [, setChoisi] = useState(() => getCadreChoisi(uid));
  /* QUAND L'ÉCOLE RECOLORE UNE FORMATION, le cadre porté garde l'ancienne teinte — et la teinte
     fait partie de la possession (sinon on porterait la couleur d'une formation jamais jouée).
     Le cadre devenait donc orphelin : plus surligné dans la liste, et refusé par le serveur à la
     prochaine écriture. Observé pour de vrai, une formation venant d'être recolorée.
     On réaligne quand il n'y a AUCUN doute : un seul cadre possédé sur ce palier. À plusieurs, on
     ne devine pas — deviner reviendrait à repeindre le cadre d'une autre formation. */
  function recolorerSiBesoin(possedes) {
    const actuel = getCadreChoisi(uid);
    const { id } = parseCadre(actuel);
    if (!estCadreQuest(id) || possedes.some((c) => c.valeur === actuel)) return;
    const memePalier = possedes.filter((c) => c.palier === id);
    if (memePalier.length !== 1) return;
    setCadreChoisi(uid, memePalier[0].valeur);
    setChoisi(memePalier[0].valeur);
  }
  const cadre = cadrePorte(uid, done, attribues, quest);
  /* LES EXPLOITS, TOUS LISTÉS — gagnés ou non. Le serveur ne renvoie que ce qui est acquis ; s'en
     tenir à sa liste ferait disparaître les six autres, alors que ce sont eux qui donnent envie
     de rejouer. Même parti pris que les cadres exclusifs, affichés verrouillés avec leur
     condition depuis toujours. */
  const exploits = useMemo(() => {
    const acquis = new Set(quest.filter((q) => q.global).map((q) => q.valeur));
    return EXPLOITS_QUEST.map((e) => ({ ...e, valeur: e.id, quest: acquis.has(e.id), exclusif: !acquis.has(e.id) }));
  }, [quest]);
  const choisirCadre = (id) => { setCadreChoisi(uid, id); setChoisi(id); };
  const haut = suivant ? suivant.min : palier.min;
  const pct = suivant ? Math.min(100, Math.round(((done - palier.min) / (haut - palier.min)) * 100)) : 100;

  function choose(a) { const c = avatar?.color; setAvatar(uid, a.id, c); setAv({ ...a, color: c || a.color }); }
  function chooseColor(c) { const base = avatar || AVATARS[0]; setAvatar(uid, base.id, c); setAv({ ...base, color: c }); }
  const who = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Stagiaire";
  const refreshUser = () => getCurrentUser().then((r) => setUser(r.data)).catch(() => {});

  return (
    <div className="overlay">
      {/* Plus large sur PC (720 au lieu de 480) : « Mes infos » tient deux colonnes de champs et
          respire. `.modal` est en width:100% + max-width, donc ce plafond ne joue QUE sur grand
          écran — sur téléphone la fenêtre reste pleine largeur (bornée par le voile). */}
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Mon profil</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {/* Identité (gauche) + accès / niveaux attribués (droite).
              Les deux colonnes se replient l'une sous l'autre quand la modale est étroite :
              « Mes accès » avait une largeur fixe de 150px qu'elle ne rendait jamais, si bien
              que sur un téléphone le nom héritait de 80px et s'affichait « Guilla… ». */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {/* LE CADRE VA SUR LA PHOTO, pas à côté du texte. Il était rendu en pastille de 14 px
                dans la ligne de légende, à dix pixels de l'avatar : on voyait bien un anneau, mais
                détaché de ce qu'il est censé entourer — alors que c'est exactement là qu'on vient
                vérifier de quoi on a l'air. La photo de profil est le seul endroit de cet écran
                où il veut dire quelque chose. */}
            <span className={`pf-avatar ${cadreClass(cadreValeur(cadre))}`}
              style={{ background: avatar ? avatar.color : "var(--navy)", flex: "none", ...cadreStyle(cadre.valeur) }}>
              {avatar ? avatar.emoji : initials(user?.first_name, user?.last_name)}
            </span>
            <div style={{ flex: "1 1 170px", minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{who}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
              <div style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, marginTop: 2 }}>
                {cadre.id === "aucun" ? "Aucun cadre" : `Cadre ${cadre.nom}`}
              </div>
            </div>
            <div style={{ flex: "1 1 150px", textAlign: "right" }}>
              <div className="hint" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, marginBottom: 3 }}>Mes accès</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>{roleLabel}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                {access.length === 0 ? (
                  <span className="hint" style={{ fontSize: 11 }}>Aucun niveau</span>
                ) : access.map((f) => (
                  <span key={f.program_id} className="badge n mono" title={f.program_title}
                    style={{ background: f.color || colorOf(f.program_code), color: "#fff", borderColor: "transparent", fontSize: 10, padding: "2px 7px" }}>
                    {f.program_code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Onglets */}
          <span className="seg" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            <button className={"seg-btn" + (tab === "profil" ? " on" : "")} onClick={() => setTab("profil")}>Profil</button>
            <button className={"seg-btn" + (tab === "infos" ? " on" : "")} onClick={() => setTab("infos")}>Mes infos</button>
            <button className={"seg-btn" + (tab === "confidentialite" ? " on" : "")} onClick={() => setTab("confidentialite")}>Confidentialité</button>
            <button className={"seg-btn" + (tab === "compte" ? " on" : "")} onClick={() => setTab("compte")}>Compte</button>
          </span>

          {tab === "profil" && (
            <ProfilTab avatar={avatar} choose={choose} chooseColor={chooseColor} cadre={cadre} palier={palier} suivant={suivant} pct={pct} done={done} enrolled={enrolled} attribues={attribues} quest={quest} exploits={exploits} choisirCadre={choisirCadre} />
          )}
          {tab === "infos" && <InfosTab onSaved={refreshUser} />}
          {tab === "confidentialite" && <><VisibiliteTab who={who} /><ConsentementsBloc /><NewsletterBloc /></>}
          {tab === "compte" && <CompteTab currentEmail={user?.email} role={user?.role} deactivatedAt={user?.deactivated_at} onEmailChanged={refreshUser} onChanged={refreshUser} />}
        </div>
        <div className="mfoot">
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </div>
  );
}

function ProfilTab({ avatar, choose, chooseColor, cadre, palier, suivant, pct, done, enrolled, attribues, quest, exploits, choisirCadre }) {
  /* L'ORDRE DE LA LISTE, ET IL N'ÉTAIT PAS TENABLE. Dix-neuf cadres se suivaient à plat, dans
     l'ordre où les trois familles avaient été écrites : « Sans cadre » — le choix neutre, celui
     qu'on cherche quand on veut TOUT retirer — arrivait en dixième position, coincé entre le
     Grand Chelem et Bronze. Et rien ne disait pourquoi « Premier pas » suivait « Sans faute ».

     Quatre familles, chacune avec son intitulé, rangées par CE QU'IL FAUT FAIRE pour les avoir :
     jouer sur une formation, jouer partout, venir se former, être distingué par l'école. À
     l'intérieur, du plus accessible au plus rare — l'ordre où on les gagnera.

     Un groupe VIDE ne s'affiche pas : un intitulé « Mes formations » suivi de rien donnerait
     l'impression d'un chargement raté, alors qu'il signifie seulement qu'on n'a pas encore joué. */
  const groupes = useMemo(() => {
    const ordrePalier = { qdemi: 0, qfini: 1, qparfait: 2 };
    const formations = quest.filter((q) => !q.global).map(cadreDeQuest)
      // Par formation, puis par palier : les trois cadres d'une même formation restent ensemble,
      // dans l'ordre où on les décroche.
      .sort((a, b) => (a.formation || "").localeCompare(b.formation || "")
        || ordrePalier[a.id] - ordrePalier[b.id]);
    const parcours = CADRES.filter((c) => !c.exclusif && !c.personnel && c.id !== "aucun");
    const distinctions = CADRES.filter((c) => c.exclusif || c.personnel);
    return [
      { titre: "Aucun", quoi: "ton avatar seul", cadres: CADRES.filter((c) => c.id === "aucun") },
      { titre: "Mes formations", quoi: "gagnés en jouant, à la couleur de la formation", cadres: formations },
      { titre: "Exploits", quoi: "sur l'ensemble de Pizza Quest", cadres: exploits },
      { titre: "Parcours", quoi: "au nombre de formations terminées", cadres: parcours },
      { titre: "Distinctions", quoi: "attribuées par l'école", cadres: distinctions },
    ].filter((g) => g.cadres.length);
  }, [quest, exploits]);

  return (
    <>
      <div className="pf-grade">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <b style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {/* L'anneau du PALIER, pas celui qu'on porte : ce bloc parle de la progression en
                formations (x/y, palier suivant). Les mêler affichait un anneau « Sans faute »
                jaune sous la légende « Cadre Braise ». */}
            <span className={"stu-rank-cadre " + cadreClass(palier.id)} aria-hidden="true" />
            {palier.id === "aucun" ? "Aucun cadre" : `Cadre ${palier.nom}`}
          </b>
          <span className="hint">{done}/{enrolled} formation(s) terminée(s)</span>
        </div>
        <div className="pq-progress" style={{ height: 12 }}><span style={{ width: `${pct}%`, background: "var(--gold)" }} /></div>
        {suivant && <div className="hint" style={{ marginTop: 5 }}>Encore <b>{suivant.min - done} formation(s)</b> pour le cadre <b>{suivant.nom}</b></div>}
      </div>

      {/* Sélecteur : on choisit CE QU'ON PORTE parmi ce qu'on possède. Le dernier cadre
          obtenu n'est pas forcément celui qu'on veut montrer. Les exclusifs restent
          affichés, verrouillés, avec leur condition — ils existent comme objectif. */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Choisis ton cadre</div>
        <p className="hint" style={{ margin: 0 }}>Il entoure ton avatar partout, y compris dans la Communauté.</p>
        {groupes.map((g) => (
        <div key={g.titre}>
          <div className="pf-cadres-titre">{g.titre}<span className="hint">{g.quoi}</span></div>
        <div className="pf-cadres">
          {g.cadres.map((c) => {
            // Un cadre de quête porte une VALEUR (palier + couleur) ; les autres, leur seul id.
            const cle = c.valeur || c.id;
            // Un exploit non gagné se voit et se lit, mais ne se choisit pas.
            const possede = c.quest === true || (c.quest === undefined && cadrePossede(c, done, attribues, quest));
            const actif = (cadre.valeur || cadre.id) === cle;
            return (
              <button key={cle} type="button"
                className={`pf-cadre${actif ? " on" : ""}${c.exclusif ? " exclusif" : ""}`}
                disabled={!possede}
                onClick={() => choisirCadre(cle)}
                title={[c.titre, possede ? c.desc || c.nom : (c.condition || c.desc)].filter(Boolean).join("-")}>
                <span className={`pf-cadre-apercu ${possede && c.id !== "aucun" ? `cadre cadre-${c.id}` : ""}`}
                  style={cadreStyle(cle)}>
                  <span aria-hidden="true">{avatar ? avatar.emoji : "🍕"}</span>
                  {!possede && <span className="pf-lock"><Icon name="lock" size={9} /></span>}
                </span>
                <span className="pf-cadre-nom">{c.nom}</span>
                {/* Le CODE de la formation, sur sa propre ligne. Le titre complet faisait quatre
                    lignes dans la tuile et noyait le nom du cadre ; il reste en info-bulle. */}
                {c.formation && <span className="pf-cadre-code">{c.formation}</span>}
                {!possede && <span className="pf-cadre-cond">{c.condition || c.desc}</span>}
              </button>
            );
          })}
        </div>
        </div>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Choisis ton avatar</span>
          <button className="btn sm ghost" onClick={() => choose(AVATARS[Math.floor(Math.random() * AVATARS.length)])} title="Avatar au hasard">🎲 Surprise</button>
        </div>
        <div className="pf-picker">
          {AVATARS.map((a) => (
            <button key={a.id} className={"pf-opt" + (avatar?.id === a.id ? " sel" : "")}
              style={{ background: avatar?.id === a.id ? (avatar.color || a.color) : a.color }} onClick={() => choose(a)} title={a.id} aria-label={`Avatar ${a.id}`}>
              {a.emoji}
              {avatar?.id === a.id && <span className="pf-check"><Icon name="check" size={12} /></span>}
            </button>
          ))}
        </div>

        {/* Couleur du fond */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 8px" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Couleur du fond</span>
          <label className="btn sm ghost" style={{ cursor: "pointer" }} title="Couleur personnalisée">
            🎨 Personnalisée
            <input type="color" value={avatar?.color || "#dc3e37"} onChange={(e) => chooseColor(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
          </label>
        </div>
        <div className="pf-colors">
          {PALETTE.map((c) => (
            <button key={c} className={"pf-color" + (avatar?.color?.toLowerCase() === c.toLowerCase() ? " sel" : "")}
              style={{ background: c }} onClick={() => chooseColor(c)} title={c} aria-label={`Fond ${c}`}>
              {avatar?.color?.toLowerCase() === c.toLowerCase() && <Icon name="check" size={12} />}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Ton avatar, sa couleur et ton cadre sont visibles par les autres stagiaires dans la communauté.</p>
      </div>
    </>
  );
}

/**
 * « Mes infos » — coordonnées du stagiaire, puis SON entreprise (lecture seule, sauf s'il en est le référent).
 *
 * L'ENTREPRISE EST DU RESSORT DE L'ÉCOLE (tranché le 2026-10-05) : le stagiaire ne la CHOISIT pas et
 * ne la crée pas — se rattacher soi-même à n'importe quelle entreprise laisserait affirmer un lien
 * faux. Deux cas seulement :
 *  • RÉFÉRENT de l'entreprise (migration 174, désigné par l'école) → il en corrige les coordonnées ;
 *  • sinon → il la voit (lecture seule), ou lit « renseignée par votre école » s'il n'en a pas.
 * Les champs « adresse perso / entreprise » n'ont de sens que pour un stagiaire (fiche learner) :
 * le personnel (intervenant) ne voit que civilité / nom / téléphone, qui vivent sur son compte.
 */
function InfosTab({ onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  useEffect(() => { getMyInfos().then((r) => setF(r.data || {})).catch(() => setF({})); }, []);
  /* Le NOM DE FAMILLE, la VILLE (perso et entreprise) et le LIEU DE NAISSANCE en capitales dès la
     frappe : le serveur les y met de toute façon (src/api/lib/saisie.js), et sans ça ils
     changeraient de casse sous les yeux du stagiaire au prochain chargement. */
  const set = (k) => (e) => setF((p) => ({
    ...p, [k]: k === "last_name" || k === "company_town" || k === "town" || k === "birth_place" ? e.target.value.toLocaleUpperCase("fr") : e.target.value,
  }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const payload = {
        civility: f.civility, first_name: f.first_name, last_name: f.last_name, phone: f.phone,
        birthday: f.birthday, birth_place: f.birth_place,
        address: f.address, zip_code: f.zip_code, town: f.town,
      };
      // Les coordonnées de l'entreprise ne partent QUE si le stagiaire en est le référent (le serveur
      // l'exige aussi). Il ne choisit ni ne crée jamais d'entreprise : l'école seule la lie.
      if (f.company_is_owner) {
        payload.company_name = f.company; payload.company_address = f.company_address;
        payload.company_zip = f.company_zip; payload.company_town = f.company_town;
      }
      await updateMyInfos(payload);
      setMsg({ ok: true, text: "Infos enregistrées. Elles sont aussi mises à jour côté organisme." });
      onSaved && onSaved();
    } catch (e) { setMsg({ ok: false, text: e.message || "Échec de l'enregistrement." }); }
    finally { setBusy(false); }
  }

  if (!f) return <p className="hint">Chargement…</p>;
  return (
    <div>
      <p className="hint" style={{ margin: "0 0 12px" }}>Tes coordonnées. Toute modification est visible par ton organisme de formation.</p>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>Civilité</label>
          <select className="inp" value={f.civility || ""} onChange={set("civility")}>{CIVILITIES.map((c) => <option key={c} value={c}>{c || "-"}</option>)}</select></div>
        <div className="field"><label>Téléphone</label><input className="inp" value={f.phone || ""} onChange={set("phone")} /></div>
        <div className="field"><label>Prénom</label><input className="inp" value={f.first_name || ""} onChange={set("first_name")} /></div>
        <div className="field"><label>Nom</label><input className="inp" value={f.last_name || ""} onChange={set("last_name")} /></div>
        {f.is_learner && <>
          <div className="field"><label>Date de naissance</label><input className="inp" type="date" value={f.birthday || ""} onChange={set("birthday")} /></div>
          <div className="field"><label>Lieu de naissance</label><input className="inp" value={f.birth_place || ""} onChange={set("birth_place")} placeholder="LANNEMEZAN" /></div>
        </>}
      </div>

      {f.is_learner && <>
        <div style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 8px" }}>Mon adresse</div>
        <div className="field"><label>Adresse</label><input className="inp" value={f.address || ""} onChange={set("address")} /></div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label>Code postal</label><input className="inp" value={f.zip_code || ""} onChange={set("zip_code")} /></div>
          <div className="field"><label>Ville</label><input className="inp" value={f.town || ""} onChange={set("town")} placeholder="LANNEMEZAN" /></div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 8px" }}>Mon entreprise</div>
        {f.company_id && f.company_is_owner ? (
          <>
            <p className="hint" style={{ margin: "0 0 8px" }}><Icon name="check" size={12} /> Vous êtes le référent de cette entreprise : vous pouvez corriger ses coordonnées.</p>
            <div className="field"><label>Nom de l'entreprise</label><input className="inp" value={f.company || ""} onChange={set("company")} /></div>
            <div className="field"><label>Adresse de l'entreprise</label><input className="inp" value={f.company_address || ""} onChange={set("company_address")} /></div>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="field"><label>Code postal</label><input className="inp" value={f.company_zip || ""} onChange={set("company_zip")} /></div>
              <div className="field"><label>Ville</label><input className="inp" value={f.company_town || ""} onChange={set("company_town")} placeholder="LANNEMEZAN" /></div>
            </div>
          </>
        ) : f.company_id ? (
          <>
            <div className="field"><label>Entreprise</label>
              <div style={{ padding: "7px 2px", fontWeight: 600 }}>{f.company || "—"}{f.company_town ? ` — ${f.company_town}` : ""}</div></div>
            <p className="hint" style={{ margin: "0 0 4px" }}>Renseignée par votre école. Une correction à faire ? Demandez-leur.</p>
          </>
        ) : (
          <p className="hint" style={{ margin: "0 0 4px" }}>Votre entreprise est renseignée par votre école.</p>
        )}
      </>}
      {msg && <p className="hint" style={{ color: msg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "10px 0 10px" }}>{msg.text}</p>}
      <button className="btn primary" disabled={busy} onClick={save} style={{ width: "100%", justifyContent: "center", marginTop: 10 }}><Icon name="check" size={14} /> Enregistrer mes infos</button>
    </div>
  );
}

function VisibiliteTab({ who }) {
  const [f, setF] = useState(null); // { company, phone, email, visibility, ... }
  const [vis, setVis] = useState({ company: true, phone: false, email: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { getMyInfos().then((r) => { setF(r.data || {}); setVis((r.data && r.data.visibility) || { company: true, phone: false, email: false }); }).catch(() => setF({})); }, []);
  const toggle = (k) => setVis((v) => ({ ...v, [k]: !v[k] }));

  async function save() {
    setBusy(true); setMsg(null);
    try { await updateMyVisibility(vis); setMsg({ ok: true, text: "Visibilité enregistrée." }); }
    catch (e) { setMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setBusy(false); }
  }

  if (!f) return <p className="hint">Chargement…</p>;
  const Row = ({ k, label, value }) => (
    <label className="vis-row">
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13.5 }}>{label}</b>
        <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{value || "-"}</span>
      </span>
      <input type="checkbox" checked={!!vis[k]} onChange={() => toggle(k)} />
    </label>
  );

  return (
    <div>
      <p className="hint" style={{ margin: "0 0 12px" }}>Ces réglages décident de ce que les autres stagiaires voient de vous dans la communauté : cochez ce que vous acceptez de montrer. Votre nom, votre avatar, votre cadre et les fiches que vous avez partagées restent, eux, toujours visibles.</p>
      <div className="vis-list">
        <Row k="company" label="Entreprise" value={f.company} />
        <Row k="phone" label="Téléphone" value={f.phone} />
        <Row k="email" label="Adresse e-mail" value={f.email} />
      </div>
      {msg && <p className="hint" style={{ color: msg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "8px 0 10px" }}>{msg.text}</p>}
      <button className="btn primary" disabled={busy} onClick={save} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}><Icon name="check" size={14} /> Enregistrer la visibilité</button>
    </div>
  );
}

function CompteTab({ currentEmail, role, deactivatedAt, onEmailChanged, onChanged }) {
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [eMsg, setEMsg] = useState(null);
  const [eBusy, setEBusy] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [pMsg, setPMsg] = useState(null);
  const [pBusy, setPBusy] = useState(false);

  // Désactivation volontaire du profil (migration 199).
  const [dBusy, setDBusy] = useState(false);
  const [dMsg, setDMsg] = useState(null);
  // La purge tombe 15 semaines après la demande (le serveur fait foi ; ici, c'est l'échéance annoncée).
  const datePurge = deactivatedAt ? new Date(new Date(deactivatedAt).getTime() + 15 * 7 * 24 * 60 * 60 * 1000) : null;

  async function desactiver() {
    if (!window.confirm(
      "Désactiver votre profil ?\n\nSi vous ne vous reconnectez pas pendant 15 semaines, votre progression Pizza Quest, votre mercuriale et vos fiches techniques seront définitivement supprimées, et votre accès fermé. Vos documents (attestations, conventions…) sont toujours conservés.\n\nVous reconnecter avant ce délai annule tout."
    )) return;
    setDBusy(true); setDMsg(null);
    try { await deactivateMyProfile(); onChanged && onChanged(); }
    catch (e) { setDMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setDBusy(false); }
  }
  async function reactiver() {
    setDBusy(true); setDMsg(null);
    try { await reactivateMyProfile(); onChanged && onChanged(); }
    catch (e) { setDMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setDBusy(false); }
  }

  async function saveEmail() {
    setEBusy(true); setEMsg(null);
    try {
      await changeMyEmail({ newEmail: email, currentPassword: emailPw });
      setEMsg({ ok: true, text: "Adresse e-mail modifiée." });
      setEmail(""); setEmailPw("");
      onEmailChanged && onEmailChanged();
    } catch (e) { setEMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setEBusy(false); }
  }
  async function savePw() {
    setPMsg(null);
    if (newPw.length < 8) return setPMsg({ ok: false, text: "8 caractères minimum." });
    if (newPw !== confPw) return setPMsg({ ok: false, text: "La confirmation ne correspond pas." });
    setPBusy(true);
    try {
      await changeMyPassword({ currentPassword: curPw, newPassword: newPw });
      setPMsg({ ok: true, text: "Mot de passe modifié." });
      setCurPw(""); setNewPw(""); setConfPw("");
    } catch (e) { setPMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setPBusy(false); }
  }

  return (
    <div>
      {/* E-mail */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Adresse e-mail</div>
      <p className="hint" style={{ margin: "0 0 10px" }}>Actuelle : <b>{currentEmail}</b></p>
      <div className="field"><label>Nouvel e-mail</label><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nouveau@email.com" /></div>
      <div className="field"><label>Mot de passe actuel</label><input className="inp" type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} autoComplete="current-password" /></div>
      {eMsg && <p className="hint" style={{ color: eMsg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "2px 0 10px" }}>{eMsg.text}</p>}
      <button className="btn ghost" disabled={eBusy || !email || !emailPw} onClick={saveEmail} style={{ width: "100%", justifyContent: "center" }}>Changer l'e-mail</button>

      <div style={{ borderTop: "1px solid var(--border-soft)", margin: "18px 0 14px" }} />

      {/* Mot de passe */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Mot de passe</div>
      <div className="field"><label>Mot de passe actuel</label><input className="inp" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" /></div>
      <div className="field"><label>Nouveau mot de passe</label><input className="inp" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></div>
      <div className="field"><label>Confirmer le nouveau mot de passe</label><input className="inp" type="password" value={confPw} onChange={(e) => setConfPw(e.target.value)} autoComplete="new-password" /></div>
      {pMsg && <p className="hint" style={{ color: pMsg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "2px 0 10px" }}>{pMsg.text}</p>}
      <button className="btn primary" disabled={pBusy || !curPw || !newPw || !confPw} onClick={savePw} style={{ width: "100%", justifyContent: "center" }}><Icon name="check" size={14} /> Changer le mot de passe</button>

      {/* Désactiver mon profil — réservé aux stagiaires (le serveur le refuse aux autres, pour ne
          pas couper l'accès du bureau). Pose seulement la demande ; la purge vient 15 semaines plus
          tard, sauf reconnexion. */}
      {role === "STAGIAIRE" && (
        <>
          <div style={{ borderTop: "1px solid var(--border-soft)", margin: "18px 0 14px" }} />
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Désactiver mon profil</div>
          {deactivatedAt ? (
            <>
              <p className="hint" style={{ margin: "0 0 10px" }}>
                Désactivation demandée. Sans reconnexion de votre part, votre progression Pizza Quest,
                votre mercuriale et vos fiches techniques seront supprimées
                {datePurge && <> <b>le {datePurge.toLocaleDateString("fr-FR")}</b></>} et votre accès fermé.{" "}
                <b>Vous reconnecter annule cette suppression.</b> Vos documents restent conservés.
              </p>
              <button className="btn ghost" disabled={dBusy} onClick={reactiver} style={{ width: "100%", justifyContent: "center" }}>Réactiver mon profil</button>
            </>
          ) : (
            <>
              <p className="hint" style={{ margin: "0 0 10px" }}>
                Vous pouvez désactiver votre profil. Si vous ne vous reconnectez pas pendant <b>15 semaines</b>, votre
                progression Pizza Quest, votre mercuriale et vos fiches techniques seront <b>définitivement supprimées</b> et
                votre accès fermé. Vos <b>documents</b> (attestations, conventions…) sont toujours conservés — vous reconnecter
                avant ce délai annule tout.
              </p>
              <button className="btn ghost" disabled={dBusy} onClick={desactiver} style={{ width: "100%", justifyContent: "center" }}>Désactiver mon profil</button>
            </>
          )}
          {dMsg && <p className="hint" style={{ color: dMsg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "8px 0 0" }}>{dMsg.text}</p>}
        </>
      )}
    </div>
  );
}
