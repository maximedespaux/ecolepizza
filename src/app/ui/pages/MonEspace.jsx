import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { getMonEspace, getMyFormations, getMyAccess } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import QuizModal from "../components/QuizModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { colorOf, euro } from "../lib/format.js";
import { getAvatar, AVATAR_EVENT } from "../lib/gamification.js";
import { RankBar, NextStep, prochaineEtape } from "../components/StuJourney.jsx";

/**
 * Espace stagiaire — page unique, réunion de l'ancien « Mon espace » (la pile de documents
 * reçus) et de l'ancien « Mes documents » (la grille des formations).
 *
 * Les deux répondaient à la même question — « qu'est-ce que j'ai à faire ? » — mais l'une par
 * pièce et l'autre par formation, obligeant à passer de l'une à l'autre pour savoir s'il
 * restait quelque chose à signer.
 *
 * D'où cette disposition :
 *   · À FAIRE, AU-DESSUS DES ONGLETS — signatures et QCM en attente. Hors des onglets à
 *     dessein : c'est daté, et le ranger derrière un onglet reviendrait à le cacher à
 *     celui qui ouvre l'autre.
 *   · Deux onglets pour le reste : MES FORMATIONS (entrer dans un dossier) et
 *     MES DOCUMENTS (retrouver une pièce, signés compris). Deux façons de chercher la
 *     même matière — l'une par dossier, l'autre par pièce.
 */

// Libellé d'état : « À signer » seulement si le document est réellement à signer
// par le stagiaire (piloté par le modèle) ; sinon « À consulter ».
function statusFor(d) {
  if (d.status === "SIGNE") return ["Signé", "g"];
  if (d.signable) return ["À signer", "a"];
  return ["À consulter", "n"];
}
// Une pièce « à faire » = un QCM non répondu, ou un document à signer non signé.
const aFaire = (d) => d.status !== "SIGNE" && (d.signable || !!d.quiz_id);

