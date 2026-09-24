import { Fragment, useEffect, useRef, useState } from "react";
import { getEnrollmentParcours } from "../api/apiClient.js";
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
    return { RECUE: "Remis au stagiaire, réception confirmée.", REMISE: "Remis au stagiaire, en attente de son accusé de réception." }[s.remiseStatus]
      || "Document à remettre au stagiaire.";
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
   compte avec « validé » dans l'avancement (serveur), mais se nomme à part. */
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
function EnrollmentParcours({ enrollmentId, fetcher, resetKey, refresh, onOpenDoc, onPrepare, onSendQuiz, onSignLink, onImport, renderGestes, renderPreparation, onCharge, renderFin }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);
  // Clé de l'étape dont le formulaire de préparation est ouvert (ou AUTRE), sinon null.
  const [preparation, setPreparation] = useState(null);
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
  }, [key, refresh]);

  /* SANS ÉTAPE — formation sans parcours, ou parcours illisible —, il n'y a aucune étape où ouvrir
     le formulaire. Il est alors proposé tel quel, modèle au choix : préparer un document ne dépend
     pas du parcours, et l'ancien formulaire, sous le parcours, restait disponible dans ces cas-là.
     Pré-rempli (le dossier de l'onglet) une fois par dossier affiché, pas à chaque rafraîchissement :
     un titre en cours de saisie ne s'efface pas toutes les vingt secondes. */
  const sansEtapes = !!error || (!!data && data.steps.length === 0);
  useEffect(() => { if (sansEtapes && renderPreparation) onPrepare?.(null, null); }, [sansEtapes, key]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const h = data.header || {};
  const headLine = [h.code, h.session, h.financing, h.opco].filter(Boolean).join(" · ");
  const n = repartition(data.steps);
  const total = data.steps.length;
  const part = (k) => `${(n[k] / total) * 100}%`;
  // Séparateurs de section (parcours entreprise) : seulement si l'API renvoie les DEUX sections.
  const hasSections = data.steps.some((x) => x.section === "company") && data.steps.some((x) => x.section === "learner");

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Parcours</h3>
        <b style={{ color: "var(--green)", fontSize: 18 }} title="Étapes faites, dans n'importe quel ordre">{data.percent}%</b>
      </div>
      {headLine && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{headLine}</div>}
      {/* LA BARRE DIT OÙ EN EST CHAQUE ÉTAPE, pas seulement combien sont finies : ce qui est
          validé, ce qui attend l'école (reçu), ce qui attend le stagiaire (envoyé). */}
      <div className="parc-barre" role="img"
        aria-label={`${n.VALIDE + n.SANS_OBJET} validée(s), ${n.RECU} reçue(s), ${n.ENVOYE} envoyée(s), ${n.A_FAIRE} à faire, sur ${total}`}>
        <span className="valide" style={{ width: `${((n.VALIDE + n.SANS_OBJET) / total) * 100}%` }} />
        <span className="recu" style={{ width: part("RECU") }} />
        <span className="envoye" style={{ width: part("ENVOYE") }} />
      </div>
      <div className="parc-compte">
        <span><i className="valide" />{pluriel(n.VALIDE, "validée", "validées")}</span>
        {n.RECU > 0 && <span><i className="recu" />{pluriel(n.RECU, "reçue, à vérifier", "reçues, à vérifier")}</span>}
        {n.ENVOYE > 0 && <span><i className="envoye" />{pluriel(n.ENVOYE, "envoyée", "envoyées")}</span>}
        <span><i className="a-faire" />{pluriel(n.A_FAIRE, "à faire", "à faire")}</span>
        {n.SANS_OBJET > 0 && <span><i className="sans-objet" />{pluriel(n.SANS_OBJET, "sans objet", "sans objet")}</span>}
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
            Étape {data.steps.indexOf(step) + 1} sur {total}
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
          </div>
          {step.sub && <p className="parc-detail-sub">{step.sub}</p>}
          <p className={`parc-ligne ${etatSel.classe}`}>{lineFor(step)}</p>
          {/* Le formulaire de préparation, SOUS la ligne d'état : le modèle est celui de l'étape. */}
          {prepareIci && renderPreparation(step, fermer)}
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
          {onImport && !String(step.key || "").startsWith("quiz:") && (
            <button className="btn" onClick={() => onImport(step)}
              title={step.piece
                ? "Déposer ici une pièce reçue par e-mail ou scannée : elle sera validée du même geste"
                : "Rattacher à cette étape un document reçu par e-mail ou scanné"}>
              {step.piece ? "Déposer la pièce reçue" : "Importer un document reçu"}
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
              <div className={`parc-etape${on ? " sel" : ""}${s.key === data.currentKey ? " prochaine" : ""}`}>
                <button type="button" className="parc-etape-choix" onClick={() => choisir(s.key)} aria-pressed={on}
                  title={s.key === data.currentKey ? "Prochaine étape du parcours" : undefined}>
                  <span className={`parc-tuile ${e.classe}`}><Icon name={iconeDe(s)} size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block" }}>{s.label}</b>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{listSub(s)}</span>
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
