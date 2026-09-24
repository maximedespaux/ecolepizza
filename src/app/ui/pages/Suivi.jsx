import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon.jsx";
import { Link } from "react-router-dom";
import {
  getSuivi, getArchives, downloadDocumentPdf,
  importArchives, archiveFileUrl, downloadArchiveFile, bulkDeleteArchives, getArchiveStockage, pieceFichierUrl } from "../api/apiClient.js";
import ProgressPct from "../components/ProgressPct.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire, canOpen, NAV } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { manquesParFormation, dossiersDuManque } from "../lib/etapes.js";
import { sansLesComplets, grouperParEntreprise, estComplet } from "../lib/dossiersASuivre.js";
import { tableauxDuSuivi, etatCase } from "../lib/grilleSuivi.js";
import { lienDossier } from "../lib/lienDossier.js";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import { colorOf, dateHeure } from "../lib/format.js";

/* Les états d'une PIÈCE ne sont pas ceux d'un document : elle n'est ni envoyée ni signée,
   elle est déposée puis vérifiée. Sans ces deux entrées, le coffre affichait « VALIDEE » brut
   en gris, au milieu de libellés soignés. */
const DOC_STATUS = { ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], ARCHIVE: ["Archivé", "n"],
  VALIDEE: ["Validée", "g"], DEPOSEE: ["À vérifier", "a"] };

/* L'état d'une case de la grille. Les classes ne s'appellent PAS comme les états (`progress`…) :
   `.progress` est déjà la barre d'avancement de l'application (9 px, fond gris, débordement
   masqué), et la feuille de route qui a précédé cette grille avait coupé son libellé « En cours »
   à mi-hauteur pour avoir porté ce nom-là. */
const ETAT_CASE = {
  done: { cls: "fait", lib: "Fait" },
  progress: { cls: "encours", lib: "En cours" },
  todo: { cls: "afaire", lib: "À faire" },
  skip: { cls: "sansobjet", lib: "Sans objet" },
  absent: { cls: "absent", lib: "Ne concerne pas ce dossier" },
};

/* La pastille d'un état, seule : la case de la grille et la légende dessinent la MÊME, sinon la
   légende finirait par décrire une grille qui n'existe plus. */
function Pastille({ etat, titre }) {
  const e = ETAT_CASE[etat] || ETAT_CASE.todo;
  return (
    <span className={`sg-etat ${e.cls}`} role="img" aria-label={titre || e.lib}>
      {etat === "done" ? <Icon name="check" size={12} /> : etat === "skip" ? "—" : null}
    </span>
  );
}

/* Les en-têtes de colonne sont les NOMS COMPLETS des documents, penchés à 45° : « Évaluation
   Formative du Mercredi » ne se laisse pas abréger sans perdre le mot qui la distingue de celle du
   jeudi. Un texte tourné ne compte plus dans la mise en page — l'en-tête ne le contient donc que si
   on lui donne la hauteur du plus long, et le tableau n'a de place à droite pour les derniers que si
   on la leur réserve. D'où la MESURE, faite sur les libellés tels que l'écran les dessine
   (getBoundingClientRect rend la boîte d'un élément tourné) et refaite quand la police arrive.
   Une hauteur fixe aurait coupé le plus long ou gaspillé un demi-écran sur des noms courts ; une
   estimation par le plus long libellé réservait à droite 54 px que seuls les DERNIERS libellés
   peuvent réclamer — mesuré au banc, assez pour faire défiler la grille sans raison. */
