import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { getEnrollmentParcours, getDocumentsRecuperables, recupererDocuments } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import Badge from "./Badge.jsx";

/* L'ÉTAT RÉEL D'UNE ÉTAPE, calculé par le serveur (lib/parcours.js, `etat`), et sa présentation.
   Demandé le 2026-09-21 : la coche orange marquait tout ce qui précédait l'étape en cours, et le
   gris tout ce qui la suivait — une pièce déposée ou une convention signée « en avance »
   s'affichaient grisées, comme si rien n'avait eu lieu. Chaque étape montre maintenant ce qui
   s'est passé pour elle : l'icône, la couleur ET le mot, pour ne jamais dépendre de la seule
   couleur. */
const ETATS = {
  A_FAIRE: { libelle: "À faire", classe: "a-faire", icone: null, ton: "n" },
  ENVOYE: { libelle: "Envoyé", classe: "envoye", icone: "send", ton: "b" },
  RECU: { libelle: "Reçu", classe: "recu", icone: "download", ton: "a" },
  VALIDE: { libelle: "Validé", classe: "valide", icone: "check", ton: "g" },
  SANS_OBJET: { libelle: "Sans objet", classe: "sans-objet", icone: "minus", ton: "n" },
};
// Serveur d'avant `etat` : on retombe sur le rang, le mieux qu'on sache dire.
const etatDe = (s) => s.etat || (s.status === "done" ? "VALIDE" : "A_FAIRE");

// Icône du TYPE d'étape (ce qu'il faut faire) : affichée tant que rien ne s'est passé.
function iconeDuType(s) {
  if (s.quiz) return "help";
  if (s.piece) return "upload";
  if (s.signable) return "pencil";
  return "file-text";
}
const iconeDe = (s) => ETATS[etatDe(s)]?.icone || iconeDuType(s);

// Étape « de groupe » (parcours entreprise) : porte des compteurs gen/total/signed.
const isGroup = (s) => s && s.total != null;

// Sous-titre affiché sous chaque étape de la chronologie. En mode groupe (fiche
// entreprise) on montre le compteur de signatures d'un coup d'œil (0/2, 1/2…).
function listSub(s) {
  /* UNE REMISE DE GROUPE se DÉPOSE puis s'ACCUSE (2026-09-28) : on compte les accusés de réception,
     pas des signatures ni des documents générés — elle n'en produit aucun. */
  if (isGroup(s) && s.remise) return s.total ? `${s.signed}/${s.total} réception(s) confirmée(s)` : "Sans objet pour ce groupe";
  if (isGroup(s) && s.company_level) {
    // Document de groupe = UNE signature (organisme + entreprise), pas par stagiaire.
    if (s.total > 1) return `${s.signed}/${s.total} document(s) signé(s)`; // plusieurs OPCO
    return s.signed >= 1 ? "Signé (organisme + entreprise)" : "À signer (organisme + entreprise)";
  }
  if (isGroup(s) && s.total > 0) {
    // Document SANS signature (ni QCM) : il ne se signe pas, il se REÇOIT — on compte les reçus.
    if (!s.signable && !s.quiz) return s.gen >= s.total ? "Reçu" : `${s.gen}/${s.total} reçu(s)`;
    return `${s.signed}/${s.total} signé(s)`;
  }
  if (isGroup(s)) return "Aucun stagiaire concerné";
  return s.sub;
}

