import { useEffect, useMemo, useState, useRef } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import {
  getStagiaire, getLearnerDocuments, createDocument, sendDocument, deleteDocument, getTemplates, getEmargementTemplates, deleteStagiaire, sendQuizToEnrollment, checkDocumentConditions, updateStagiaire, importDocumentFile, downloadDocumentImporte, deposerPiece} from "../api/apiClient.js";
import { CADRES, cadreClass } from "../lib/cadres.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Squelette } from "../components/Squelette.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import EnrollmentParcours from "../components/EnrollmentParcours.jsx";
import PiecesReview from "../components/PiecesReview.jsx";
import EditStagiaireModal from "../components/EditStagiaireModal.jsx";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { initials, euro, dateHeure, dateFr } from "../lib/format.js";

const DOC_STATUS ={ A_FAIRE: ["Préparé", "n"], ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], GENERE: ["Généré", "b"], ARCHIVE: ["Archivé", "n"] };

/* Les documents ne sont pas les étapes d'un parcours unique — ce sont N pièces indépendantes,
   chacune dans son état. Six états côte à côte en liste plate n'apprennent donc rien : il fallait
   lire chaque ligne pour savoir où en était le dossier, alors que c'est précisément ce qu'on
   vient y chercher.
   Le regroupement suit QUI A LA BALLE, la seule question que se pose le secrétariat : ce qui
   est sur mon bureau, ce que j'attends du stagiaire, ce qui est clos. « Préparé » et « Généré »
   tombent ensemble parce qu'ils appellent le même geste — envoyer ; « Envoyé » et « Consulté »
   aussi — patienter ou relancer. */
const GROUPES_DOC = [
  { cle: "faire",   titre: "À envoyer",         aide: "sur votre bureau",         ton: "ember", etats: ["A_FAIRE", "GENERE"] },
  { cle: "attente", titre: "Chez le stagiaire", aide: "en attente de signature",  ton: "gold",  etats: ["ENVOYE", "CONSULTE"] },
  { cle: "fait",    titre: "Signés",            aide: "rien à faire",             ton: "green", etats: ["SIGNE", "ARCHIVE"] },
];