function GrilleFormation({ t, filtre, onFiltre, entrepriseOuvrable }) {
  const tete = useRef(null);
  const [geo, setGeo] = useState({ h: 150, deborde: 0 });
  useLayoutEffect(() => {
    const mesurer = () => {
      const av = tete.current?.querySelector(".sg-av");
      const boites = tete.current ? [...tete.current.querySelectorAll(".sg-col-btn")].map((b) => b.getBoundingClientRect()) : [];
      if (!av || !boites.length) return;
      /* Le bord du tableau SANS la réserve en place (padding-right = 12 px + réserve) : la mesure
         part du dessin actuel, quelle que soit la réserve qu'il porte déjà. */
      const bord = av.getBoundingClientRect().right - (parseFloat(getComputedStyle(av).paddingRight) - 12);
      const g = {
        h: Math.ceil(Math.max(...boites.map((r) => r.height))) + 16,
        deborde: Math.max(0, Math.ceil(Math.max(...boites.map((r) => r.right)) - bord) + 8),
      };
      setGeo((a) => (a.h === g.h && a.deborde === g.deborde ? a : g));
    };
    mesurer();
    document.fonts?.ready?.then(mesurer).catch(() => {});
  }, [t.colonnes]);

  const nbCol = t.colonnes.length + 2;
  return (
    <section className="sg" style={{ "--teinte": colorOf(t.code) }}>
      <div className="sg-titre">
        <span className="badge n mono" style={{ background: colorOf(t.code), color: "#fff", borderColor: "transparent" }}>{t.code || "—"}</span>
        <b>{t.titre || "Sans formation"}</b>
        <span className="sg-titre-nb">{t.nb} dossier{t.nb > 1 ? "s" : ""}</span>
      </div>
      <div className="tablewrap sg-wrap">
        <table className="sg-table" style={{ "--sg-h": `${geo.h}px`, "--sg-deborde": `${geo.deborde}px` }}>
          <thead ref={tete}>
            <tr>
              <th scope="col" className="sg-nom">Stagiaire</th>
              {t.colonnes.map((c) => {
                const actif = !!(filtre && c.manque && filtre.cle === c.manque.cle);
                return (
                  <th key={c.type} scope="col" className={"sg-col" + (actif ? " on" : "")}>
                    {/* LE NOM D'UNE COLONNE EST LE FILTRE : il remplace les 32 cartes « Ce qui
                        manque ». Sans rien à trouver, il ne propose rien (désactivé). */}
                    <button type="button" className="sg-col-btn" disabled={!c.manque} aria-pressed={actif}
                      title={c.manque
                        ? `${c.label} — manque dans ${c.manque.n} dossier${c.manque.n > 1 ? "s" : ""}. ${actif ? "Cliquer pour tout revoir." : "Cliquer pour ne voir qu'eux."}`
                        : `${c.label} — ne manque dans aucun dossier`}
                      onClick={() => onFiltre(actif ? null : c.manque)}>
                      <span className="sg-col-txt">{c.label}</span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="sg-av">Avancement</th>
            </tr>
          </thead>
          <tbody>
            {t.lignes.map((l) => {
              if (l.genre === "entreprise") {
                /* UNE ENTREPRISE N'A PAS DE LIGNE DE CASES : ses documents de groupe (convention,
                   accord de prise en charge) sont dans les colonnes de chacun de ses stagiaires, qui
                   la suivent. Son en-tête ne sert qu'à dire d'où ils viennent — et à mener à SA
                   fiche, où ces documents se signent. */
                return (
                  <tr key={`c:${l.company_id}`} className="sg-entreprise">
                    <th colSpan={nbCol} scope="rowgroup">
                      <span className="sg-entreprise-in">
                        <span className="sg-entreprise-ic"><Icon name="building" size={13} aria-hidden="true" /></span>
                        <b>{l.company_name}</b>
                        <span className="sg-entreprise-nb">
                          {l.n} stagiaire{l.n > 1 ? "s" : ""}{l.complets > 0 ? ` dont ${l.complets} complet${l.complets > 1 ? "s" : ""}` : ""}
                        </span>
                        {entrepriseOuvrable && (
                          <Link to={`/entreprises/${l.company_id}`} className="card-more sg-entreprise-fiche"
                            title={`Ouvrir la fiche de ${l.company_name}`}
                            aria-label={`Ouvrir la fiche de ${l.company_name}`}>
                            Sa fiche <Icon name="chevron-right" size={13} aria-hidden="true" />
                          </Link>
                        )}
                      </span>
                    </th>
                  </tr>
                );
              }
              const d = l.d;
              return (
                <tr key={d.enrollment_id} className={l.membre ? "sg-membre" : undefined}>
                  <th scope="row" className="sg-nom">
                    {/* Sur la fiche, l'onglet de CE dossier — pas le premier (lib/lienDossier.js). */}
                    <Link to={lienDossier(d.learner_id, d.enrollment_id)} title="Ouvrir le dossier : gérer et envoyer ses documents">
                      {d.last_name} {d.first_name}
                    </Link>
                  </th>
                  {t.colonnes.map((c) => {
                    const { etat, doc } = etatCase(d, c.type);
                    const e = ETAT_CASE[etat];
                    const aSigner = doc?.stagiaireSign && (etat === "todo" || etat === "progress");
                    const titre = `${c.label} — ${e.lib}${aSigner ? " · à signer" : ""}`;
                    const actif = !!(filtre && c.manque && filtre.cle === c.manque.cle);
                    return (
                      <td key={c.type} className={"sg-case" + (actif ? " on" : "")} title={titre}>
                        <Pastille etat={etat} titre={titre} />
                      </td>
                    );
                  })}
                  <td className="sg-av">
                    <ProgressPct percent={d.percent} score={d.score} width={64}
                      titre={`${d.done}/${d.total} étape(s)${d.to_sign ? ` · ${d.signed}/${d.to_sign} signé(s)` : ""}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sg-nom">Manquent</th>
              {t.colonnes.map((c) => {
                const actif = !!(filtre && c.manque && filtre.cle === c.manque.cle);
                return <td key={c.type} className={"sg-manque" + (actif ? " on" : "")}>{c.manque ? c.manque.n : ""}</td>;
              })}
              <td className="sg-av" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/* L'entrée « Entreprises » du menu : la fiche d'une entreprise n'est un lien que si le menu
   l'offre — c'est la décision même de la garde de route. Un auditeur, qui lit le suivi sans
   pouvoir ouvrir une entreprise, ne se voit donc pas proposer un lien qui le renverrait à
   l'accueil. (Le tableau de bord fait pareil, cf. Dashboard.jsx.) */
const ENTREE_ENTREPRISES = NAV.flatMap((g) => g.items).find((it) => it.to === "/entreprises");

function Suivi() {
  const { user } = useContext(UserContext);
  const entrepriseOuvrable = !!ENTREE_ENTREPRISES && canOpen(user, ENTREE_ENTREPRISES);
  const [tab, setTab] = useState("conformite");
  const [dossiers, setDossiers] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSuivi().then((r) => setDossiers(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }, []);

  const count = (score) => dossiers.filter((d) => d.score === score).length;
  /* LES DOSSIERS COMPLETS QUITTENT LA LISTE (demandé le 2026-09-21) : à 100 %, il n'y a plus rien à
     y faire, et ils noyaient ceux qui restent à finir. Ils ne disparaissent pas pour autant : le
     compteur « complets » les compte — chaque dossier terminé l'y fait monter d'un — et, d'un clic,
     les réaffiche (un auditeur peut vouloir en ouvrir un). La règle : lib/dossiersASuivre.js. */
  const [voirComplets, setVoirComplets] = useState(false);

  /* CE QUI MANQUE, nommé et compté par document ET par formation (lib/etapes.js). Il s'affichait en
     cartes, une par document et par formation — 32 cartes pour 7 dossiers, un écran entier avant le
     premier dossier. C'est désormais le pied de chaque colonne de la grille, et le nom de la colonne
     filtre comme la carte le faisait : on ne relance pas « le dossier Durand », on édite les douze
     conventions qui manquent. */
  const [manqueFiltre, setManqueFiltre] = useState(null);
  const manques = useMemo(() => manquesParFormation(dossiers), [dossiers]);

  // Cliquer une colonne filtre la liste : la page se termine par un geste, pas par un constat.
  const dossiersVus = useMemo(() => dossiersDuManque(dossiers, manqueFiltre), [dossiers, manqueFiltre]);

  /* Regroupe les dossiers par entreprise : un stagiaire ajouté par une entreprise se range sous elle,
     les autres restent autonomes, dans l'ordre du serveur (les moins avancés d'abord). Le
     regroupement vit dans `lib/dossiersASuivre.js`, partagé avec le tableau de bord : deux boucles
     écrites côte à côte auraient fini par ranger les mêmes dossiers autrement. Il se fait sur la
     liste ENTIÈRE, avant le masquage des complets : c'est ce qui permet de dire « dont 2 complets »
     d'une entreprise dont on ne montre plus que les stagiaires à finir. */
  const groups = useMemo(() => grouperParEntreprise(dossiersVus), [dossiersVus]);
  // Ce que la liste affiche : sans les complets, sauf à la demande.
  const affiches = useMemo(() => sansLesComplets(groups, voirComplets), [groups, voirComplets]);
  const nbAffiches = affiches.reduce((n, g) => n + (g.type === "solo" ? 1 : g.membresVus.length), 0);

  /* LES COLONNES VIENNENT DE TOUS LES DOSSIERS AFFICHABLES, PAS DE CEUX QUE LE FILTRE LAISSE : cliquer
     une colonne ne doit pas en faire disparaître d'autres sous le curseur. Les complets masqués, eux,
     n'en apportent pas — une colonne sans aucune ligne pour la remplir ne dirait rien. */
  const pourColonnes = useMemo(
    () => (voirComplets ? dossiers : dossiers.filter((d) => !estComplet(d))), [dossiers, voirComplets]);
  const tableaux = useMemo(() => tableauxDuSuivi(affiches, pourColonnes, manques), [affiches, pourColonnes, manques]);

  return (
    <>
      <PageHead
        eyebrow="Qualiopi"
        title="Suivi de conformité"
        lead="Conformité des dossiers et coffre des documents signés."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button className={"btn sm " + (tab === "conformite" ? "primary" : "ghost")} onClick={() => setTab("conformite")}>Conformité</button>
            <button className={"btn sm " + (tab === "archives" ? "primary" : "ghost")} onClick={() => setTab("archives")}>Archives</button>
          </div>
        }
      />
      <StatusMessage status={status} />

      {tab === "conformite" ? (
        <>
          {manques.length === 0 && dossiers.length > 0 && (
            <div className="todo-calme">
              <Icon name="check-circle" size={17} aria-hidden="true" />
              Tous les dossiers sont complets, aucune pièce manquante à produire.
            </div>
          )}

          {/* Les compteurs résument ; ils ne se traitent pas. */}
          <div className="compteurs">
            <span><b className="chiffres">{count("ROUGE")}</b> incomplet{count("ROUGE") > 1 ? "s" : ""}</span><i />
            <span><b className="chiffres">{count("ORANGE")}</b> en cours</span><i />
            {/* Le compteur des complets est aussi l'interrupteur qui les réaffiche. */}
            <button type="button" className="compteur-bascule" aria-pressed={voirComplets}
              disabled={count("VERT") === 0} onClick={() => setVoirComplets((v) => !v)}
              title={voirComplets ? "Masquer les dossiers complets" : "Afficher aussi les dossiers complets"}>
              <b className="chiffres">{count("VERT")}</b> complet{count("VERT") > 1 ? "s" : ""}
              {count("VERT") > 0 && <i>{voirComplets ? " · masquer" : " · voir"}</i>}
            </button>
          </div>

          <Card title={`Dossiers (${nbAffiches}${manqueFiltre ? ` sur ${dossiers.length}` : ""})`}>
            {manqueFiltre && (
              <div className="sg-filtre">
                <span>Dossiers où manque <b>« {manqueFiltre.label} »</b>{manqueFiltre.code ? ` · ${manqueFiltre.code}` : ""}</span>
                <button type="button" className="btn sm ghost" onClick={() => setManqueFiltre(null)}>
                  <Icon name="x" size={12} /> Tout voir
                </button>
              </div>
            )}
            {nbAffiches === 0 ? (
              <EmptyState icon="clipboard-check">
                {dossiers.length === 0 ? "Aucun dossier à suivre."
                  : manqueFiltre ? "Aucun dossier ne manque cette pièce."
                  : "Tous les dossiers sont complets. Le compteur « complets » les réaffiche."}
              </EmptyState>
            ) : (
              <>
                <p className="sg-legende">
                  <span><Pastille etat="done" /> fait</span>
                  <span><Pastille etat="progress" /> en cours</span>
                  <span><Pastille etat="todo" /> à faire</span>
                  <span><Pastille etat="skip" /> sans objet</span>
                  <span>case vide : ne concerne pas ce dossier</span>
                  <span className="sg-legende-geste">Cliquer le nom d'un document : seuls les dossiers où il manque.</span>
                </p>
                {tableaux.map((t) => (
                  <GrilleFormation key={t.code || "-"} t={t} filtre={manqueFiltre} onFiltre={setManqueFiltre}
                    entrepriseOuvrable={entrepriseOuvrable} />
                ))}
              </>
            )}
          </Card>
        </>
      ) : (
        <ArchivesView
          onError={(m) => setStatus({ type: "error", message: m })}
          onInfo={(m) => setStatus({ type: "success", message: m })}
        />
      )}
    </>
  );
}

// Construit l'arbre année → semaine → formation → stagiaire → documents.
function buildTree(rows) {
  const years = {};
  for (const r of rows) {
    const y = r.year != null ? String(r.year) : "-";
    const wKey = r.week != null ? String(r.week) : "-";
    const fKey = r.program_code || "-";
    /* Feuille = stagiaire, ENTREPRISE pour un document de groupe (scope COMPANY), ou LA SESSION
       elle-même (scope SESSION, migration 157) — un contrat d'hygiène signé par un intervenant
       externe n'appartient à personne en particulier. Sans cette troisième feuille, il tombait
       sous un nom vide, entre deux stagiaires, et devenait introuvable.
       UNE SEULE FEUILLE PAR SEMAINE ET PAR FORMATION : la clé ne porte pas l'identifiant du
       document, sinon chaque contrat ferait son propre dossier à un élément. */
    const isCo = r.scope === "COMPANY";
    const isSess = r.scope === "SESSION";
    const lKey = isCo ? `co:${r.company_id || r.company_name || "?"}`
      : isSess ? "sess:documents"
      : (r.learner_id || `${r.last_name}${r.first_name}`);
    const Y = years[y] || (years[y] = { label: y, total: 0, weeks: {} });
    const W = Y.weeks[wKey] || (Y.weeks[wKey] = { week: r.week || 0, total: 0, formations: {} });
    const F = W.formations[fKey] || (W.formations[fKey] = { code: r.program_code || "-", title: r.program_title || "", total: 0, learners: {} });
    const L = F.learners[lKey] || (F.learners[lKey] = {
      name: isCo ? (r.company_name || "Entreprise")
        : isSess ? "Documents de session"
        : (`${r.last_name || ""} ${r.first_name || ""}`.trim() || "-"),
      learner_id: r.learner_id, company: isCo, session: isSess, docs: [],
    });
    L.docs.push(r);
    Y.total++; W.total++; F.total++;
  }
  const yr = Object.values(years).sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));
  for (const Y of yr) {
    Y.weeksArr = Object.values(Y.weeks).sort((a, b) => b.week - a.week);
    for (const W of Y.weeksArr) {
      W.formationsArr = Object.values(W.formations).sort((a, b) => a.code.localeCompare(b.code));
      for (const F of W.formationsArr) F.learnersArr = Object.values(F.learners).sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  return yr;
}

function ArchivesView({ onError, onInfo }) {
  const { user } = useContext(UserContext);
  // Importer, classer, supprimer : /suivi côté serveur (cf. peutEcrire), pas une liste de rôles.
  const peutModifier = peutEcrire(user, "/suivi");
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  /* CLASSEURS LIBRES. `cibleClasseur` est une ref et non un état : elle porte le classeur visé
     entre le clic et le retour du sélecteur de fichiers, deux instants qui ne doivent PAS
     provoquer de rendu — un rendu entre les deux refermerait le sélecteur. */
  const [nouveauClasseur, setNouveauClasseur] = useState("");
  const classeurRef = useRef(null);
  const cibleClasseur = useRef(null);

  function load() {
    getArchives().then((r) => setRows(r.data)).catch((e) => { setRows([]); onError?.(e.message); });
  }
  useEffect(() => { load(); }, []);

  async function onPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const paths = files.map((f) => f.webkitRelativePath || f.name);
    setBusy(true);
    try {
      const { data } = await importArchives(files, paths);
      onInfo?.(messageImport(data));
      load();
    } catch (err) { onError?.(err.message); }
    finally { setBusy(false); }
  }

  /* DÉPÔT DANS UN CLASSEUR. Pas de `webkitdirectory` ici : on choisit des FICHIERS, pas une
     arborescence — un classeur n'a pas de structure à lire, c'est justement sa définition. */
  function deposerDans(nom) {
    cibleClasseur.current = nom;
    classeurRef.current?.click();
  }

  async function onPickClasseur(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const nom = cibleClasseur.current;
    cibleClasseur.current = null;
    if (!files.length || !nom) return;
    setBusy(true);
    try {
      const { data } = await importArchives(files, files.map((f) => f.name), nom);
      onInfo?.(`${messageImport(data)} Classeur « ${nom} ».`);
      setNouveauClasseur("");
      load();
    } catch (err) { onError?.(err.message); }
    finally { setBusy(false); }
  }

  /* LE COMPTE RENDU D'UN IMPORT, au même endroit pour les deux chemins — l'arbre des sessions
     et les classeurs. Il tenait dans `onPick`, et un classeur qui aurait recopié ses quinze
     lignes aurait fini par ne plus dire la même chose qu'elles.

     LES QUATRE CAS SE DISENT SÉPARÉMENT, et ce n'est pas du zèle : un fichier déjà là ne
     demande RIEN ; un non-PDF signale un lot mal préparé ; un fichier VIDE veut dire qu'il
     manque vraiment un document et qu'il faut aller rechercher l'original. Les fondre sous un
     seul « ignoré(s) » ferait chercher une erreur là où l'import a bien travaillé, ou croire
     que tout est passé alors qu'il manque une pièce. */
  function messageImport(data) {
    const parts = [`${data.imported} document(s) importé(s)`];
    /* ON NOMME. Un compte ne dit pas LEQUEL a été écarté — et c'est lequel qui compte quand on
       voulait remplacer une version par sa correction : il faut alors supprimer l'ancien avant
       de réimporter. Les cinq premiers suffisent à reconnaître le lot. */
    const nommer = (n, noms, texte) => {
      const cinq = (noms || []).slice(0, 5).join(", ");
      parts.push(`${n} ${texte}${cinq ? ` — ${cinq}${n > 5 ? "…" : ""}` : ""}`);
    };
    if (data.doublons) nommer(data.doublons, data.noms_doublons, "déjà présent(s), non réimporté(s)");
    if (data.skipped) parts.push(`${data.skipped} ignoré(s) (non PDF)`);
    if (data.vides) nommer(data.vides, data.noms_vides, "vide(s), non importé(s)");
    return `${parts.join(", ")}.`;
  }

  // Supprime définitivement un ensemble de documents (en base). `docs` = lignes
  // du coffre ; on sépare les PDF importés (archive) des documents générés (gen).
  async function deleteDocs(docs, what) {
    const archive_ids = docs.filter((d) => d.source === "archive").map((d) => d.doc_id);
    const document_ids = docs.filter((d) => d.source === "gen").map((d) => d.doc_id);
    const total = archive_ids.length + document_ids.length;
    /* LES PIÈCES NE SE SUPPRIMENT PAS D'ICI, et il faut le DIRE. Les compter en silence
       laisserait croire qu'un « supprimer tout le stagiaire » a tout emporté, alors que les
       scans d'identité resteraient en base — exactement l'inverse de ce qu'on croit avoir fait.
       Leur effacement appartient au dossier, où il passe par la purge prévue. */
    const pieces = docs.filter((d) => d.source === "piece").length;
    if (!total) {
      onError?.(pieces
        ? `Rien à supprimer ici : ${pieces} pièce(s) justificative(s), qui s'effacent depuis le dossier du stagiaire.`
        : "Aucun document à supprimer ici.");
      return false;
    }
    const detail = document_ids.length && archive_ids.length
      ? ` (${document_ids.length} généré(s), ${archive_ids.length} archivé(s))`
      : "";
    const garde = pieces ? `\n${pieces} pièce(s) justificative(s) ne seront PAS supprimées : elles s'effacent depuis le dossier du stagiaire.` : "";
    if (!window.confirm(`Supprimer définitivement ${total} document(s)${what ? `, ${what}` : ""}${detail} ?\nCette action est irréversible et les supprime de la base.${garde}`)) return false;
    try {
      const { deleted } = await bulkDeleteArchives(archive_ids, document_ids);
      onInfo?.(`${deleted} document(s) supprimé(s).`);
      load();
      return true;
    } catch (err) { onError?.(err.message); return false; }
  }
  const weekDocs = (W) => W.formationsArr.flatMap((F) => F.learnersArr.flatMap((L) => L.docs));
  const formationDocs = (F) => F.learnersArr.flatMap((L) => L.docs);
  // Bouton de suppression sur une ligne de regroupement (semaine / formation / stagiaire).
  const DelBtn = ({ onClick, title }) => (
    <button type="button" className="iconbtn del" title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      style={{ marginLeft: 8 }}><Icon name="trash" size={15} /></button>
  );

  /* UNE LIGNE DE DOCUMENT, EXTRAITE — parce que les classeurs affichent EXACTEMENT les mêmes.
     Recopier ces trente lignes, c'est garantir qu'un jour l'aperçu marchera dans l'arbre des
     sessions et pas dans les classeurs, ou que la garde sur les pièces ne sera corrigée que
     d'un côté. Le coffre a déjà payé ce genre de dette ailleurs. */
  const DocLigne = ({ d }) => {
    const [lab, tone] = DOC_STATUS[d.status] || [d.status, "n"];
    return (
      <div className="arch-doc">
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{d.title}</b>
          <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
            {d.source === "piece"
              ? (d.sent_at ? `déposée le ${dateHeure(d.sent_at)}` : "")
              : d.signed_at ? `signé le ${dateHeure(d.signed_at)}` : d.sent_at ? `envoyé le ${dateHeure(d.sent_at)}` : ""}
          </span>
        </span>
        <Badge tone={tone}>{lab}</Badge>
        <button className="iconbtn" title="Aperçu" aria-label={`Aperçu de ${d.title}`}
          onClick={() => d.source === "piece" ? window.open(pieceFichierUrl(d.doc_id), "_blank", "noopener")
            : d.source === "archive" ? window.open(archiveFileUrl(d.doc_id), "_blank", "noopener") : setViewId(d.doc_id)}><Icon name="eye" size={16} /></button>
        {/* NI TÉLÉCHARGEMENT NI SUPPRESSION SUR UNE PIÈCE. Le fichier n'est pas forcément un
            PDF (une photo de carte d'identité, le plus souvent) et s'ouvre déjà en ligne — d'où
            on l'enregistre. Surtout, l'effacer appartient au dossier, où il passe par la purge
            prévue : un scan d'identité supprimé doit l'être avec son dépôt, pas isolément
            depuis un coffre qui range par formation. */}
        {d.source !== "piece" && (
          <button className="iconbtn" title="Télécharger le PDF" aria-label={`Télécharger le PDF de ${d.title}`}
            onClick={() => d.source === "archive" ? downloadArchiveFile(d.doc_id, `${d.title}.pdf`) : downloadDocumentPdf(d.doc_id, `${d.title}.pdf`)}><Icon name="download" size={16} /></button>
        )}
        {peutModifier && d.source !== "piece" && (
          <button className="iconbtn del" title="Supprimer ce document" aria-label={`Supprimer ${d.title}`} onClick={() => deleteDocs([d], d.title)}><Icon name="trash" size={15} /></button>
        )}
      </div>
    );
  };


  /* UN CLASSEUR N'EST PAS UNE TABLE : comme l'année, la semaine et la formation, il existe
     parce que des documents s'y trouvent, et disparaît avec son dernier document. Rien à
     nettoyer, aucun dossier vide que personne n'ose supprimer. Le revers assumé : on ne crée
     pas un classeur à l'avance, on le nomme en y déposant. */
  const { tree, classeurs } = useMemo(() => {
    if (!rows) return { tree: [], classeurs: [] };
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.last_name} ${r.first_name} ${r.company_name || ""} ${r.program_code} ${r.program_title} ${r.title} ${r.dossier || ""}`.toLowerCase().includes(needle))
      : rows;
    const parNom = new Map();
    for (const r of filtered) {
      if (!r.dossier) continue;
      if (!parNom.has(r.dossier)) parNom.set(r.dossier, []);
      parNom.get(r.dossier).push(r);
    }
    return {
      tree: buildTree(filtered.filter((r) => !r.dossier)),
      classeurs: [...parNom.entries()]
        .map(([nom, docs]) => ({ nom, docs }))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    };
  }, [rows, q]);

  /* SEULE L'ANNÉE EN COURS S'OUVRE (demandé le 2026-09-24). Chaque année s'ouvrait avec toutes ses
     semaines : vingt-sept lignes sur deux ans, deux écrans et demi avant d'avoir ouvert quoi que ce
     soit. Une année passée tient désormais sur une ligne, son total à droite, et s'ouvre au clic.
     « En cours » = la plus récente qui porte des documents : en janvier, avant le premier dépôt de
     l'année, c'est encore la précédente qu'on consulte — l'année du calendrier n'ouvrirait rien.
     PENDANT UNE RECHERCHE, TOUT S'OUVRE : un résultat ne doit pas se cacher sous une année repliée. */
  const anneeOuverte = tree.find((Y) => /^\d{4}$/.test(Y.label))?.label;
  const recherche = q.trim() !== "";

  if (rows === null) return <Card title="Archives"><p className="hint">Chargement…</p></Card>;

  return (
    <Card title={`Archives documentaires (${rows.length})`}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <input className="inp" placeholder="Rechercher un stagiaire, une entreprise, une formation, un document…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 460, flex: 1, minWidth: 220 }} />
        {peutModifier && (
          <>
            <input ref={fileRef} type="file" webkitdirectory="" directory="" multiple accept="application/pdf,.pdf"
              style={{ display: "none" }} onChange={onPick} />
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Import en cours…" : "Importer un dossier"}
            </button>
          </>
        )}
      </div>
      {peutModifier && (
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Dossier <b>année / semaine / formation / stagiaire</b> · PDF uniquement.
        </p>
      )}

      {peutModifier && (
        <input ref={classeurRef} type="file" multiple accept="application/pdf,.pdf"
          style={{ display: "none" }} onChange={onPickClasseur} />
      )}

      {/* CLASSEURS — ce qui n'appartient à aucune session. Placés AVANT l'arbre : ils sont peu
          nombreux et concernent l'organisme entier, quand l'arbre concerne les promotions. */}
      {(classeurs.length > 0 || peutModifier) && (
        <details className="arch" open={classeurs.length > 0} style={{ marginBottom: 14 }}>
          <summary className="arch-sum arch-y">
            Classeurs <span className="arch-count">{classeurs.reduce((n, c) => n + c.docs.length, 0)}</span>
          </summary>
          <div className="arch-in">
            {peutModifier && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 4px" }}>
                <input className="inp" placeholder="Nom du classeur — Assurances, Agréments…" value={nouveauClasseur}
                  onChange={(e) => setNouveauClasseur(e.target.value)} style={{ maxWidth: 300 }} maxLength={160}
                  onKeyDown={(e) => { if (e.key === "Enter" && nouveauClasseur.trim()) deposerDans(nouveauClasseur.trim()); }} />
                <button className="btn" disabled={busy || !nouveauClasseur.trim()}
                  onClick={() => deposerDans(nouveauClasseur.trim())}>
                  {busy ? "Dépôt en cours…" : "Créer et déposer des PDF…"}
                </button>
              </div>
            )}
            {classeurs.length === 0
              ? <p className="hint" style={{ marginTop: 4 }}>
                  Aucun classeur. Un classeur range ce qui n'appartient à aucune session —
                  attestation d'assurance, agrément, certificat Qualiopi. Il existe tant qu'il
                  contient un document.
                </p>
              : classeurs.map((C) => (
                <details key={C.nom}>
                  <summary className="arch-sum">
                    <Icon name="folder" size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} />
                    {C.nom} <span className="arch-count">{C.docs.length}</span>
                    {peutModifier && (
                      <>
                        <button type="button" className="iconbtn" title={`Ajouter des PDF dans « ${C.nom} »`}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deposerDans(C.nom); }}
                          style={{ marginLeft: 8 }}><Icon name="plus" size={15} /></button>
                        <DelBtn title="Supprimer tout le classeur" onClick={() => deleteDocs(C.docs, `classeur « ${C.nom} »`)} />
                      </>
                    )}
                  </summary>
                  <div className="arch-docs">
                    {C.docs.map((d) => <DocLigne key={d.doc_id} d={d} />)}
                  </div>
                </details>
              ))}
          </div>
        </details>
      )}

      {peutModifier && <PanneauStockage onError={onError} onSupprime={(ids, quoi) => deleteDocs(
        ids.map((id) => ({ doc_id: id, source: "archive" })), quoi)} />}

      {tree.length === 0 ? (
        <EmptyState icon="folder">Aucun document partagé pour l'instant.</EmptyState>
      ) : (
        <div className="arch">
          {tree.map((Y) => (
            <details key={Y.label} open={recherche || Y.label === anneeOuverte}>
              <summary className="arch-sum arch-y">{Y.label} <span className="arch-count">{Y.total}</span></summary>
              <div className="arch-in">
                {Y.weeksArr.map((W) => (
                  <details key={W.week}>
                    <summary className="arch-sum">{W.week ? `Semaine ${W.week}` : "Sans session"} <span className="arch-count">{W.total}</span>
                      {peutModifier && <DelBtn title="Supprimer toute la semaine" onClick={() => deleteDocs(weekDocs(W), W.week ? `Semaine ${W.week}` : "Sans session")} />}
                    </summary>
                    <div className="arch-in">
                      {W.formationsArr.map((F) => (
                        <details key={F.code}>
                          <summary className="arch-sum">
                            <span className="badge n mono" style={{ background: colorOf(F.code), color: "#fff", borderColor: "transparent" }}>{F.code}</span>
                            {" "}{F.title} <span className="arch-count">{F.total}</span>
                            {peutModifier && <DelBtn title="Supprimer toute la formation" onClick={() => deleteDocs(formationDocs(F), F.title)} />}
                          </summary>
                          <div className="arch-in">
                            {F.learnersArr.map((L) => (
                              <details key={L.learner_id || L.name}>
                                <summary className="arch-sum">
                                  {L.company && <Icon name="building" size={13} style={{ marginRight: 5, verticalAlign: "-2px", color: "var(--ember1, #c0392b)" }} />}
                                  {L.session && <Icon name="calendar" size={13} style={{ marginRight: 5, verticalAlign: "-2px", color: "var(--dim)" }} />}
                                  {L.name} <span className="arch-count">{L.docs.length}</span>
                                  {peutModifier && <DelBtn title={L.company ? "Supprimer cette entreprise" : L.session ? "Supprimer ces documents de session" : "Supprimer ce stagiaire"} onClick={() => deleteDocs(L.docs, L.name)} />}
                                </summary>
                                <div className="arch-docs">
                                  {L.docs.map((d) => <DocLigne key={d.doc_id} d={d} />)}
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {viewId && <DocumentViewModal id={viewId} onClose={() => setViewId(null)} />}
    </Card>
  );
}

export default Suivi;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LE COFFRE OCCUPE — l'inventaire, et de quoi agir dessus.

   POURQUOI UN PANNEAU REPLIÉ, chargé au clic : la requête lit tous les blobs pour en calculer
   les empreintes. Quelques secondes sur 681 Mo — acceptable pour un inventaire qu'on demande,
   inacceptable à chaque ouverture de la page.

   CE QU'IL MONTRE, ET POURQUOI DANS CET ORDRE. La mesure qui a précédé cet écran disait deux
   choses. D'abord que la masse est CONCENTRÉE : 12 % des fichiers portent 55 % du volume — d'où
   la liste des plus lourds, qui règle le problème en trente lignes. Ensuite que la DENSITÉ
   sépare le bon grain de l'ivraie : un scan JPEG de 300 DPI tient en 0,13 octet par pixel, quand
   certains fichiers d'ici en font 2,7 — soit presque un bitmap brut (3,0). C'est la seule mesure
   qui distingue un document lourd parce qu'il est détaillé d'un document lourd pour rien.

   LES DOUBLONS SE MONTRENT AVEC LEURS DÉTENTEURS. Supprimer une copie retire un document du
   dossier de quelqu'un. Le même PDF sous sept stagiaires peut être une erreur de classement —
   c'est le cas qu'on a trouvé, l'évaluation d'une personne recopiée dans six autres dossiers —
   ou une pièce commune légitimement partout. L'écran ne tranche pas, il nomme.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */
const mo = (o) => (o >= 1048576 ? (o / 1048576).toFixed(1) + " Mo" : Math.round(o / 1024) + " Ko");

/* LE MOT À RECOPIER POUR LANCER L'INVENTAIRE.
   Il n'est pas là pour vérifier une identité — l'écran est déjà réservé à l'administration — mais
   pour rendre le geste DÉLIBÉRÉ. La requête lit les 681 Mo de blobs de la table : 7,4 secondes
   mesurées, pendant lesquelles la base travaille pour tout le monde. Un bouton se clique par
   curiosité, et se reclique en attendant que ça vienne ; un mot à recopier, non.
   En français et en clair : un mot qu'on ne comprend pas se recopie machinalement, ce qui
   annulerait tout l'intérêt. */
const MOT_INVENTAIRE = "INVENTAIRE";
/* Tolérant sur la casse et les espaces autour : ce qu'on demande, c'est un geste conscient,
   pas une dictée. Refuser « inventaire » en minuscules ne filtrerait que la patience. */
const motOk = (v) => v.trim().toUpperCase() === MOT_INVENTAIRE;

function PanneauStockage({ onError, onSupprime }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demande, setDemande] = useState(false);   // le verrou est-il ouvert à l'écran ?
  const [saisie, setSaisie] = useState("");

  async function analyser() {
    setDemande(false); setSaisie("");
    setBusy(true);
    try { setData((await getArchiveStockage()).data); }
    catch (e) { onError?.(e.message); }
    finally { setBusy(false); }
  }

  /* LE VERROU COUVRE AUSSI « RECALCULER ». Sans cela il suffirait d'un premier passage pour
     obtenir un bouton libre juste à côté — et c'est précisément le reclic répété qu'on veut
     empêcher, pas le premier. */
  const verrou = demande && createPortal(
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="mhead">
          <h3>Lancer l'inventaire du coffre ?</h3>
          <button className="x" onClick={() => setDemande(false)} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          <p className="lead" style={{ marginTop: 0 }}>
            L'inventaire lit <b>l'intégralité des fichiers archivés</b> pour en calculer la taille
            et l'empreinte. Comptez plusieurs secondes, pendant lesquelles la base est occupée
            pour tout le monde.
          </p>
          <label className="field confirm-mot" style={{ marginBottom: 0 }}>
            <span>Recopiez <b>{MOT_INVENTAIRE}</b> pour confirmer</span>
            <input className="inp" autoFocus value={saisie} spellCheck="false"
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && motOk(saisie)) analyser(); }} />
          </label>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={() => setDemande(false)}>Annuler</button>
          <button className="btn primary" disabled={!motOk(saisie)} onClick={analyser}>
            <Icon name="package" size={15} /> Lancer l'inventaire
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  if (!data) {
    return (
      <div className="stock-invite">
        <span className="hint">
          <Icon name="package" size={13} /> Les archives sont stockées dans la base. Voir ce
          qu'elles occupent, et repérer les fichiers inutilement lourds ou en double.
        </span>
        <button className="btn ghost sm" disabled={busy} onClick={() => setDemande(true)}>
          {busy ? "Lecture des fichiers…" : "Analyser l'espace occupé"}
        </button>
        {verrou}
      </div>
    );
  }

  const { total, tranches, lourds, doublons, gaspilleDoublons } = data;
  const maxT = Math.max(...tranches.map((t) => t.octets), 1);
  // Ce qu'on peut réellement retirer : tout sauf un exemplaire par groupe.
  const copiesEnTrop = doublons.reduce((s, d) => s + d.n - 1, 0);

  /* APRÈS UNE SUPPRESSION, L'INVENTAIRE EST FAUX — la copie effacée y figure encore et son poids
     est toujours compté. Mais on ne RELIT PAS la base pour autant : relancer l'inventaire à
     chaque corbeille ferait relire les 681 Mo une fois par doublon traité, soit vingt-quatre
     fois pour les seuls groupes de sept. C'est exactement le martèlement que le verrou de
     confirmation cherche à éviter — le rétablir ici l'aurait vidé de son sens.
     On retranche donc ce qu'on sait avoir supprimé : un identifiant, une taille, une tranche.
     C'est de l'arithmétique exacte, pas une approximation. */
  function retirerDeLInventaire(x) {
    setData((d) => {
      if (!d) return d;
      const doublons = d.doublons
        .map((g) => {
          if (!g.exemplaires.some((e) => e.id === x.id)) return g;
          const exemplaires = g.exemplaires.filter((e) => e.id !== x.id);
          return { ...g, exemplaires, n: exemplaires.length,
            gaspille: g.octets * (exemplaires.length - 1) };
        })
        /* UN GROUPE RETOMBÉ À UN SEUL EXEMPLAIRE N'EST PLUS UN DOUBLON : le laisser afficherait
           « 1 exemplaire identique », ce qui ne veut rien dire. */
        .filter((g) => g.n > 1);
      return {
        ...d,
        total: { n: d.total.n - 1, octets: d.total.octets - x.octets },
        // La tranche est celle dont le seuil est le plus haut que le fichier atteigne.
        tranches: d.tranches.map((t) => (t === d.tranches.find((u) => x.octets >= u.min)
          ? { ...t, n: t.n - 1, octets: t.octets - x.octets } : t)),
        lourds: d.lourds.filter((l) => l.id !== x.id),
        doublons,
        gaspilleDoublons: doublons.reduce((s, g) => s + g.gaspille, 0),
      };
    });
  }

  async function supprimerUne(x) {
    if (await onSupprime([x.id], `« ${x.title} »${x.learner_name ? ` — ${x.learner_name}` : ""}`)) {
      retirerDeLInventaire(x);
    }
  }

  return (
    <div className="stock">
      {verrou}
      <div className="stock-tete">
        <b>{total.n} document{total.n > 1 ? "s" : ""} · <span className="chiffres">{mo(total.octets)}</span></b>
        <button className="btn ghost sm" disabled={busy} onClick={() => setDemande(true)}>Recalculer</button>
      </div>

      {/* LA RÉPARTITION EN PREMIER : c'est elle qui montre que quelques fichiers font le volume,
          donc que la suite vaut la peine d'être lue. */}
      <div className="stock-tranches">
        {tranches.map((t) => (
          <div key={t.libelle} className="stock-tr">
            <span className="stock-tr-l">{t.libelle}</span>
            <span className="stock-tr-b"><i style={{ width: `${100 * t.octets / maxT}%` }} /></span>
            <span className="stock-tr-n chiffres">{t.n}</span>
            <span className="stock-tr-o chiffres">{mo(t.octets)}</span>
          </div>
        ))}
      </div>

      {doublons.length > 0 && (
        <details className="stock-bloc">
          {/* « 26 documents en double » se lisait comme 26 fichiers à supprimer. Ce sont 26
              documents présents en PLUSIEURS exemplaires, soit 46 copies en trop : c'est ce
              second nombre qui dit ce qu'on peut retirer. */}
          <summary>
            <b>{doublons.length} document{doublons.length > 1 ? "s" : ""} en plusieurs exemplaires</b>
            <span className="hint"> · <span className="chiffres">{copiesEnTrop}</span> copie
              {copiesEnTrop > 1 ? "s" : ""} superflue{copiesEnTrop > 1 ? "s" : ""},
              <span className="chiffres"> {mo(gaspilleDoublons)}</span></span>
          </summary>
          <p className="hint stock-avert">
            <Icon name="alert-triangle" size={12} /> Chaque copie occupe le dossier d'un stagiaire.
            Supprimer une copie retire le document de <b>son</b> dossier — vérifiez qui la détient
            avant de trancher.
          </p>
          {doublons.map((d, i) => (
            <div key={i} className="stock-dbl">
              <div className="stock-dbl-t">
                <b className="chiffres">{d.n}</b> exemplaires identiques ·
                <span className="chiffres"> {mo(d.octets)}</span> pièce
              </div>
              {/* UNE CORBEILLE PAR EXEMPLAIRE, et non un « ne garder que le premier ».
                  Le bouton groupé décidait à la place de l'utilisateur QUEL exemplaire survit —
                  le premier, c'est-à-dire celui que la base a rendu en premier, sans que cet
                  ordre veuille dire quoi que ce soit. Or le choix a du sens : sur l'évaluation
                  d'une stagiaire recopiée dans six autres dossiers, la copie à garder est celle
                  classée sous SON nom, pas la première venue. On supprime donc au cas par cas,
                  en voyant qui détient quoi. */}
              <ul className="stock-dbl-l">
                {d.exemplaires.map((x) => (
                  <li key={x.id}>
                    <a href={archiveFileUrl(x.id)} target="_blank" rel="noopener noreferrer">{x.title}</a>
                    <span className="hint"> — {x.learner_name || "sans stagiaire"}
                      {x.year ? ` · ${x.year}` : ""}{x.week ? ` S${x.week}` : ""}</span>
                    <button type="button" className="iconbtn del stock-del"
                      title={`Supprimer cette copie${x.learner_name ? ` du dossier de ${x.learner_name}` : ""}`}
                      onClick={() => supprimerUne(x)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}

      <details className="stock-bloc">
        <summary><b>Les {lourds.length} plus lourds</b>
          <span className="hint"> · <span className="chiffres">{mo(lourds.reduce((s, x) => s + x.octets, 0))}</span> à eux seuls</span>
        </summary>
        <ul className="stock-lourds">
          {lourds.map((x) => (
            <li key={x.id}>
              <span className="chiffres stock-poids">{mo(x.octets)}</span>
              <a href={archiveFileUrl(x.id)} target="_blank" rel="noopener noreferrer">{x.title}</a>
              <span className="hint">{x.learner_name ? ` — ${x.learner_name}` : ""}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