// Ligne d'état de l'étape sélectionnée (selon son état et le document lié).
function lineFor(s) {
  const etat = etatDe(s);
  if (isGroup(s)) {
    if (s.remise) {
      if (!s.total) return "Sans objet pour les stagiaires de ce groupe.";
      const qui = s.remiseEntreprise ? "par l'entreprise, dans son espace" : "par chaque stagiaire, dans son espace";
      return `${s.gen}/${s.total} déposé(s) · ${s.signed}/${s.total} réception(s) confirmée(s) ${qui}.`;
    }
    if (s.company_level) {
      if (s.total > 1) return `Document de groupe (entreprise) · ${s.signed}/${s.total} document(s) signé(s).`;
      /* Deux-points et non tiret cadratin (règle du 2026-08-03). Cette ligne portait « groupe (signé (… » et
         « groupe) à faire… » : le remplacement automatique avait pris les tirets des DEUX phrases pour
         une seule incise, et ouvert la parenthèse dans l'une pour la fermer dans l'autre. */
      return s.signed >= 1 ? "Document de groupe : signé (organisme + entreprise)." : "Document de groupe : à faire signer (organisme + entreprise).";
    }
    if (!s.signable && !s.quiz) return `${s.gen}/${s.total} reçu(s) · document sans signature, fait dès qu'il est reçu · à générer depuis chaque fiche stagiaire.`;
    return `${s.signed}/${s.total} stagiaire(s) ont signé · ${s.gen}/${s.total} généré(s) · à générer depuis chaque fiche stagiaire.`;
  }
  // Doc destiné à l'entreprise, vu depuis la fiche stagiaire : lecture seule.
  if (s.company_level) {
    if (etat === "VALIDE") return "Document entreprise signé.";
    return "Document destiné à l'entreprise, généré depuis la fiche entreprise.";
  }
  // Étape « pièce » (dépôt du stagiaire, ex. carte d'identité) : statut piloté par le dépôt,
  // pas par un document. Le dépôt/validation se fait dans le panneau « Pièces justificatives ».
  if (s.piece) {
    return { VALIDEE: "Pièce validée.", DEPOSEE: "Reçue du stagiaire, à vérifier ci-dessous.",
      REFUSEE: "Refusée : le stagiaire doit en renvoyer une.", ATTENDUE: "En attente du dépôt par le stagiaire." }[s.pieceStatus]
      || "Pièce à fournir.";
  }
  if (s.remise) {
    if (etat === "SANS_OBJET") return "Sans objet pour ce dossier.";
    /* À QUI (migration 188) : l'entreprise du dossier quand le type de remise lui est destiné —
       c'est alors elle qui en accuse réception, depuis son espace —, sinon le stagiaire. */
    const a = s.remiseEntreprise ? "à l'entreprise" : "au stagiaire";
    return { RECUE: `Remis ${a}, réception confirmée.`, REMISE: `Remis ${a}, en attente de son accusé de réception.` }[s.remiseStatus]
      || `Document à remettre ${a}.`;
  }
  if (etat === "VALIDE") return s.signable || s.quiz ? "Complété / signé." : "Document produit et envoyé.";
  if (s.quiz) return s.docId ? "Envoyé : en attente de la réponse du stagiaire au QCM." : "QCM à envoyer au stagiaire.";
  if (s.signable) {
    if (!s.docId) return "Document à préparer, puis à faire signer.";
    if (s.docStatus === "A_FAIRE") return "Document préparé, à envoyer au stagiaire.";
    return "Envoyé : en attente de la signature du stagiaire.";
  }
  if (!s.docId) return "Document à préparer.";
  if (s.docStatus === "A_FAIRE") return "Document préparé, à envoyer.";
  return "En cours.";
}
/* LE GESTE « DÉPOSER / IMPORTER » D'UNE ÉTAPE (`onImport`). Jamais sur un QCM : un questionnaire ne se
   remplace pas par un fichier. Ni sur une étape « stagiaire » vue depuis l'entreprise — elle ne dit pas de
   quel stagiaire il s'agit —, SAUF une REMISE : l'école la dépose de là pour chacun (2026-09-28, l'AGEFICE
   de LA CUISINE DE JULIEN). Ni sur une remise sans objet : rien n'y est dû. */
function importPossible(s) {
  if (String(s.key || "").startsWith("quiz:")) return false;
  if (s.remise) return etatDe(s) !== "SANS_OBJET";
  /* Un document de GROUPE vu depuis la fiche STAGIAIRE (donc pas `isGroup` : la fiche stagiaire ne
     porte pas les compteurs du groupe) ne se gère pas ici — il se génère, s'envoie et s'importe sur
     la fiche ENTREPRISE (2026-10-03). On n'y propose donc pas « Importer un document reçu » : la
     fiche stagiaire y mène par un bouton « Gérer sur la fiche entreprise » (renderGestes). */
  if (!isGroup(s) && s.company_level) return false;
  return !(isGroup(s) && !s.company_level);
}
/* LE MOT CHANGE PARCE QUE LE GESTE CHANGE : une pièce reçue se dépose et se valide, un document remis se
   DÉPOSE (l'école le donne, le destinataire en accuse réception), un document reçu s'IMPORTE. */