function Row({ label, value }) {
  if (value === null || value === undefined || value === "" || value === "0.00") return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <span style={{ flex: "0 0 220px", color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <span style={{ flex: 1, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/* `d10` A ÉTÉ SUPPRIMÉ D'ICI. Il tronquait la valeur du serveur à ses dix premiers caractères
   et rendait donc l'ISO tel quel : la date de naissance s'affichait « 1987-03-12 ». Il PASSAIT
   au travers du garde-fou de `dates-affichage.test.js`, qui interdit d'afficher un champ de date
   brut — mais ne voyait pas un appel de fonction qui avait l'air de formater. Toute date
   affichée passe par `dateFr` ou `dateHeure` de lib/format.js, sans exception locale. */

// Titre de carte avec icône de tête.
const T = (icon, text) => (
  <span className="card-ttl"><Icon name={icon} size={16} /> {text}</span>
);

/**
 * Cadres exclusifs — les trois distinctions que l'ÉCOLE accorde.
 *
 * Les cadres de parcours (Bronze → Maestro) se déduisent seuls des formations terminées et
 * n'ont donc rien à faire ici. Champion, Jury et Fondateur, eux, ne s'obtiennent pas en
 * cumulant : ils se reçoivent. Sans cet écran ils restaient verrouillés pour tout le monde,
 * affichés au stagiaire comme un objectif inaccessible.
 *
 * Registre SOBRE, pas la couche ludique : on est dans l'espace d'administration. La
 * récompense est visible côté stagiaire, ici on ne fait que la décerner.
 *
 * L'écriture passe par PATCH /learners/:id, donc par `authorizeRoles(...ADMIN_ROLES)` : un
 * formateur ne peut pas s'accorder un Champion. Elle entre aussi au journal d'audit.
 */
function CadresExclusifs({ learner, onSaved, onError }) {
  const accordes = String(learner.cadres_exclusifs || "").split(",").map((x) => x.trim()).filter(Boolean);
  const [busy, setBusy] = useState(false);

  function basculer(id) {
    const suivant = accordes.includes(id) ? accordes.filter((x) => x !== id) : [...accordes, id];
    setBusy(true);
    // Chaîne vide et non `null` : la colonne accepte les deux, mais une chaîne vide se relit
    // sans distinction de cas côté front (`split` d'une chaîne vide donne une liste vide).
    updateStagiaire(learner.id, { cadres_exclusifs: suivant.join(",") })
      .then(() => { onSaved(); onError({ type: "ok", message: "Cadres mis à jour." }); })
      .catch((err) => onError({ type: "error", message: err.message }))
      .finally(() => setBusy(false));
  }

  return (
    <Card title={T("star", "Cadres exclusifs")}>
      <p className="hint" style={{ marginTop: 0 }}>
        Distinctions accordées par l'école. Les cadres de parcours (Bronze à Maestro) se
        gagnent seuls, aux formations terminées, ils n'apparaissent pas ici.
      </p>
      <div className="cadres-attrib">
        {CADRES.filter((c) => c.exclusif).map((c) => {
          const on = accordes.includes(c.id);
          return (
            <label key={c.id} className={"cadre-attrib" + (on ? " on" : "")}>
              <input type="checkbox" checked={on} disabled={busy} onChange={() => basculer(c.id)} />
              <span className={"cadre-attrib-rond " + cadreClass(c.id)} aria-hidden="true" />
              <span className="cadre-attrib-txt">
                <b>{c.nom}</b>
                <span className="hint">{c.condition}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

function StagiaireDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  const [status, setStatus] = useState(null);
  const [docs, setDocs] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [prep, setPrep] = useState({ slug: "", title: "", enrollment_ids: [] });
  const [blockedRules, setBlockedRules] = useState([]); // règles non respectées pour le modèle+dossiers choisis
  const [viewId, setViewId] = useState(null);

  // Répartition des documents selon qui doit agir (cf. GROUPES_DOC).
  const parGroupe = useMemo(() => {
    const m = Object.fromEntries(GROUPES_DOC.map((g) => [g.cle, []]));
    for (const d of docs) {
      // Un état inconnu tombe dans « à envoyer » plutôt que de disparaître : mieux vaut un
      // document rangé au mauvais endroit qu'un document invisible.
      const g = GROUPES_DOC.find((x) => x.etats.includes(d.status));
      m[g ? g.cle : "faire"].push(d);
    }
    return m;
  }, [docs]);
  const signes = parGroupe.fait.length;
  const [editOpen, setEditOpen] = useState(false);
  const [parcoursEnr, setParcoursEnr] = useState(null);
  const [parcoursRefresh, setParcoursRefresh] = useState(0); // force le rechargement du parcours après édition
  /* DÉCLARÉS ICI, ET PAS PRÈS DE LEUR GESTIONNAIRE : la fiche a un retour anticipé
     (`if (!l)`) pendant le chargement. Des hooks placés APRÈS lui ne s'exécutent qu'une fois
     la fiche arrivée — React en compte alors deux de plus qu'au rendu précédent et lève
     l'erreur #310, ce qui vide la page. Un hook ne se met jamais derrière un `return`. */
  const fichierRef = useRef(null);
  const [etapeImport, setEtapeImport] = useState(null);

  function loadLearner() {
    return getStagiaire(id).then((r) => setL(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }
  useEffect(() => {
    loadLearner();
    loadDocs();
  }, [id]);

  // Charge la liste des modèles de documents (+ feuilles d'émargement) sélectionnables.
  useEffect(() => {
    Promise.all([getTemplates().catch(() => ({ data: [] })), getEmargementTemplates().catch(() => ({ data: [] }))])
      .then(([tpl, emg]) => {
        const docs = (tpl.data || []).filter((t) => t.active);
        const emarg = (emg.data || []).filter((t) => t.active).map((t) => ({ slug: t.slug, label: `${t.name} (émargement)`, doc_type: "EMARGEMENT" }));
        const list = [...docs, ...emarg];
        setTemplates(list);
        setPrep((p) => (p.slug ? p : { ...p, slug: list[0]?.slug || "" }));
      })
      .catch(() => {});
  }, []);

  async function loadDocs() {
    try {
      const r = await getLearnerDocuments(id);
      setDocs(r.data.documents);
      setEnrollments(r.data.enrollments);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Rafraîchit documents + parcours automatiquement (signatures faites ailleurs, envois…).
  useAutoRefresh(() => { loadDocs(); setParcoursRefresh((n) => n + 1); }, { interval: 20000 });

  // Vérifie côté serveur si le modèle choisi s'applique aux dossiers sélectionnés
  // (règles / conditions de l'organisme). On n'interdit rien en dur : on prévient.
  //
  // DOIT rester au-dessus du `if (!l)` plus bas : placé après, ce hook n'était pas appelé au
  // premier rendu (fiche pas encore chargée) puis l'était une fois les données arrivées —
  // le nombre de hooks changeait d'un rendu à l'autre et React interrompait la page, qui
  // restait blanche.
  useEffect(() => {
    if (!prep.slug || prep.enrollment_ids.length === 0) { setBlockedRules([]); return; }
    let alive = true;
    checkDocumentConditions({ template_slug: prep.slug, enrollment_ids: prep.enrollment_ids })
      .then((r) => { if (alive) setBlockedRules(r?.data?.failed || []); })
      .catch(() => { if (alive) setBlockedRules([]); });
    return () => { alive = false; };
  }, [prep.slug, prep.enrollment_ids]);

  const toggleEnroll = (eid) => setPrep((p) => ({
    ...p,
    enrollment_ids: p.enrollment_ids.includes(eid)
      ? p.enrollment_ids.filter((x) => x !== eid)
      : [...p.enrollment_ids, eid],
  }));

  async function handlePrepare(e) {
    e.preventDefault();
    setStatus(null);
    const tpl = templates.find((t) => t.slug === prep.slug);
    if (!tpl) {
      setStatus({ type: "error", message: "Sélectionnez un modèle de document." });
      return;
    }
    if (prep.enrollment_ids.length === 0) {
      setStatus({ type: "error", message: "Sélectionnez au moins une formation." });
      return;
    }
    if (blockedRules.length > 0) {
      setStatus({ type: "error", message: `Ce document ne peut pas être généré à cause de la règle : ${blockedRules.map((r) => r.label).join(", ")}` });
      return;
    }
    try {
      const type = tpl.doc_type || tpl.slug.toUpperCase().replace(/-/g, "_");
      await createDocument({ learner_id: id, type, template_slug: tpl.slug, title: prep.title, enrollment_ids: prep.enrollment_ids });
      setPrep({ slug: templates[0]?.slug || "", title: "", enrollment_ids: [] });
      setStatus({ type: "success", message: "Document généré. Vérifiez-le puis envoyez-le." });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleSend(docId) {
    setStatus(null);
    try {
      await sendDocument(docId);
      setStatus({ type: "success", message: "Document envoyé au stagiaire." });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleSendQuiz(quizId) {
    if (!curEnrId) { setStatus({ type: "error", message: "Sélectionnez d'abord une formation." }); return; }
    setStatus(null);
    try {
      await sendQuizToEnrollment(quizId, curEnrId);
      setStatus({ type: "success", message: "QCM envoyé au stagiaire." });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleDelete(docId) {
    try {
      await deleteDocument(docId);
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleDeleteLearner() {
    if (!window.confirm(`Supprimer définitivement le stagiaire ${l.first_name} ${l.last_name} ?\nSes dossiers et documents seront également supprimés. Cette action est irréversible.`)) return;
    try {
      await deleteStagiaire(id);
      navigate("/stagiaires");
    } catch (err) {
      setEditOpen(false);
      setStatus({ type: "error", message: err.message });
    }
  }

  if (!l) {
    // La page restait BLANCHE sous son titre le temps du chargement : rien ne distinguait
    // « ça arrive » de « il n'y a rien », ni d'ailleurs d'une erreur avalée. Le squelette
    // réserve en plus la place, donc la page ne saute pas quand la fiche arrive.
    return (
      <>
        <PageHead eyebrow="Stagiaire" title="Fiche stagiaire" />
        <StatusMessage status={status} />
        {!status && <Squelette lignes={4} h={92} />}
      </>
    );
  }

  const projects = [
    l.project_creation && "Création",
    l.project_takeover && "Reprise",
    l.project_oven && "Four",
    l.project_truck && "Camion / Remorque",
    l.project_job && "Cherche poste pizzaïolo(la)",
  ].filter(Boolean).join(" · ");

  const c = l.company;

  // AUCUNE restriction codée en dur sur les documents : la disponibilité d'un document
  // est pilotée par l'organisme via ses CONDITIONS (Modèles → Conditions / applies_when).
  const selTpl = templates.find((t) => t.slug === prep.slug);
  const canPrepare = enrollments.length > 0 && prep.enrollment_ids.length > 0 && !!selTpl && blockedRules.length === 0;

  // Dossier dont on affiche le parcours (onglet sélectionné).
  const curEnrId = parcoursEnr || enrollments[0]?.id || null;
  // Depuis une étape du parcours : pré-remplit le modèle + le dossier courant,
  // puis descend au formulaire (le groupement de formations reste possible).
  /* IMPORTER UN DOCUMENT REÇU (courriel, scan) SUR UNE ÉTAPE.
     Le sélecteur de fichier est un `<input>` caché déclenché par le bouton de l'étape : une
     fenêtre de plus pour choisir un fichier n'apporterait rien, le navigateur en ouvre déjà une.
     `value = ""` après coup, sinon réimporter LE MÊME fichier ne déclencherait aucun `change`
     — et l'utilisateur croirait que le bouton ne marche plus. */

  function demanderImport(step) {
    setEtapeImport(step);
    /* `multiple` SE POSE AVANT LE CLIC, sur l'unique sélecteur partagé par toutes les étapes.
       Un document reçu remplace une étape : il est seul par nature. Une pièce, elle, peut en
       attendre plusieurs — un justificatif de domicile en six pages — et le plafond vient de
       son type. L'attribut suit donc l'étape visée, il n'est pas figé dans le JSX. */
    const plusieurs = !!step.piece && (step.fichiers_attendus || 1) > 1;
    if (fichierRef.current) fichierRef.current.multiple = plusieurs;
    fichierRef.current?.click();
  }

  async function envoyerImport(e) {
    // Lus AVANT la remise à zéro : vider le champ vide aussi sa liste de fichiers.
    const fichiers = Array.from(e.target.files || []);
    const file = fichiers[0];
    e.target.value = "";
    const step = etapeImport;
    setEtapeImport(null);
    if (!file || !step) return;

    /* UNE ÉTAPE « PIÈCE » NE PASSE PAS PAR LES DOCUMENTS GÉNÉRÉS. Une carte d'identité n'est
       pas une pièce que l'école PRODUIT : elle vit dans `piece_type` / `piece_depot`, avec son
       circuit de vérification (déposée → validée ou refusée avec motif) et sa suppression
       propre. Le code cherchait ici un MODÈLE DE DOCUMENT portant le slug de l'étape — il n'en
       existe aucun — et l'écran répondait « Modèle introuvable pour cette étape » à qui
       importait simplement une carte d'identité reçue par courriel.
       Le serveur autorise explicitement le personnel à déposer pour le compte du stagiaire. */
    if (step.piece) {
      if (!curEnrId) { setStatus({ type: "error", message: "Sélectionne d'abord une inscription." }); return; }
      if (!step.piece_id) { setStatus({ type: "error", message: "Cette pièce n'est pas identifiable. Rechargez la page." }); return; }
      /* UN FICHIER PAR REQUÊTE : la route du dépôt est `single('fichier')`, et c'est elle qui
         compte les fichiers déjà présents pour refuser celui de trop. Les envoyer EN SÉRIE,
         jamais en parallèle — deux dépôts simultanés liraient le même compte et passeraient
         tous les deux le plafond. */
      let deposes = 0;
      const echecs = [];
      for (const f of fichiers) {
        try {
          await deposerPiece(curEnrId, step.piece_id, f);
          deposes += 1;
        } catch (err) {
          /* ON CONTINUE. S'arrêter au premier refus paraissait économe — la suite tomberait
             sur le même motif — mais c'est faux dès que le motif est PROPRE au fichier : une
             taille, un format. Mesuré : deux fichiers, le petit passe, le gros est refusé, et
             la sélection suivante aurait été abandonnée pour rien. On retient donc chaque
             refus avec le NOM du fichier, sans quoi il reste à deviner lequel manque. */
          echecs.push(`${f.name} (${err.message})`);
        }
      }
      if (deposes) setParcoursRefresh((n) => n + 1);
      /* LE COMPTE RENDU DIT CE QUI EST PASSÉ ET CE QUI NE L'EST PAS. Un dépôt partiel annoncé
         comme un succès laisserait croire que les six pages sont arrivées. Et il dit que la
         pièce est VALIDÉE : déposée par l'école, elle l'est du même geste — on ne réclame pas
         un second clic à qui vient d'ouvrir le document pour le téléverser. */
      if (echecs.length) {
        setStatus({
          type: "error",
          message: deposes
            ? `${deposes} fichier${deposes > 1 ? "s" : ""} sur ${fichiers.length} enregistré${deposes > 1 ? "s" : ""}. Refusé${echecs.length > 1 ? "s" : ""} : ${echecs.join(" · ")}`
            : `Refusé${echecs.length > 1 ? "s" : ""} : ${echecs.join(" · ")}`,
        });
      } else {
        setStatus({
          type: "success",
          message: deposes > 1
            ? `${deposes} fichiers enregistrés pour « ${step.label} ». La pièce est validée : vous venez de la voir.`
            : `« ${file.name} » enregistré pour « ${step.label} ». La pièce est validée : vous venez de la voir.`,
        });
      }
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    if (step.docId) {
      fd.append("document_id", step.docId);
    } else {
      /* Étape jamais générée : on fournit de quoi la CRÉER, exactement comme le formulaire
         « Générer » — même dérivation du type depuis le modèle, sinon les deux chemins
         produiraient des étapes différentes pour le même slug. */
      const tpl = templates.find((t) => t.slug === step.key);
      if (!tpl) { setStatus({ type: "error", message: "Modèle introuvable pour cette étape." }); return; }
      if (!curEnrId) { setStatus({ type: "error", message: "Sélectionne d'abord une inscription." }); return; }
      fd.append("learner_id", id);
      fd.append("type", tpl.doc_type || tpl.slug.toUpperCase().replace(/-/g, "_"));
      fd.append("template_slug", tpl.slug);
      fd.append("title", step.label || tpl.label || "");
      fd.append("enrollment_ids", JSON.stringify([curEnrId]));
    }
    try {
      await importDocumentFile(fd);
      setStatus({ type: "success", message: `« ${file.name} » rattaché à l'étape.` });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  function prepareStep(slug) {
    setPrep((p) => ({ ...p, slug, title: "", enrollment_ids: curEnrId ? [curEnrId] : p.enrollment_ids }));
    setTimeout(() => document.getElementById("sd-prepare")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  return (
    <>
      <PageHead
        eyebrow={<button className="card-more" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, WebkitTextFillColor: "var(--ember1)", display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => navigate(-1)}><Icon name="chevron-left" size={14} /> Retour</button>}
        title={`${l.civility ? l.civility + " " : ""}${l.last_name} ${l.first_name}`}
        lead={l.professional_status || ""}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn ghost" onClick={() => setEditOpen(true)}>Modifier la fiche</button>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(l.first_name, l.last_name)}</span>
          </div>
        }
      />
      <StatusMessage status={status} />

      <div className="grid cols-2">
        <Card title={T("user", "Contact & identité")}>
          <Row label="Civilité" value={l.civility} />
          <Row label="Nom" value={l.last_name} />
          <Row label="Prénom" value={l.first_name} />
          <Row label="Date de naissance" value={dateFr(l.birthday)} />
          <Row label="Lieu de naissance" value={l.birth_place} />
          <Row label="Téléphone" value={l.phone} />
          <Row label="Email" value={l.email} />
          <Row label="Adresse" value={[l.address, l.zip_code, l.town].filter(Boolean).join(", ")} />
          <Row label="Contact le" value={dateFr(l.contacted_at)} />
          <Row label="Contacté par" value={l.contacted_by} />
        </Card>

        <Card title={T("graduation", "Parcours scolaire")}>
          {(l.diploma_level || l.diploma_name || l.diploma_year || l.last_experience || l.experience_value) ? (
            <>
              <Row label="Niveau du diplôme" value={l.diploma_level} />
              <Row label="Nom du diplôme" value={l.diploma_name} />
              <Row label="Année d'obtention" value={l.diploma_year} />
              <Row label="Dernière expérience" value={l.last_experience} />
              <Row label="Durée" value={[l.experience_value, l.experience_unit].filter(Boolean).join(" ")} />
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>Aucun parcours scolaire renseigné.</p>
          )}
        </Card>

        <Card title={T("euro", "Statut & financement")}>
          <Row label="Statut" value={l.professional_status} />
          <Row label="Type de devis" value={l.financing === "PROFESSIONNEL" ? "Professionnel" : "Particulier"} />
          <Row label="OPCO / financeur" value={l.opco} />
          <Row label="Montant CPF" value={l.cpf_amount ? euro(l.cpf_amount) : null} />
          <Row label="Identifiant France Travail" value={l.france_travail_id} />
          <Row label="Contrat actuel" value={l.current_contract} />
          <Row label="N° de sécurité sociale" value={l.social_security} />
        </Card>

        <Card title={T("target", "Projet")}>
          {projects ? <p style={{ margin: 0 }}>{projects}</p> : <p className="hint" style={{ margin: 0 }}>Aucun projet renseigné.</p>}
        </Card>

        <CadresExclusifs learner={l} onSaved={loadLearner} onError={setStatus} />

        {c && (
          <Card title={T("building", "Entreprise")} className="cols-2" >
            <Row label="Nom" value={c.name} />
            <Row label="Statut juridique" value={c.legal_status} />
            <Row label="SIRET" value={c.siret} />
            <Row label="Code NAF/APE" value={c.naf_ape} />
            <Row label="Adresse" value={[c.address, c.zip_code, c.town].filter(Boolean).join(", ")} />
            <Row label="Téléphone" value={c.phone} />
            <Row label="Email" value={c.email} />
            <Row label="OPCO" value={c.opco} />
            <Row label="Représentant" value={[c.representative_civ, c.representative_name, c.representative_role && `(${c.representative_role})`].filter(Boolean).join(" ")} />
          </Card>
        )}
      </div>

      <Card title={T("file-text", "Parcours & documents")} className="fade">
        {enrollments.length > 0 && (
          <>
            {enrollments.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {enrollments.map((e) => {
                  const on = curEnrId === e.id;
                  return (
                    <button key={e.id} type="button" className={"btn sm " + (on ? "primary" : "ghost")} onClick={() => setParcoursEnr(e.id)}>
                      {e.program_code}{e.week ? ` · S${e.week}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <EnrollmentParcours
              enrollmentId={curEnrId}
              refresh={parcoursRefresh}
              onOpenDoc={(docId) => setViewId(docId)}
              onPrepare={prepareStep}
              onSendQuiz={handleSendQuiz}
              onImport={demanderImport}
            />
            <input ref={fichierRef} type="file" onChange={envoyerImport} style={{ display: "none" }}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" aria-hidden="true" tabIndex={-1} />
            {/* Pièces justificatives du dossier sélectionné : validation/refus par le personnel. */}
            <PiecesReview enrollmentId={curEnrId} refresh={parcoursRefresh} />
            <div className="divider" style={{ margin: "18px 0" }} />
          </>
        )}

        <div id="sd-prepare" />
        <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>Préparer un document</h3>
        <form onSubmit={handlePrepare} style={{ marginBottom: 16 }}>
          <div className="row2">
            <SelectField label="Modèle de document" value={prep.slug} onChange={(e) => setPrep((p) => ({ ...p, slug: e.target.value }))}>
              {templates.length === 0 && <option value="">Aucun modèle disponible</option>}
              {templates.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </SelectField>
            <Field label="Titre (facultatif)" value={prep.title} onChange={(e) => setPrep((p) => ({ ...p, title: e.target.value }))} placeholder="Laisser vide pour le titre par défaut" />
          </div>
          <div className="field">
            <label>Formations couvertes (regrouper plusieurs = un seul document)</label>
            {enrollments.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Ce stagiaire n'est inscrit à aucune formation. Inscrivez-le depuis une session.</p>
            ) : (
              <DataTable
                className="enroll-table"
                rows={enrollments}
                rowKey={(e) => e.id}
                /* La ligne entière coche le dossier — la case seule serait une cible de 17 px.
                   `aria-pressed` dit l'état à la navigation vocale, que la case porte déjà
                   visuellement. */
                rowProps={(e) => ({
                  className: prep.enrollment_ids.includes(e.id) ? "on" : "",
                  style: { cursor: "pointer" },
                  onClick: () => toggleEnroll(e.id),
                })}
                cols={[
                  { k: "coche", t: "", th: { width: 34 }, td: { textAlign: "center" },
                    cell: (e) => (
                      <input type="checkbox" checked={prep.enrollment_ids.includes(e.id)}
                        aria-label={`Inclure le dossier ${e.program_code}`}
                        onChange={() => toggleEnroll(e.id)} onClick={(ev) => ev.stopPropagation()} />
                    ) },
                  { k: "code", t: "Code", cell: (e) => <span className="mono" style={{ fontSize: 12 }}>{e.program_code}</span> },
                  { k: "titre", t: "Formation", principal: true, cell: (e) => e.program_title },
                  { k: "semaine", t: "Semaine", cell: (e) => <span className="chiffres">{e.week ? `S${e.week}${e.year ? ` · ${e.year}` : ""}` : "-"}</span> },
                  { k: "dates", t: "Dates", td: { fontSize: 12.5, whiteSpace: "nowrap" },
                    cell: (e) => {
                      /* Troisième format sur la MÊME page avant aujourd'hui : celui-ci rendait
                         bien « 12/03/1987 », mais par `new Date(iso)`, qui se lit en UTC et rend
                         la veille dans tout fuseau négatif. `dateFr` découpe la chaîne. */
                      return e.start_date ? `${dateFr(e.start_date)}${e.end_date ? ` → ${dateFr(e.end_date)}` : ""}` : "-";
                    } },
                  { k: "type", t: "Type", td: { fontSize: 12.5 },
                    cell: (e) => (e.financing === "PROFESSIONNEL" ? "Entreprise" : "Particulier") },
                ]}
              />
            )}
          </div>
          {blockedRules.length > 0 && (
            <div className="doc-rule-warning" role="alert">
              <Icon name="ban" />
              <div>
                {blockedRules.map((r) => (
                  <div key={r.slug}>Ce document ne peut pas être généré à cause de la règle : <strong>{r.label}</strong></div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" className="btn primary" disabled={!canPrepare}>Générer le document</button>
            {prep.enrollment_ids.length === 0 && enrollments.length > 0 && <span className="hint">Sélectionnez au moins une formation.</span>}
          </div>
        </form>

        {docs.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucun document préparé.</p>
        ) : (
          <>
            {/* L'AVANCEMENT SE VOIT AVANT DE SE LIRE. Une jauge, puis les documents rangés selon
                qui doit agir — « à envoyer » en tête, parce que c'est le seul groupe qui demande
                quelque chose. */}
            <div className="docs-jauge">
              <div className="docs-barre" role="img"
                aria-label={`${signes} document(s) signé(s) sur ${docs.length}`}>
                <span style={{ width: `${docs.length ? Math.round((signes / docs.length) * 100) : 0}%` }} />
              </div>
              <span><b className="chiffres">{signes}</b> signé{signes > 1 ? "s" : ""} sur <b className="chiffres">{docs.length}</b></span>
            </div>

            {GROUPES_DOC.map((g) => {
              const items = parGroupe[g.cle];
              // Un groupe vide ne s'affiche pas : « À envoyer — 0 » trois fois de suite
              // apprendrait à ignorer la zone, et le jour où il compte on ne le verrait plus.
              if (!items.length) return null;
              return (
                <div className="docs-grp" key={g.cle}>
                  <div className={`docs-grp-t ton-${g.ton}`}>
                    <span className="docs-pt" aria-hidden="true" />
                    {g.titre} <b className="chiffres">{items.length}</b>
                    <i>{g.aide}</i>
                  </div>
                  {items.map((d) => {
                    const [label, tone] = DOC_STATUS[d.status] || [d.status, "n"];
                    return (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{d.title}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                            {d.formations || "-"}{d.sent_at ? ` · envoyé le ${dateHeure(d.sent_at)}` : ""}{d.signed_at ? ` · signé le ${dateHeure(d.signed_at)}` : ""}
                        {/* REÇU PAR E-MAIL, ET ON LE DIT. L'étape compte comme signée, mais aucune
                            signature électronique n'a eu lieu ici : sans cette mention, on ne
                            saurait plus distinguer, six mois plus tard, un document signé dans
                            l'application d'un document rentré par courriel. */}
                        {d.importe_le && (
                          <span style={{ color: "var(--muted)" }}> · reçu et importé le {dateHeure(d.importe_le)}</span>
                        )}
                          </span>
                        </span>
                        <Badge tone={tone}>{label}</Badge>
                        <button className="iconbtn" title="Aperçu / vérifier" aria-label={`Aperçu de ${d.title}`} onClick={() => setViewId(d.id)}><Icon name="eye" size={16} /></button>
                        {d.status === "A_FAIRE" && <button className="iconbtn" title="Envoyer au stagiaire" aria-label={`Envoyer ${d.title} au stagiaire`} onClick={() => handleSend(d.id)}><Icon name="send" size={16} /></button>}
                        {d.importe_le && (
                      <button className="iconbtn" title={`Ouvrir le document reçu${d.fichier_nom ? ` (${d.fichier_nom})` : ""}`}
                        aria-label={`Ouvrir le document reçu pour ${d.title}`}
                        onClick={() => downloadDocumentImporte(d.id, d.fichier_nom)}><Icon name="file-text" size={16} /></button>
                    )}
                    <button className="iconbtn del" title="Supprimer" aria-label={`Supprimer ${d.title}`} onClick={() => handleDelete(d.id)}><Icon name="trash" size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </Card>

      {viewId && (
        <DocumentViewModal id={viewId} onClose={() => setViewId(null)} onChanged={() => { loadDocs(); setParcoursRefresh((n) => n + 1); }} />
      )}

      {editOpen && (
        <EditStagiaireModal
          id={l.id}
          onClose={() => setEditOpen(false)}
          onSaved={(msg) => { setEditOpen(false); setStatus({ type: "success", message: msg || "Fiche mise à jour." }); loadLearner(); loadDocs(); setParcoursRefresh((n) => n + 1); }}
          onError={(m) => setStatus({ type: "error", message: m })}
          onDelete={handleDeleteLearner}
        />
      )}
    </>
  );
}

export default StagiaireDetail;
