import { useContext, useEffect, useState, useRef } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  getStagiaire, getLearnerDocuments, createDocument, sendDocument, deleteDocument, getTemplates, getEmargementTemplates, deleteStagiaire, sendQuizToEnrollment, checkDocumentConditions, importDocumentFile, downloadDocumentImporte, downloadDocumentPdf, deposerPiece, updateStagiaire, telechargerArchive} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Squelette } from "../components/Squelette.jsx";
import { dossierAffiche } from "../lib/lienDossier.js";
import { UserContext } from "../context/UserContext.jsx";
import { canOpen, NAV } from "../lib/nav.js";
import FicheIncomplete from "../components/FicheIncomplete.jsx";
import { lignesProjet } from "../lib/projet.js";
import { referentAvecCivilite } from "../lib/referent.js";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import EnrollmentParcours from "../components/EnrollmentParcours.jsx";
import PiecesReview from "../components/PiecesReview.jsx";
import RemisesReview from "../components/RemisesReview.jsx";
import EditStagiaireModal from "../components/EditStagiaireModal.jsx";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { initials, euro, dateHeure, dateFr } from "../lib/format.js";
import { GROUPES_DOC, repartirDocuments, sansSignature, documentsHorsParcours } from "../lib/documentsDossier.js";
import { reduireSiImage, PROFILS } from "../lib/image.js";
import { ACCEPT_PIECE, ACCEPT_DOCUMENT } from "../lib/formatsDepot.js";

const DOC_STATUS ={ A_FAIRE: ["Préparé", "n"], ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], GENERE: ["Généré", "b"], ARCHIVE: ["Archivé", "n"] };

/* Le rangement des documents (« à envoyer », « chez le stagiaire », « terminés ») vit dans
   lib/documentsDossier.js : il dépend de qui doit encore signer, pas du seul statut. */