const libelleImport = (s) => (s.piece ? "Déposer la pièce reçue" : s.remise ? "Déposer le document" : "Importer un document reçu");
function titreImport(s) {
  if (s.piece) return "Déposer ici une pièce reçue par e-mail ou scannée : elle sera validée du même geste";
  if (s.remise) {
    return `Déposer le document que l'école remet : ${s.remiseEntreprise ? "l'entreprise" : "le stagiaire"} le reçoit dans son espace, et en accuse réception`;
  }
  return isGroup(s)
    ? "Rattacher à cette étape l'exemplaire signé renvoyé par l'entreprise (e-mail, scan)"
    : "Rattacher à cette étape un document reçu par e-mail ou scanné";
}
function actionFor(s) {
  // Pièce : aucun « Préparer » — le stagiaire dépose, l'école valide dans le panneau Pièces.
  /* Remise : aucun non plus. Son étape ne désigne pas un MODÈLE (sa clé n'en est pas un) : le
     formulaire ouvert pour elle ne pouvait que répondre « Sélectionnez un modèle de document ».
     Ce que l'école remet se marque dans le panneau des remises, sous le parcours. */
  if (s.piece || s.remise) return null;
  if (isGroup(s)) {
    // Fiche entreprise : seuls les documents de groupe se génèrent ici ; les documents
    // stagiaire sont visibles mais générés depuis chaque fiche stagiaire.
    if (s.company_level) return { label: "Préparer le document", kind: "prepare" };
    return null;
  }
  // Fiche stagiaire : un document destiné à l'entreprise est en lecture seule
  // (consultable s'il existe, mais jamais généré ici).
  if (s.company_level) return s.docId ? { label: s.signable ? "Ouvrir la signature" : "Voir le document", kind: "open" } : null;
  /* PLUS DE CONDITION DE RANG : une étape faite n'a plus d'action, les autres en ont une, où
     qu'elles soient dans le parcours — on peut préparer la convention avant que la pièce
     d'identité soit validée. */
  const etat = etatDe(s);
  if (etat === "VALIDE" || etat === "SANS_OBJET") return null;
  if (s.docId) return { label: s.signable ? "Ouvrir la signature" : s.quiz ? "Voir le QCM" : "Voir le document", kind: "open" };
  if (s.quiz) return { label: "Envoyer le QCM", kind: "send-quiz" }; // envoi manuel au stagiaire
  return { label: "Préparer ce document", kind: "prepare" };
}

/* Combien d'étapes dans chaque état — les compteurs et la barre de l'en-tête. « Sans objet »
   compte avec « validé » dans l'avancement (serveur), mais se nomme à part. Les étapes
   FACULTATIVES (migration 188) n'y entrent pas : l'appelant les écarte, comme le serveur. */
function repartition(steps) {
  const n = { A_FAIRE: 0, ENVOYE: 0, RECU: 0, VALIDE: 0, SANS_OBJET: 0 };
  for (const s of steps) n[etatDe(s)] = (n[etatDe(s)] || 0) + 1;
  return n;
}
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
// La case « Autre document » de la grille : un document hors parcours, dont on choisit le modèle.
const AUTRE = "__autre__";

/**
 * Parcours documentaire d'un dossier, de haut en bas : l'avancement, puis l'ÉTAPE SÉLECTIONNÉE
 * (la prochaine, à l'ouverture), puis toutes les étapes, en grille.
 *
 * DISPOSITION DEMANDÉE LE 2026-09-21. Le détail vivait dans une colonne de droite, collante : il
 * prenait près de la moitié de la largeur, et les étapes s'empilaient dans l'autre moitié, une
 * douzaine de lignes à faire défiler. Il passe EN HAUT, juste sous le pourcentage — c'est là que
 * l'œil arrive en ouvrant la fiche —, et les étapes prennent toute la largeur.
 * `onOpenDoc(docId)` ouvre l'aperçu/signature ; `onPrepare`, `onSendQuiz`, `onImport` et
 * `onSignLink` sont les gestes proposés sur l'étape sélectionnée.
 *
 * TROIS AJOUTS FACULTATIFS, pour qu'une page n'ait plus rien à montrer PLUS BAS (fiche stagiaire,
 * 2026-09-21 : « intégrer les boutons voir, télécharger, supprimer aux cartes, et Préparer un
 * document dans l'étape, pour ne plus descendre ») :
 *   · `renderGestes(étape)` : les boutons du document de l'étape, posés sur SA carte ;
 *   · `renderPreparation(étape | null, fermer)` : le formulaire de préparation, ouvert DANS
 *     l'étape par « Préparer ce document » — `null` pour la case « Autre document », hors
 *     parcours, où le modèle se choisit ;
 *   · `onCharge(données | null)` : le parcours reçu (null s'il n'a pas pu l'être), pour que la
 *     page sache quels documents les étapes montrent déjà.
 * Sans eux (fiche entreprise), rien ne change : « Préparer » appelle `onPrepare`, comme avant.
 */