function MonEspace() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [formations, setFormations] = useState(null);
  const [status, setStatus] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [quizDoc, setQuizDoc] = useState(null);
  const [info, setInfo] = useState(null);      // formation non suivie, en lecture seule
  const [tab, setTab] = useState("formations"); // "formations" | "documents"
  const [avatar, setAvatar] = useState(() => getAvatar(user?.id));
  const [questUnlocked, setQuestUnlocked] = useState(false);
  // L'avatar est modifiable depuis la modale de profil, hors de cette page : sans cette
  // écoute, l'accueil garderait l'ancien emoji jusqu'au prochain rechargement.
  useEffect(() => {
    const sync = () => setAvatar(getAvatar(user?.id));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [user?.id]);

  async function load() {
    try {
      const r = await getMonEspace();
      setData(r.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }
  useEffect(() => { load(); }, []);
  // Sert à savoir si l'entraînement peut être proposé comme prochaine étape.
  useEffect(() => { getMyAccess().then((r) => setQuestUnlocked(r?.data?.quest_unlocked !== false)).catch(() => {}); }, []);
  useEffect(() => {
    getMyFormations().then((r) => setFormations(r.data || []))
      .catch((err) => setStatus((s) => s || { type: "error", message: err.message }));
  }, []);
  // Les documents reçus / à signer se rafraîchissent seuls : le secrétariat en envoie
  // pendant que le stagiaire est sur la page.
  useAutoRefresh(load, { interval: 25000 });

  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  const documents = data?.documents || [];
  const enAttente = documents.filter(aFaire);

  // Formations suivies d'abord ; l'ordre du catalogue (défini par l'organisme) est conservé
  // à l'intérieur de chaque groupe.
  const triees = formations
    ? [...formations].sort((a, b) => (b.enrolled ? 1 : 0) - (a.enrolled ? 1 : 0))
    : null;
  // Une formation terminée vaut 100 points de progression (cf. scoreOf).
  const formationsDone = (formations || []).filter((f) => f.finished || f.complete).length;
  const etape = prochaineEtape({ enAttente, questUnlocked, formations: formations || [] });

  return (
    <>
      {/* Le labo et son four : le stagiaire retrouve son lieu de formation en ouvrant son espace. */}
      <div className="hero photo" style={{ "--photo": `url(${import.meta.env.BASE_URL}brand/atelier.jpg)` }}>
        <div className="eyebrow">Espace stagiaire</div>
        {/* L'avatar choisi par le stagiaire remonte dans l'accueil : c'est son espace, il doit
            s'y reconnaître dès la première ligne — pas seulement dans un coin de la barre. */}
        <div className="stu-hi">
          {avatar && <span className="stu-hi-av" style={{ background: avatar.color }} aria-hidden="true">{avatar.emoji}</span>}
          <h1>Bonjour {user?.first_name}</h1>
        </div>
        <p>
          {enAttente.length > 0
            ? "Voici ce qui vous attend aujourd'hui — puis le détail de chacun de vos dossiers."
            : "Tout est à jour. Retrouvez ici vos formations et l'ensemble de vos documents."}
        </p>
        {/* Le rang sort de la modale de profil : une progression qu'on ne voit pas ne motive
            personne. C'est la première chose que le stagiaire lit en arrivant. */}
        <RankBar formationsDone={formationsDone} />
      </div>

      {/* Une seule action mise en avant — la plus urgente. L'accueil dit quoi faire, il ne se
          contente plus de ranger des pièces dans deux onglets. */}
      <NextStep etape={etape} onOpenDoc={(d) => (d.quiz_id ? setQuizDoc(d.id) : setViewId(d.id))} />

      <StatusMessage status={status} />

      {/* ---- À faire : hors onglets, pour rester visible depuis les deux ---------------- */}
      {enAttente.length > 0 && (
        <Card title={<span className="card-ttl"><Icon name="bell" size={16} /> À faire</span>}>
          <DocList docs={enAttente} onView={setViewId} onQuiz={setQuizDoc} />
        </Card>
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={"seg-btn" + (tab === "formations" ? " on" : "")}
          onClick={() => setTab("formations")}>
          <Icon name="folder-check" size={14} /> Mes formations{triees ? ` (${triees.length})` : ""}
        </button>
        <button type="button" className={"seg-btn" + (tab === "documents" ? " on" : "")}
          onClick={() => setTab("documents")}>
          <Icon name="file-text" size={14} /> Mes documents{documents.length ? ` (${documents.length})` : ""}
        </button>
      </div>

      {tab === "formations" && (
        <Card>
          <p className="hint" style={{ marginTop: 0 }}>
            Toutes vos démarches — avant, pendant et après la formation : convocation, règlement,
            émargements, attestation, facture… Choisissez une formation pour ouvrir son dossier.
          </p>
          {!triees ? (
            <p className="hint" style={{ margin: 0 }}>Chargement…</p>
          ) : triees.length === 0 ? (
            <EmptyState icon="pizza">Aucune formation au catalogue.</EmptyState>
          ) : (
            <div className="grid cols-3">
              {triees.map((f) => <FormationCard key={f.program_id} f={f} navigate={navigate} onInfo={setInfo} />)}
            </div>
          )}
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          {documents.length === 0 ? (
            <EmptyState icon="pizza">
              Aucun document pour le moment. Le secrétariat vous enverra vos documents avant la formation.
            </EmptyState>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                Toutes vos pièces, signées comprises. Celles qui attendent encore une action
                restent rappelées en haut de page.
              </p>
              <DocList docs={documents} onView={setViewId} onQuiz={setQuizDoc} />
            </>
          )}
        </Card>
      )}

      {viewId && (
        <DocumentViewModal
          id={viewId}
          canSign={!!documents.find((d) => d.id === viewId)?.signable}
          defaultName={fullName}
          onClose={() => setViewId(null)}
          onChanged={load}
        />
      )}
      {quizDoc && <QuizModal documentId={quizDoc} onClose={() => { setQuizDoc(null); load(); }} />}
      {info && <FormationInfoModal f={info} onClose={() => setInfo(null)} />}
    </>
  );
}

/* ---- Liste de documents (partagée par « À faire » et « Tous mes documents ») ---------- */

function DocList({ docs, onView, onQuiz }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {docs.map((d) => {
        const [label, tone] = statusFor(d);
        return (
          <div key={d.id} className="stu-row">
            <span className="stu-row-t">
              <b>{d.title}</b>
              <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                {d.formations || ""}{d.signed_at ? ` · signé le ${d.signed_at}` : d.sent_at ? ` · reçu le ${d.sent_at}` : ""}
              </span>
            </span>
            <Badge tone={d.quiz_id && d.status !== "SIGNE" ? "b" : tone}>
              {d.quiz_id ? (d.status === "SIGNE" ? "Répondu" : "QCM à faire") : label}
            </Badge>
            {d.quiz_id ? (
              <button className="btn sm primary" onClick={() => onQuiz(d.id)}>
                {d.status === "SIGNE" ? "Voir mon QCM" : "Répondre au QCM"}
              </button>
            ) : (
              <button className="btn sm primary" onClick={() => onView(d.id)}>
                {d.status !== "SIGNE" && d.signable ? "Consulter / signer" : "Consulter"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Carte d'une formation ------------------------------------------------------------ */

function FormationCard({ f, navigate, onInfo }) {
  const color = f.color || colorOf(f.program_code);
  // Verrouillée si non inscrite OU RÉVOQUÉE (session commencée sans avoir franchi le point
  // d'accès). Une formation TERMINÉE reste toujours accessible.
  const locked = !f.finished && (!f.enrolled || f.revoked);
  const shown = locked ? "#9aa0b5" : color;
  const openable = !locked && f.enrollment_id; // le dossier exige une inscription
  const pct = f.total ? Math.round((f.signed / f.total) * 100) : 0;
  // Ces cartes sont LE point d'entrée de l'espace stagiaire : un `<div onClick>` nu les rendait
  // inatteignables au clavier — donc l'espace entier. `role` + `tabIndex` + Entrée/Espace leur
  // rendent le comportement d'un bouton. Espace demande `preventDefault`, sinon le navigateur
  // fait défiler la page en même temps qu'il ouvre la carte.
  const ouvrir = openable ? () => navigate(`/formations/${f.enrollment_id}`) : () => onInfo(f);
  // Le `title` seul donnait dix boutons au nom IDENTIQUE dans l'arbre d'accessibilité
  // (« Voir mes documents et mon émargement » ×10) : de quoi rendre la liste illisible en
  // navigation vocale. Le nom porte donc d'abord la formation, l'action ensuite.
  //
  // L'action se décide sur `openable`, PAS sur `locked` : une formation terminée sans
  // inscription rattachée n'est pas verrouillée mais n'ouvre pas de dossier pour autant —
  // elle affiche la fiche d'information. L'ancien libellé promettait « mes documents et mon
  // émargement » puis ouvrait « Formation non suivie ».
  const action = openable ? "voir mes documents et mon émargement" : "voir les informations";
  const nom = `${f.program_title} — ${action}`;
  return (
    <div
      className="card hover"
      role="button"
      tabIndex={0}
      aria-label={nom}
      style={{ cursor: "pointer", opacity: locked ? 0.72 : 1, borderTop: `3px solid ${shown}`,
        background: locked ? undefined : `color-mix(in srgb, ${color} 6%, var(--surface))` }}
      onClick={ouvrir}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        ouvrir();
      }}
      title={f.revoked && !f.finished ? "Accès suspendu — point d'accès non atteint au début de la session"
        : openable ? "Voir mes documents et mon émargement" : "Voir les informations (formation non suivie)"}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="badge n mono" style={{ background: shown, color: "#fff", borderColor: "transparent" }}>{f.program_code}</span>
        {/* Anneau de progression : il remplace la barre plate d'autrefois. Un anneau se lit
            d'un coup d'œil et porte le pourcentage en son centre — la barre, elle, obligeait
            à aller chercher « 3/7 signé(s) » en pied de carte pour savoir où l'on en est.
            Verrouillé ou hors inscription : on garde le pictogramme, il n'y a rien à mesurer. */}
        {f.enrolled && !f.revoked && !locked ? (
          <span className={"stu-ring" + (pct >= 100 ? " done" : "")}
            style={{ "--p": pct, "--c": pct >= 100 ? "var(--green)" : color }}
            title={`${f.signed}/${f.total} document(s) signé(s)`}>
            <span>{pct}%</span>
          </span>
        ) : (
          <span style={{ color: locked ? "#9aa0b5" : "var(--green)", display: "inline-flex" }}>
            <Icon name={locked ? "lock" : "check-circle"} size={17} />
          </span>
        )}
      </div>
      <h3 style={{ fontSize: 15, margin: "10px 0 4px" }}>{f.program_title}</h3>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
        {!f.enrolled
          ? (f.finished ? "Terminée" : "Non suivie")
          : f.start_date && f.end_date ? `Du ${f.start_date} au ${f.end_date}` : `Semaine ${f.week} · ${f.year}`}
        {f.session_count > 1 && <span style={{ marginLeft: 6, color: "var(--blue)", fontWeight: 700 }}>· {f.session_count} sessions</span>}
      </p>

      {/* La barre de progression a été retirée : l'anneau en tête de carte porte la même
          information, en plus lisible, et sans couper la carte en deux. */}
      <p style={{ fontSize: 12, margin: "12px 0 0", fontWeight: 600,
        color: (f.revoked && !f.finished) ? "var(--ember1, #c0392b)" : (f.complete || f.finished) ? "var(--green)" : "var(--muted)" }}>
        {f.revoked && !f.finished
          ? "Accès suspendu (point d'accès non atteint)"
          : f.finished
            ? (openable ? "Terminée — documents & émargement →" : "Terminée")
            : !f.enrolled ? "Non suivie" : `Documents & émargement · ${f.signed}/${f.total} signé(s) →`}
      </p>
    </div>
  );
}

/* ---- Aperçu d'une formation non suivie (catalogue) ------------------------------------ */

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === "" || value === "0.00") return null;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

function FormationInfoModal({ f, onClose }) {
  const color = f.color || colorOf(f.program_code);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge n mono" style={{ background: color, color: "#fff", borderColor: "transparent" }}>{f.program_code}</span>
            {f.program_title}
          </h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="hint" style={{ marginTop: 0 }}>
            Formation non suivie — ces informations sont fournies à titre indicatif.
            Inscrivez-vous à une session pour y accéder.
          </p>
          {/* Durée / heures / tarif : trois colonnes tant qu'elles tiennent, puis autant que
              la modale en accepte. En dur à 3, elles se tassaient à ~90px sur un téléphone. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
            <InfoRow label="Durée" value={f.days ? `${f.days} jour(s)` : null} />
            <InfoRow label="Heures" value={f.hours ? `${f.hours} h` : null} />
            <InfoRow label="Tarif" value={f.price ? euro(f.price) : null} />
          </div>
          <InfoRow label="Public visé" value={f.audience} />
          <InfoRow label="Objectif général" value={f.objective_general} />
          <InfoRow label="Objectifs pédagogiques" value={f.objectives} />
          <InfoRow label="Détail des horaires" value={f.duration_detail} />
          <InfoRow label="Déroulé du programme" value={f.program_detail} />
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export default MonEspace;