function Row({ label, value }) {
  if (value === null || value === undefined || value === "" || value === "0.00") return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
      {/* 220 px d'intitulé sur un écran de 375 : la valeur n'avait plus que 110 px, et un e-mail
          — un seul mot — faisait défiler la page de côté. L'intitulé suit la largeur ; la valeur
          peut rétrécir et se couper où il faut. */}
      <span style={{ flex: "0 0 clamp(96px, 36%, 220px)", color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontWeight: 500 }}>{value}</span>
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

/* L'ARCHIVE ZIP DU DOSSIER (2026-09-24) ne s'offre qu'à qui peut ouvrir le coffre (« Suivi
   Qualiopi ») : c'est la garde du serveur, et l'archive contient les pièces d'identité. */
const ENTREE_SUIVI = NAV.flatMap((g) => g.items).find((it) => it.to === "/suivi");

function StagiaireDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const archiveOuvrable = !!ENTREE_SUIVI && canOpen(user, ENTREE_SUIVI);
  // Le dossier désigné par le lien qui a ouvert la fiche (`?dossier=`, depuis le tableau de bord).
  const [parametres] = useSearchParams();
  const [l, setL] = useState(null);
  const [status, setStatus] = useState(null);
  const [docs, setDocs] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [prep, setPrep] = useState({ slug: "", title: "", enrollment_ids: [] });
  const [blockedRules, setBlockedRules] = useState([]); // règles non respectées pour le modèle+dossiers choisis
  const [viewId, setViewId] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [parcoursEnr, setParcoursEnr] = useState(null);
  const [parcoursRefresh, setParcoursRefresh] = useState(0); // force le rechargement du parcours après édition
  /* DÉCLARÉS ICI, ET PAS PRÈS DE LEUR GESTIONNAIRE : la fiche a un retour anticipé
     (`if (!l)`) pendant le chargement. Des hooks placés APRÈS lui ne s'exécutent qu'une fois
     la fiche arrivée — React en compte alors deux de plus qu'au rendu précédent et lève
     l'erreur #310, ce qui vide la page. Un hook ne se met jamais derrière un `return`. */
  const fichierRef = useRef(null);
  const [etapeImport, setEtapeImport] = useState(null);
  /* LES DOCUMENTS QUE MONTRENT LES ÉTAPES du parcours affiché (leurs identifiants) : la liste du bas
     ne garde que les autres. `null` tant que le parcours de l'onglet n'est pas arrivé — sans quoi
     la liste afficherait tout, puis se viderait d'un coup. */
  const [docsEtapes, setDocsEtapes] = useState(null);

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

  // `fermer` : referme le formulaire ouvert dans l'étape du parcours, une fois le document généré.
  async function handlePrepare(e, fermer) {
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
      fermer?.();
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

  async function handleDelete(d) {
    /* CONFIRMÉE — et plus fermement pour un document SIGNÉ. La corbeille vit désormais sur la
       carte de chaque étape, à côté de l'aperçu : un clic de travers y est plus probable que dans
       l'ancienne liste. Et le serveur supprime tout, signature et PDF scellé compris : aucun
       retour possible. */
    const signe = d.status === "SIGNE";
    /* Un QCM « signé » est un QCM RÉPONDU : ce qui part avec lui, c'est la réponse et sa note, que le
       serveur supprime aussi (Notation et Résultats QCM la comptaient encore, jusqu'au 2026-09-24). */
    const avertissement = !signe ? ""
      : d.quiz_id ? "\nCe QCM est RÉPONDU : la réponse et sa note (Notation, Résultats QCM) seront supprimées avec lui."
      : "\nCe document est SIGNÉ : sa signature et son PDF scellé seront supprimés avec lui.";
    if (!window.confirm(`Supprimer « ${d.title} » ?${avertissement}\nCette action est irréversible.`)) return;
    try {
      await deleteDocument(d.id);
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  /* TÉLÉCHARGER : le fichier REÇU pour un document importé (c'est lui qui fait foi), le PDF sinon.
     Une erreur se dit : sans modèle, par exemple, le serveur n'a pas de PDF à rendre. */
  async function telecharger(d) {
    try {
      if (d.importe_le) await downloadDocumentImporte(d.id, d.fichier_nom);
      else await downloadDocumentPdf(d.id, `${d.title || "document"}.pdf`);
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

  /* LE PROJET, UNE LIGNE PAR QUESTION, comme dans le formulaire (2026-09-22) : nature, type
     d'activité, équipement — le four avec ses précisions —, avancement (lib/projet.js). */
  const projet = lignesProjet(l);

  const c = l.company;

  // AUCUNE restriction codée en dur sur les documents : la disponibilité d'un document
  // est pilotée par l'organisme via ses CONDITIONS (Modèles → Conditions / applies_when).
  const selTpl = templates.find((t) => t.slug === prep.slug);
  const canPrepare = enrollments.length > 0 && prep.enrollment_ids.length > 0 && !!selTpl && blockedRules.length === 0;

  /* Dossier dont on affiche le parcours : l'onglet choisi, sinon celui que désigne le lien, sinon
     le premier — et jamais un dossier qui n'est pas à ce stagiaire (lib/lienDossier.js). */
  const curEnrId = dossierAffiche(enrollments, parcoursEnr || parametres.get("dossier"));

  /* ── « MARQUER LA FORMATION COMME TERMINÉE » ────────────────────────────────────────────────
     LE DÉFAUT SIGNALÉ (2026-09-23) : un dossier à 100 %, toutes les étapes validées, et la fiche
     continuait d'annoncer « 0 terminée ». Les deux n'ont rien à voir — le parcours est CALCULÉ,
     la formation terminée est DÉCLARÉE (`learner.completed_levels`) — mais rien ne le disait, et
     la case vit dans un repli de la fenêtre de modification que personne n'ouvre pour ça.
     ON PROPOSE, ON NE COCHE PAS. Une session peut s'achever sans que la formation soit acquise :
     c'est l'école qui le dit, pas un calcul. Le bandeau n'apparaît donc que lorsque les deux
     conditions objectives sont réunies — session passée ET parcours complet — et il faut cliquer. */
  const curEnr = enrollments.find((e) => e.id === curEnrId) || null;
  const terminees = String(l.completed_levels || "").split(",").map((x) => x.trim()).filter(Boolean);
  const sessionPassee = !!(curEnr?.end_date && curEnr.end_date < new Date().toISOString().slice(0, 10));
  const aMarquer = !!(curEnr?.program_code && sessionPassee && !terminees.includes(curEnr.program_code));

  async function marquerTerminee() {
    if (!curEnr?.program_code) return;
    setStatus(null);
    try {
      await updateStagiaire(id, { completed_levels: [...terminees, curEnr.program_code].join(",") });
      await loadLearner();
      setStatus({ type: "success", message: `Formation ${curEnr.program_code} marquée comme terminée.` });
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  const bandeauFinFormation = () => (aMarquer ? (
    <div className="parc-fin">
      <span>
        <b>Parcours complet.</b> La formation <b>{curEnr.program_code}</b> n'est pas encore marquée
        comme terminée dans la fiche — c'est elle qui compte les formations acquises du stagiaire.
      </span>
      <button type="button" className="btn sm primary" onClick={marquerTerminee}>
        <Icon name="check" size={13} /> Marquer comme terminée
      </button>
    </div>
  ) : null);
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
    /* `accept` SUIT L'ÉTAPE, pour la MÊME raison que `multiple` juste au-dessus : le sélecteur est
       partagé, et les deux gestes n'acceptent pas les mêmes formats. Il annonçait `.doc,.docx`
       pour tout le monde, y compris pour une PIÈCE justificative que le serveur refuse en 415 —
       le fichier paraissait valide dans la fenêtre de choix, et le refus tombait après. */
    if (fichierRef.current) fichierRef.current.accept = step.piece ? ACCEPT_PIECE : ACCEPT_DOCUMENT;
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
          /* RÉDUITE AVANT L'ENVOI, comme du côté stagiaire : le secrétariat reçoit souvent la
             photo par messagerie et la redépose telle quelle. Profil LARGE et qualité haute —
             une pièce justificative doit rester lisible. Un PDF passe intact. */
          await deposerPiece(curEnrId, step.piece_id, await reduireSiImage(f, PROFILS.piece));
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
    /* UN DOCUMENT REÇU est tantôt un PDF, tantôt la photo d'un papier signé rapportée par le
       stagiaire. Le second se réduit, le premier passe intact — c'est `reduireSiImage` qui fait
       le tri, l'écran n'a pas à le savoir. */
    fd.append("file", await reduireSiImage(file, PROFILS.piece), file.name);
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

  /* DEPUIS UNE ÉTAPE DU PARCOURS : pré-remplit le modèle de l'étape et le dossier de l'onglet (le
     regroupement de plusieurs formations reste possible dans le formulaire). Le formulaire s'ouvre
     DANS l'étape (EnrollmentParcours) : plus rien à faire défiler. `slug` nul : la case « Autre
     document », hors parcours — le modèle s'y choisit, on part du premier. */
  function prepareStep(slug) {
    setPrep((p) => ({ ...p, slug: slug || templates[0]?.slug || "", title: "", enrollment_ids: curEnrId ? [curEnrId] : p.enrollment_ids }));
  }

  /* LES GESTES D'UNE ÉTAPE, sur sa carte du parcours (demandé le 2026-09-21) : ceux de l'ancienne
     liste des documents — aperçu, envoi, téléchargement, suppression —, pour ne plus avoir à
     chercher plus bas le document d'une étape. Une étape sans document (à préparer, pièce, QCM
     pas encore envoyé) n'en a aucun ; un document destiné à l'entreprise n'est pas dans la liste
     du stagiaire et reste en lecture seule, comme avant. */
  function boutonsDocument(d) {
    // Un QCM n'a pas de PDF à télécharger : ses réponses se lisent dans l'aperçu.
    const telechargeable = !!d.importe_le || (!!d.template_slug && !d.quiz_id);
    return (
      <>
        <button className="iconbtn" title="Aperçu / vérifier" aria-label={`Aperçu de ${d.title}`} onClick={() => setViewId(d.id)}><Icon name="eye" size={16} /></button>
        {d.status === "A_FAIRE" && <button className="iconbtn" title="Envoyer au stagiaire" aria-label={`Envoyer ${d.title} au stagiaire`} onClick={() => handleSend(d.id)}><Icon name="send" size={16} /></button>}
        {telechargeable && (
          <button className="iconbtn" title={d.importe_le ? `Télécharger le document reçu${d.fichier_nom ? ` (${d.fichier_nom})` : ""}` : "Télécharger le PDF"}
            aria-label={`Télécharger ${d.title}`} onClick={() => telecharger(d)}><Icon name="download" size={16} /></button>
        )}
        <button className="iconbtn del" title="Supprimer" aria-label={`Supprimer ${d.title}`} onClick={() => handleDelete(d)}><Icon name="trash" size={15} /></button>
      </>
    );
  }

  function gestesEtape(s) {
    const d = s.docId ? docs.find((x) => x.id === s.docId) : null;
    if (!d) return null;
    /* LA TRACE, sur une ligne : importé, signé ou envoyé, avec sa date — le détail complet au
       survol. « Importé » d'abord : c'est lui qui distingue un document reçu par courriel d'une
       signature faite dans l'application (cf. l'import d'un document reçu). */
    const trace = d.importe_le ? `importé le ${dateFr(d.importe_le)}`
      : d.signed_at ? `signé le ${dateFr(d.signed_at)}`
      : d.sent_at ? `envoyé le ${dateFr(d.sent_at)}`
      : "préparé, pas encore envoyé";
    const detail = [
      d.sent_at && `Envoyé le ${dateHeure(d.sent_at)}`,
      d.signed_at && `signé le ${dateHeure(d.signed_at)}`,
      d.importe_le && `reçu et importé le ${dateHeure(d.importe_le)}${d.fichier_nom ? ` (${d.fichier_nom})` : ""}`,
    ].filter(Boolean).join(" · ") || trace;
    return (
      <>
        <span className="parc-trace" title={detail}>{trace}</span>
        {boutonsDocument(d)}
      </>
    );
  }

  /* « PRÉPARER UN DOCUMENT », DANS L'ÉTAPE (demandé le 2026-09-21). Le formulaire vivait sous le
     parcours, et « Préparer ce document » faisait descendre la page jusqu'à lui. Il s'ouvre
     désormais dans l'étape sélectionnée, où le modèle est celui de l'étape ; la case « Autre
     document » l'ouvre avec le choix du modèle (`etape` nul) : un document hors parcours reste
     possible. Les formations à couvrir ne se demandent que s'il y en a plusieurs — avec une seule,
     c'est celle de l'onglet, déjà cochée. */
  function formulairePreparation(etape, fermer) {
    return (
      <form onSubmit={(e) => handlePrepare(e, fermer)} className="parc-preparation">
        {!etape && (
          <SelectField label="Modèle de document" value={prep.slug} onChange={(e) => setPrep((p) => ({ ...p, slug: e.target.value }))}>
            {templates.length === 0 && <option value="">Aucun modèle disponible</option>}
            {templates.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </SelectField>
        )}
        <Field label="Titre (facultatif)" value={prep.title} onChange={(e) => setPrep((p) => ({ ...p, title: e.target.value }))} placeholder="Laisser vide pour le titre par défaut" />
        {enrollments.length > 1 && (
          <div className="field">
            <label>Formations couvertes (regrouper plusieurs = un seul document)</label>
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
          </div>
        )}
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
        <div className="parc-preparation-gestes">
          <button type="submit" className="btn primary" disabled={!canPrepare}>Générer le document</button>
          {/* Sans étape où le replier (formation sans parcours), le formulaire reste ouvert : rien à annuler. */}
          {fermer && <button type="button" className="btn" onClick={fermer}>Annuler</button>}
          {prep.enrollment_ids.length === 0 && <span className="hint">Sélectionnez au moins une formation.</span>}
        </div>
      </form>
    );
  }

  /* LA LISTE DU BAS ne garde que les documents qu'AUCUNE étape ne montre : ceux des étapes ont
     leurs gestes sur leur carte. Sans inscription, il n'y a pas de parcours : tout y est (les
     documents d'une ancienne inscription existent, on les montre). Le parcours de l'onglet pas
     encore arrivé (`docsEtapes` nul) : rien, plutôt que tout puis presque rien. */
  const codeOnglet = enrollments.find((e) => e.id === curEnrId)?.program_code || null;
  const autres = enrollments.length === 0 ? docs
    : docsEtapes ? documentsHorsParcours(docs, docsEtapes, codeOnglet) : [];
  // Répartition selon qui doit agir (cf. GROUPES_DOC) — sur ces seuls documents.
  const parGroupe = repartirDocuments(autres);

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
      {/* Ce qui manque à la fiche, nommé : les lignes vides disparaissent de « Contact & identité »
          ci-dessous, et une adresse absente ne s'y remarquait pas (src/api/lib/ficheIncomplete.js). */}
      <FicheIncomplete manquants={l.champs_manquants} onCompleter={() => setEditOpen(true)} />

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
          {/* LE RAPPEL (migration 169), sous la prise de contact comme dans le formulaire — et
              seulement s'il est posé : une ligne « À recontacter : - » sur chaque fiche ne dirait rien. */}
          {!!l.a_recontacter && (
            <Row label="À recontacter" value={l.a_recontacter_depuis ? `Oui, depuis le ${dateFr(l.a_recontacter_depuis)}` : "Oui"} />
          )}
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
          {projet.length ? projet.map((r) => <Row key={r.label} label={r.label} value={r.value} />)
            : <p className="hint" style={{ margin: 0 }}>Aucun projet renseigné.</p>}
          {/* LA NOTE (migration 168), sous le projet comme dans le formulaire. Du texte simple : ses
              retours à la ligne sont gardés (`pre-wrap`), et un mot sans fin ne sort pas de la carte. */}
          {l.note_libre && (
            <div className="sd-note">
              <div className="sd-note-t">Note</div>
              <p>{l.note_libre}</p>
            </div>
          )}
        </Card>

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
            <Row label="Représentant" value={[referentAvecCivilite(c), c.representative_role && `(${c.representative_role})`].filter(Boolean).join(" ")} />
          </Card>
        )}
      </div>

      <Card title={T("file-text", "Parcours & documents")} className="fade"
        more={archiveOuvrable && enrollments.length > 0 && curEnrId ? (
          <button type="button" className="btn sm ghost" title="Les documents de ce dossier, rangés selon l'arborescence d'archivage"
            onClick={() => telechargerArchive({ dossier: curEnrId }).catch((e) => setStatus({ type: "error", message: e.message }))}>
            <Icon name="download" size={14} /> Archive du dossier (ZIP)
          </button>
        ) : null}>
        {enrollments.length > 0 && (
          <>
            {enrollments.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {enrollments.map((e) => {
                  const on = curEnrId === e.id;
                  return (
                    <button key={e.id} type="button" className={"btn sm " + (on ? "primary" : "ghost")} onClick={() => { setParcoursEnr(e.id); setDocsEtapes(null); }}>
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
              renderGestes={gestesEtape}
              renderPreparation={formulairePreparation}
              /* Parcours illisible (null) : aucune étape ne montre rien, la liste du bas montre tout. */
              onCharge={(d) => setDocsEtapes(new Set((d?.steps || []).map((x) => x.docId).filter(Boolean)))}
              renderFin={bandeauFinFormation}
            />
            {/* `accept` est posé par `demanderImport`, pas ici : il dépend de l'étape visée. La
                valeur du JSX n'est donc qu'un DÉFAUT, le plus restrictif des deux. */}
            <input ref={fichierRef} type="file" onChange={envoyerImport} style={{ display: "none" }}
              accept={ACCEPT_PIECE} aria-hidden="true" tabIndex={-1} />
            {/* Pièces justificatives du dossier sélectionné : validation/refus par le personnel. */}
            <PiecesReview enrollmentId={curEnrId} refresh={parcoursRefresh} />
            {/* L'AUTRE SENS, juste en dessous : ce que l'ÉCOLE remet. Les deux cartes se
                ressemblent volontairement — c'est le même geste, dans les deux directions — et
                chacune disparaît si son parcours n'en prévoit aucune. */}
            <RemisesReview enrollmentId={curEnrId} refresh={parcoursRefresh} />
          </>
        )}

        {/* HORS SESSION, RIEN À PRÉPARER — et on ne fait plus semblant. Le formulaire restait
            affiché pour une fiche inscrite nulle part : un modèle à choisir, un titre à saisir,
            puis un bouton « Générer » grisé pour toujours. Un document se rattache à un dossier
            d'inscription (le serveur le refuse sans), et un dossier n'existe que dans une
            session : sans session, il n'y a ni parcours ni document, seulement une inscription
            à faire. C'est donc elle qu'on propose. */}
        {enrollments.length === 0 && (
          <div className="sd-hors-session">
            <p style={{ margin: 0 }}>
              <b>Ce stagiaire n'est inscrit à aucune session.</b> Ses documents se préparent une fois
              inscrit : c'est l'inscription qui ouvre son parcours.
            </p>
            <button type="button" className="btn sm ghost" onClick={() => navigate("/sessions")}>
              <Icon name="calendar" size={14} /> Inscrire depuis une session
            </button>
          </div>
        )}

        {/* LES AUTRES DOCUMENTS : ceux qu'aucune étape du parcours ne montre (préparés hors parcours,
            doublon d'une étape, formation sans parcours). Ceux des étapes ont leurs gestes sur leur
            carte, juste au-dessus : les relister ici doublait la hauteur de la page (2026-09-21).
            Plus de jauge « terminés sur N » : l'avancement se lit dans le parcours, où un document
            sans signature compte comme fait dès l'envoi — la règle que la jauge avait dû apprendre.
            Hors session et sans document, l'encart ci-dessus a déjà tout dit ; les documents d'une
            ANCIENNE inscription, eux, s'affichent — ils existent. */}
        {autres.length > 0 && (
          <>
            {enrollments.length > 0 && <div className="divider" style={{ margin: "18px 0" }} />}
            <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{enrollments.length > 0 ? "Autres documents" : "Documents"}</h3>
            {enrollments.length > 0 && <p className="hint" style={{ margin: "0 0 10px" }}>Ceux qu'aucune étape du parcours ne montre.</p>}
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
                      /* `wrap` : sur un téléphone, le statut et les quatre boutons passent SOUS le titre,
                         au lieu de le réduire à une colonne d'un mot par ligne. */
                      <div key={d.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 11px", padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                        <span style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <b>{d.title}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                            {d.formations || "-"}{d.sent_at ? ` · envoyé le ${dateHeure(d.sent_at)}` : ""}{d.signed_at ? ` · signé le ${dateHeure(d.signed_at)}` : ""}
                        {/* DIT POURQUOI UN « ENVOYÉ » EST RANGÉ DANS « TERMINÉS » : sans la mention,
                            le badge bleu au milieu du groupe vert passerait pour une erreur de
                            rangement. Affichée dès la préparation, elle annonce aussi qu'il
                            suffira de l'envoyer. */}
                        {sansSignature(d) && d.status !== "SIGNE" && <span> · rien à signer</span>}
                        {/* REÇU PAR E-MAIL, ET ON LE DIT. L'étape compte comme signée, mais aucune
                            signature électronique n'a eu lieu ici : sans cette mention, on ne
                            saurait plus distinguer, six mois plus tard, un document signé dans
                            l'application d'un document rentré par courriel. */}
                        {d.importe_le && (
                          <span style={{ color: "var(--muted)" }}> · reçu et importé le {dateHeure(d.importe_le)}</span>
                        )}
                          </span>
                        </span>
                        {/* Le statut et les boutons, d'un seul bloc : ils passent ensemble sous le titre. */}
                        <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                          <Badge tone={tone}>{label}</Badge>
                          {boutonsDocument(d)}
                        </span>
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
          /* `type` : « info » quand le serveur n'a pas tout pris (la note, avant la migration 168). */
          onSaved={(msg, type = "success") => { setEditOpen(false); setStatus({ type, message: msg || "Fiche mise à jour." }); loadLearner(); loadDocs(); setParcoursRefresh((n) => n + 1); }}
          onError={(m) => setStatus({ type: "error", message: m })}
          onDelete={handleDeleteLearner}
        />
      )}
    </>
  );
}

export default StagiaireDetail;