function EnrollmentParcours({ enrollmentId, fetcher, resetKey, refresh, onOpenDoc, onPrepare, onSendQuiz, onSignLink, onImport, renderGestes, renderPreparation, onCharge, renderFin, financingValue, onChangeFinancing, companyValue, companies, onChangeCompany }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);
  // Clé de l'étape dont le formulaire de préparation est ouvert (ou AUTRE), sinon null.
  const [preparation, setPreparation] = useState(null);
  /* RATTACHER UN DOCUMENT DÉTACHÉ (coffre) à une étape — seulement sur un dossier stagiaire
     (enrollmentId). Une session supprimée puis recréée laisse ses documents orphelins, qui tombent
     dans « Sans session » du coffre : on les raccroche étape par étape, sur les étapes encore VIDES,
     à ceux qui VONT à l'étape (même modèle/QCM). Les rattacher les refile aussi sous la session. */
  const [detaches, setDetaches] = useState([]);
  const [attachePour, setAttachePour] = useState(null); // clé d'étape dont le sélecteur est ouvert
  const [attacheSel, setAttacheSel] = useState(() => new Set());
  const [attacheEnvoi, setAttacheEnvoi] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);
  const detailRef = useRef(null);
  // Clé de réinitialisation : dossier stagiaire (enrollmentId) ou clé fournie (ex. session entreprise).
  const key = resetKey ?? enrollmentId;

  // Au changement de contexte seulement : on remet l'affichage en état de chargement.
  // (Un simple rafraîchissement ne vide PAS l'affichage : évite le clignotement.)
  useEffect(() => { setData(null); setSel(null); setError(null); setPreparation(null); }, [key]);

  useEffect(() => {
    let active = true;
    (fetcher ? fetcher() : getEnrollmentParcours(enrollmentId))
      .then((r) => {
        if (!active) return;
        setData(r.data);
        setError(null);
        /* Ne réinitialise la sélection que si aucune étape n'est encore choisie (sinon un
           rafraîchissement automatique ferait « sauter » la sélection).
           PARCOURS TERMINÉ : ON OUVRE LA DERNIÈRE ÉTAPE, pas la première. Sans `currentKey` —
           c'est-à-dire quand il n'y a plus rien à faire — le repli tombait sur l'étape 1, et la
           fiche affichait « Étape 1 sur 16 » juste sous « 100 % · 0 à faire ». Signalé sur un
           dossier complet le 2026-09-23 : on croyait le parcours au début alors qu'il était fini. */
        const derniere = r.data.steps[r.data.steps.length - 1]?.key || null;
        setSel((cur) => cur || r.data.currentKey || derniere);
        onCharge?.(r.data);
      })
      .catch((e) => { if (active) { setError(e.message); onCharge?.(null); } });
    return () => { active = false; };
  }, [key, refresh, localRefresh]);

  // Les documents détachés rattachables (coffre), rafraîchis avec le parcours. Vide en mode groupe
  // (fiche entreprise, sans enrollmentId) : le rattachement par étape ne vaut que pour un dossier.
  useEffect(() => {
    if (!enrollmentId) { setDetaches([]); return undefined; }
    let active = true;
    getDocumentsRecuperables(enrollmentId)
      .then((r) => { if (active) setDetaches(r.data || []); })
      .catch(() => { if (active) setDetaches([]); });
    return () => { active = false; };
  }, [enrollmentId, refresh, localRefresh]);

  /* SANS ÉTAPE — formation sans parcours, ou parcours illisible —, il n'y a aucune étape où ouvrir
     le formulaire. Il est alors proposé tel quel, modèle au choix : préparer un document ne dépend
     pas du parcours, et l'ancien formulaire, sous le parcours, restait disponible dans ces cas-là.
     Pré-rempli (le dossier de l'onglet) une fois par dossier affiché, pas à chaque rafraîchissement :
     un titre en cours de saisie ne s'efface pas toutes les vingt secondes. */
  const sansEtapes = !!error || (!!data && data.steps.length === 0);
  useEffect(() => { if (sansEtapes && renderPreparation) onPrepare?.(null, null); }, [sansEtapes, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un document détaché "va" à une étape si son modèle (template_slug) ou son QCM (quiz_id)
  // correspond à la CLÉ de l'étape (le slug, ou `quiz:<id>`) — la même règle que le parcours.
  const detachesParEtape = useMemo(() => {
    const m = new Map();
    for (const d of detaches) {
      const cle = d.quiz_id ? `quiz:${d.quiz_id}` : d.template_slug;
      if (!cle) continue;
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle).push(d);
    }
    return m;
  }, [detaches]);

  const messageSansEtapes = error || "Cette formation n'a pas de parcours documentaire. Définissez-le dans Formations → Parcours documentaire.";
  if (sansEtapes && renderPreparation) return (
    <div className="card" style={{ padding: 18 }}>
      <p className="hint" style={{ margin: 0, color: error ? "var(--amber, #b8860b)" : undefined }}>{messageSansEtapes}</p>
      <h3 style={{ fontSize: 15, margin: "16px 0 0" }}>Préparer un document</h3>
      {renderPreparation(null, null)}
    </div>
  );
  if (error) return <p className="hint" style={{ color: "var(--amber, #b8860b)" }}>{error}</p>;
  if (!data) return <p className="hint">Chargement du parcours…</p>;
  if (!data.steps.length) return <p className="hint">{messageSansEtapes}</p>;

  const libre = sel === AUTRE && !!renderPreparation;
  const step = data.steps.find((s) => s.key === sel) || data.steps[Math.min(data.currentIndex, data.steps.length - 1)];
  const action = actionFor(step);
  const etatSel = ETATS[etatDe(step)] || ETATS.A_FAIRE;
  const prepareIci = !libre && !!renderPreparation && preparation === step.key;

  function runAction() {
    if (!action) return;
    if (action.kind === "open" && step.docId) onOpenDoc?.(step.docId);
    else if (action.kind === "prepare") {
      /* LE FORMULAIRE S'OUVRE DANS L'ÉTAPE quand la page le fournit : il vivait sous le parcours,
         et chaque « Préparer ce document » faisait descendre la page jusqu'à lui. `onPrepare`
         reste appelé : c'est lui qui pré-remplit le modèle et le dossier (et, sans formulaire
         fourni, qui ouvre celui de la page — fiche entreprise). */
      if (renderPreparation) setPreparation(step.key);
      onPrepare?.(step.key, step); // step transmis (mode groupe)
    }
    else if (action.kind === "send-quiz" && step.key?.startsWith("quiz:")) onSendQuiz?.(step.key.slice(5));
  }

  /* LE DÉTAIL EST AU-DESSUS DES ÉTAPES. Sur un écran étroit, la grille tient sur une seule colonne :
     choisir une étape du bas changerait un détail resté hors de vue, et rien ne semblerait se
     passer. On le ramène donc à l'écran — sans rien bouger s'il y est déjà (`nearest`). */
  function choisir(cle) {
    setSel(cle);
    // Un formulaire ouvert appartient à SON étape : en choisir une autre le referme.
    setPreparation(cle === AUTRE ? AUTRE : (p) => (p === cle ? p : null));
    if (cle === AUTRE) onPrepare?.(null, null);
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest", behavior: doux ? "smooth" : "auto" }));
  }
  // « Annuler », ou le document généré : on referme — et « Autre document » rend la main à l'étape du parcours.
  function fermer() {
    setPreparation(null);
    if (sel === AUTRE) setSel(data.currentKey || data.steps[0]?.key || null);
  }

  // Ouvre le sélecteur de documents détachés pour une étape (tout coché par défaut).
  function ouvrirAttache(cle) {
    setAttachePour(cle);
    setAttacheSel(new Set((detachesParEtape.get(cle) || []).map((d) => d.id)));
  }
  // Rattache les documents détachés choisis au dossier, puis recharge parcours ET liste des détachés.
  async function rattacher() {
    if (attacheEnvoi || !attacheSel.size) return;
    setAttacheEnvoi(true);
    try {
      await recupererDocuments(enrollmentId, [...attacheSel]);
      setAttachePour(null);
      setAttacheSel(new Set());
      setLocalRefresh((v) => v + 1);
    } catch { /* silencieux : le document reste détaché, rien n'est cassé */ }
    finally { setAttacheEnvoi(false); }
  }

  const h = data.header || {};
  /* LE TYPE DE DEVIS est sorti de cette ligne de texte : il se CHANGE ici, dossier par dossier, par
     un petit menu (onChangeFinancing) — c'est la seule façon de le régler depuis le 2026-10-01. En
     lecture seule (fiche entreprise, pas de onChangeFinancing), on garde le texte d'avant. */
  const headLine = [h.code, h.session, h.opco].filter(Boolean).join(" · ");
  /* LA BARRE ET LES COMPTEURS NE PORTENT QUE LE DÛ. Une étape facultative (migration 188) reste
     dans la grille, faisable, mais hors du pourcentage — le serveur l'écarte des deux côtés de la
     fraction, la barre fait de même, sans quoi elle ne finirait jamais verte sous un « 100 % ». */
  const requises = data.steps.filter((x) => !x.facultatif);
  const nFacultatives = data.steps.length - requises.length;
  const n = repartition(requises);
  const total = requises.length;
  const part = (k) => `${total ? (n[k] / total) * 100 : 0}%`;
  // Rien de dû (toutes facultatives) : le serveur dit 100 %, la barre est pleine.
  const largeurValide = total ? ((n.VALIDE + n.SANS_OBJET) / total) * 100 : 100;
  // Séparateurs de section (parcours entreprise) : seulement si l'API renvoie les DEUX sections.
  const hasSections = data.steps.some((x) => x.section === "company") && data.steps.some((x) => x.section === "learner");

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Parcours</h3>
        <b style={{ color: "var(--green)", fontSize: 18 }} title="Étapes faites, dans n'importe quel ordre">{data.percent}%</b>
      </div>
      {(headLine || onChangeFinancing || h.financing) && (
        <div className="parc-sous">
          {headLine && <span>{headLine}</span>}
          {headLine && (onChangeFinancing || h.financing) && <span aria-hidden="true">·</span>}
          {onChangeFinancing ? (
            <select className="parc-devis" aria-label="Type de devis de ce dossier"
              value={financingValue === "PROFESSIONNEL" ? "PROFESSIONNEL" : "PARTICULIER"}
              onChange={(e) => onChangeFinancing(e.target.value)}>
              <option value="PARTICULIER">Particulier</option>
              <option value="PROFESSIONNEL">Professionnel</option>
            </select>
          ) : (h.financing && <span>{h.financing}</span>)}
          {/* PROFESSIONNEL ⇒ l'entreprise du dossier : c'est ce rattachement qui range le stagiaire
              sous son entreprise sur la session (et l'icône qui va avec). Pré-rempli de l'employeur. */}
          {onChangeFinancing && onChangeCompany && financingValue === "PROFESSIONNEL" && (
            <>
              <span aria-hidden="true">·</span>
              <select className="parc-devis" aria-label="Entreprise du dossier"
                value={companyValue || ""} onChange={(e) => onChangeCompany(e.target.value || null)}>
                <option value="">Choisir l'entreprise…</option>
                {(companies || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
        </div>
      )}
      {/* LA BARRE DIT OÙ EN EST CHAQUE ÉTAPE, pas seulement combien sont finies : ce qui est
          validé, ce qui attend l'école (reçu), ce qui attend le stagiaire (envoyé). */}
      <div className="parc-barre" role="img"
        aria-label={`${n.VALIDE + n.SANS_OBJET} validée(s), ${n.RECU} reçue(s), ${n.ENVOYE} envoyée(s), ${n.A_FAIRE} à faire, sur ${total}`
          + (nFacultatives ? `, et ${nFacultatives} facultative(s) hors avancement` : "")}>
        <span className="valide" style={{ width: `${largeurValide}%` }} />
        <span className="recu" style={{ width: part("RECU") }} />
        <span className="envoye" style={{ width: part("ENVOYE") }} />
      </div>
      <div className="parc-compte">
        <span><i className="valide" />{pluriel(n.VALIDE, "validée", "validées")}</span>
        {n.RECU > 0 && <span><i className="recu" />{pluriel(n.RECU, "reçue, à vérifier", "reçues, à vérifier")}</span>}
        {n.ENVOYE > 0 && <span><i className="envoye" />{pluriel(n.ENVOYE, "envoyée", "envoyées")}</span>}
        <span><i className="a-faire" />{pluriel(n.A_FAIRE, "à faire", "à faire")}</span>
        {n.SANS_OBJET > 0 && <span><i className="sans-objet" />{pluriel(n.SANS_OBJET, "sans objet", "sans objet")}</span>}
        {nFacultatives > 0 && (
          <span title="Visibles et faisables, mais hors de l'avancement du dossier">
            <i className="facultative" />{pluriel(nFacultatives, "facultative", "facultatives")}, hors avancement
          </span>
        )}
      </div>
      {/* CE QUI RESTE À FAIRE QUAND IL NE RESTE PLUS RIEN À FAIRE. Le parcours fini, la fiche ne
          disait nulle part que la FORMATION, elle, pouvait être marquée terminée — la case vit
          dans un repli de la fenêtre de modification, et personne ne l'ouvre pour ça. Le parent
          décide s'il y a quelque chose à proposer ; ici, on lui donne la place. */}
      {!data.currentKey && renderFin?.()}

      {/* L'ÉTAPE SÉLECTIONNÉE, juste sous l'avancement et sur toute la largeur : ce qu'elle
          attend à gauche, les gestes à droite (dessous quand la place manque). */}
      <section ref={detailRef} className="parc-detail" aria-label="Étape sélectionnée">
        {libre ? (
          <>
            <span className="parc-tuile grande a-faire"><Icon name="plus" size={20} /></span>
            <div className="parc-detail-info">
              <div className="parc-surtitre">Hors parcours</div>
              <div className="parc-detail-titre"><h3>Autre document</h3></div>
              <p className="parc-detail-sub">Un document qui n'est pas une étape de ce parcours : choisissez son modèle.</p>
              {renderPreparation(null, fermer)}
            </div>
          </>
        ) : (
        <>
        <span className={`parc-tuile grande ${etatSel.classe}`}><Icon name={iconeDe(step)} size={20} /></span>
        <div className="parc-detail-info">
          <div className="parc-surtitre">
            Étape {data.steps.indexOf(step) + 1} sur {data.steps.length}
            {/* LE RANG NE DIT PAS OÙ L'ON EN EST, il dit quelle étape est ouverte — d'où la
                mention qui suit. « Parcours terminé » quand il n'y a plus de prochaine étape :
                sans elle, un rang seul se lit comme un avancement, et « Étape 1 sur 16 » sous
                un « 100 % » se contredisent à quinze pixels d'écart. */}
            {!data.currentKey ? " · parcours terminé"
              : step.key === data.currentKey ? " · prochaine étape" : ""}
          </div>
          <div className="parc-detail-titre">
            <h3>{step.label}</h3>
            <Badge tone={etatSel.ton}>{etatSel.libelle}</Badge>
            {step.facultatif && <Badge tone="n" title="Ne compte pas dans l'avancement du dossier">Facultative</Badge>}
          </div>
          {step.sub && <p className="parc-detail-sub">{step.sub}</p>}
          <p className={`parc-ligne ${etatSel.classe}`}>{lineFor(step)}</p>
          {/* Le formulaire de préparation, SOUS la ligne d'état : le modèle est celui de l'étape. */}
          {prepareIci && renderPreparation(step, fermer)}
          {/* Le sélecteur de documents détachés (coffre) qui vont à cette étape : cocher, rattacher. */}
          {attachePour === step.key && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <p className="hint" style={{ marginTop: 0 }}>Documents détachés du coffre qui vont à cette étape :</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(detachesParEtape.get(step.key) || []).map((d) => (
                  <li key={d.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0" }}>
                    <input type="checkbox" checked={attacheSel.has(d.id)}
                      onChange={() => setAttacheSel((s) => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                      style={{ marginTop: 3 }} />
                    <span><b>{d.title || d.type}</b> <span className="hint">({(d.status || "").toLowerCase()})</span></span>
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn primary" onClick={rattacher} disabled={attacheEnvoi || !attacheSel.size}>
                  {attacheEnvoi ? "Rattachement…" : `Rattacher ${attacheSel.size}`}
                </button>
                <button className="btn ghost" onClick={() => setAttachePour(null)} disabled={attacheEnvoi}>Annuler</button>
              </div>
            </div>
          )}
        </div>
        {/* Formulaire ouvert : ses propres boutons (Générer, Annuler) remplacent ceux de l'étape. */}
        {!prepareIci && <div className="parc-actions">
          {action && (
            <button className="btn primary" onClick={runAction}>{action.label}</button>
          )}
          {/* IMPORTER UN DOCUMENT REÇU. Proposé sur toute étape documentaire, générée ou NON : le
              besoin naît justement quand personne n'a rien généré et que la convention revient
              signée par courriel. Écarté sur un QCM — un questionnaire ne se remplace pas par un
              fichier : sans réponses enregistrées, il ne prouve rien et ne se rejoue pas. */}
          {/* LE MOT CHANGE PARCE QUE LA DESTINATION CHANGE. Une pièce ne rejoint pas les
              documents du dossier mais le circuit des pièces justificatives, où elle attend
              d'être vérifiée : annoncer « importer un document » ferait chercher le fichier
              au mauvais endroit. */}
          {/* BOUTONS SECONDAIRES PLEINS, pas « fantômes » : sur le fond gris du panneau, un bouton
              sans bordure se lisait comme une légende posée à droite, pas comme un geste. */}
          {/* OÙ LE GESTE EST PROPOSÉ, ET SON MOT : `importPossible`, `libelleImport` (plus haut). Fiche
              entreprise : un document de GROUPE (l'exemplaire signé renvoyé), ou une REMISE — jamais une
              autre étape « stagiaire », qui ne dit pas de quel stagiaire il s'agirait. */}
          {onImport && importPossible(step) && (
            <button className="btn" onClick={() => onImport(step)} title={titreImport(step)}>
              {libelleImport(step)}
            </button>
          )}
          {/* RATTACHER UN DOCUMENT DÉTACHÉ (coffre) : seulement sur une étape ENCORE VIDE d'un dossier
              stagiaire, et seulement si un document orphelin VA à cette étape (même modèle/QCM). */}
          {enrollmentId && !step.docId && etatDe(step) === "A_FAIRE" && (detachesParEtape.get(step.key)?.length > 0) && (
            <button className="btn" onClick={() => ouvrirAttache(step.key)}
              title="Rattacher à cette étape un document détaché du coffre (laissé par une session recréée)">
              🔗 Rattacher un détaché ({detachesParEtape.get(step.key).length})
            </button>
          )}
          {onSignLink && step.docId && (
            <button className="btn" onClick={() => onSignLink(step.docId)} title="Copier un lien pour que le représentant signe">🔗 Lien de signature</button>
          )}
        </div>}
        </>
        )}
      </section>

      {/* TOUTES LES ÉTAPES, en grille sur toute la largeur : autant de colonnes que la place en
          laisse, lues dans l'ordre du parcours, de gauche à droite puis de haut en bas. */}
      <div className="parc-grille">
        {data.steps.map((s, idx, arr) => {
          const on = s.key === sel;
          const e = ETATS[etatDe(s)] || ETATS.A_FAIRE;
          const showDivider = hasSections && s.section && (idx === 0 || arr[idx - 1].section !== s.section);
          const gestes = renderGestes ? renderGestes(s) : null;
          return (
            <Fragment key={s.key}>
              {showDivider && (
                <div className="parc-section">
                  {s.section === "company" ? "🏢 À L'ARRIVÉE VIA L'ENTREPRISE" : "SUITE DU PARCOURS · STAGIAIRE"}
                </div>
              )}
              {/* LA CARTE N'EST PLUS UN BOUTON, elle en CONTIENT un : ses gestes (aperçu, envoi,
                  téléchargement, suppression) sont des boutons eux aussi, et un bouton dans un
                  bouton n'est pas du HTML valide — le clic sur la corbeille choisirait l'étape. */}
              <div className={`parc-etape${on ? " sel" : ""}${s.key === data.currentKey ? " prochaine" : ""}${s.facultatif ? " facultative" : ""}`}>
                <button type="button" className="parc-etape-choix" onClick={() => choisir(s.key)} aria-pressed={on}
                  title={s.key === data.currentKey ? "Prochaine étape du parcours" : undefined}>
                  <span className={`parc-tuile ${e.classe}`}><Icon name={iconeDe(s)} size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block" }}>{s.label}</b>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.facultatif && <i>Facultative{listSub(s) ? " · " : ""}</i>}{listSub(s)}</span>
                  </span>
                  <Badge tone={e.ton}>{e.libelle}</Badge>
                </button>
                {gestes && <div className="parc-etape-gestes">{gestes}</div>}
              </div>
            </Fragment>
          );
        })}
        {renderPreparation && (
          <div className={`parc-etape parc-autre${libre ? " sel" : ""}`}>
            <button type="button" className="parc-etape-choix" onClick={() => choisir(AUTRE)} aria-pressed={libre}>
              <span className="parc-tuile a-faire"><Icon name="plus" size={17} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block" }}>Autre document</b>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Hors parcours, modèle au choix</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default EnrollmentParcours;
