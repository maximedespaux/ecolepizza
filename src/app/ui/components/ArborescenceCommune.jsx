import { useEffect, useMemo, useState } from "react";
import { getArborescenceCommune, saveArborescenceCommune, getEquivalences } from "../api/apiClient.js";
import ArchiveTreeEditor, { treeHasEmptyName } from "./ArchiveTreeEditor.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { groupesDepuis, paletteDeLArbre, horsArbreStagiaire, formationDansLArbre } from "../lib/arborescence.js";

/**
 * L'ARBORESCENCE D'ARCHIVAGE COMMUNE (migration 182, demandée le 2026-09-24) — une fois pour toutes
 * les formations.
 *
 * ELLE SE RÉGLAIT FORMATION PAR FORMATION, à la main, dix fois — alors que les trois formations
 * réglées avaient le même squelette et ne différaient que par leurs documents. Ici, on place chaque
 * document UNE fois ; une formation qui ne l'a pas le saute. L'aperçu se lit formation par formation
 * : ce qu'elle saute y est grisé, ce que l'arborescence ne nomme pas y est listé.
 *
 * TANT QUE RIEN N'EST ENREGISTRÉ, l'éditeur s'ouvre sur la PROPOSITION du serveur : les arborescences
 * déjà réglées, fusionnées, avec ce qu'il faut trancher (un document rangé à deux endroits) et ce qui
 * a été retiré (un QCM supprimé, une étape qui n'existe plus). Rien n'est écrit avant « Enregistrer ».
 */
/** Combien de documents une arborescence range : le compte que porte chaque onglet. */
const nbPlaces = (t) => { let n = 0; const w = (fs) => (fs || []).forEach((f) => { n += (f.items || []).length; w(f.children); }); w(t && t.folders); return n; };

export default function ArborescenceCommune({ onClose, onSaved }) {
  const [etat, setEtat] = useState(null);
  const [tree, setTree] = useState({ folders: [] });
  const [companyTree, setCompanyTree] = useState({ folders: [] });
  const [kind, setKind] = useState("stagiaire");
  const [code, setCode] = useState("");
  const [eqMap, setEqMap] = useState(new Map());
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getArborescenceCommune().then((r) => {
      const d = r.data || {};
      setEtat(d);
      setTree(d.tree || { folders: [] });
      setCompanyTree(d.company_tree || { folders: [] });
      // L'aperçu s'ouvre sur la première formation qui a un parcours : c'est celle qui se lit.
      const premiere = (d.formations || []).find((f) => (f.documents || []).length) || (d.formations || [])[0];
      setCode(premiere ? premiere.code : "");
    }).catch((e) => setStatus({ type: "error", message: e.message }));
    getEquivalences().then((r) => {
      const m = new Map();
      for (const e of r.data?.equivalences || []) for (const s of e.members) m.set(s, { group: e.key });
      setEqMap(m);
    }).catch(() => {});
  }, []);

  const groupes = useMemo(() => groupesDepuis(eqMap), [eqMap]);
  const documents = useMemo(() => etat?.documents || [], [etat]);
  const libelles = useMemo(() => new Map(documents.map((d) => [d.cle, d.label])), [documents]);
  const formations = etat?.formations || [];
  const isEnt = kind === "entreprise";
  /* Archivage STAGIAIRE : le dossier de chaque stagiaire, inscrit seul ou par une entreprise — tous
     ses documents, sauf ceux de groupe (🏢). Archivage ENTREPRISE : des copies, et les documents de
     groupe ; tout y est proposé. La règle vit dans lib/arborescence.js, partagée avec l'onglet de la
     formation, et le serveur exclut de l'archive exactement ce que l'aperçu dit non rangé. */
  const docs = useMemo(() => paletteDeLArbre(documents, kind), [documents, kind]);
  const ailleurs = useMemo(() => ({ docs: horsArbreStagiaire(documents), ouvrir: () => setKind("entreprise") }), [documents]);
  const formation = formations.find((f) => f.code === code) || null;
  const formationVue = formationDansLArbre(formation, kind, documents);

  async function enregistrer() {
    for (const [t, k, nom] of [[tree, "stagiaire", "stagiaire"], [companyTree, "entreprise", "entreprise"]]) {
      if (treeHasEmptyName(t)) {
        setKind(k);
        setStatus({ type: "error", message: `Nommez tous les dossiers de l'arborescence ${nom} avant d'enregistrer.` });
        return;
      }
    }
    setSaving(true);
    try {
      const r = await saveArborescenceCommune(tree, companyTree);
      setEtat((e) => ({ ...e, propose: false, conflits: [], retires: [], ajustements: [] }));
      setStatus({ type: "success", message: r?.message || "Arborescence enregistrée pour toutes les formations." });
      onSaved?.();
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal wide">
        <div className="mhead">
          <h3>Arborescence d'archivage, toutes les formations</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <StatusMessage status={status} />
          {!etat ? <p className="hint">Chargement…</p> : (
            <>
              {!etat.disponible && (
                <div className="arbo-avis attente">
                  <b>Migration 182 non jouée</b> : l'arborescence commune ne peut pas encore être enregistrée.
                  D'ici là, l'archive ZIP suit l'arborescence de chaque formation, telle qu'elle est.
                </div>
              )}
              {/* UN « OU » SUPPRIMÉ (Modèles → Équivalences) s'affichait encore ici. Le serveur le déplie à
                  la lecture — ses documents, un par un, à sa place — et l'écran le dit : rien n'est gardé
                  tant que l'école n'enregistre pas. */}
              {etat.ajustements?.length > 0 && (
                <div className="arbo-avis attente">
                  <b>Choix « OU » supprimés</b> dans Modèles → Équivalences : leurs documents sont maintenant rangés un par un,
                  à la même place. <b>Enregistrez</b> pour garder ce rangement.
                  <ul>{etat.ajustements.map((a, i) => (
                    <li key={i}>
                      « {a.label} » ({a.arbre}, {a.dossier.replace(/[{}]/g, "").split(" / ").join(" › ")})
                      {a.documents.length > 0 ? <> → {a.documents.join(", ")}</> : null}
                      {a.perdus.length > 0 ? <> ; {a.perdus.map((x) => `« ${x} »`).join(", ")} n'existe{a.perdus.length > 1 ? "nt" : ""} plus</> : null}
                      {/* L'HOMONYME est dit : c'est un autre modèle (un slug dupliqué) qui prend la place de l'ancien. */}
                      {a.remplaces?.length > 0 ? <> ({a.remplaces.map((r) => `« ${r.nom} » : son ancien modèle n'existe plus, c'est le modèle actuel de ce nom qui est rangé`).join(" ; ")})</> : null}
                    </li>
                  ))}</ul>
                </div>
              )}
              {etat.propose && (
                <div className="arbo-avis">
                  <b>Proposition, rien n'est encore enregistré.</b> Elle réunit les arborescences déjà réglées
                  {etat.sources?.length ? <> sur {etat.sources.join(", ")}</> : null} : chaque document y est placé une fois,
                  et chaque QCM par son titre. Relisez-la, puis enregistrez-la pour toutes les formations.
                  {etat.conflits?.length > 0 && (
                    <>
                      <p className="arbo-avis-t">À trancher : rangés à deux endroits selon la formation</p>
                      <ul>{etat.conflits.map((c, i) => (
                        <li key={i}>« {c.label} » ({c.arbre}) : gardé dans <code>{c.garde}</code> ; {c.code} le rangeait dans <code>{c.ecarte}</code>.</li>
                      ))}</ul>
                    </>
                  )}
                  {etat.retires?.length > 0 && (
                    <>
                      <p className="arbo-avis-t">Retirés : ils ne désignent plus aucun document</p>
                      <ul>{etat.retires.map((c, i) => <li key={i}>« {c.label} » ({c.code}, {c.arbre})</li>)}</ul>
                    </>
                  )}
                </div>
              )}
              {/* UNE BARRE, UN ARBRE. L'aperçu n'est plus un second arbre à côté du premier : choisir une
                  formation barre, dans l'arbre même, ce qu'elle n'a pas — et liste dessous ce qu'il ne
                  nomme pas, avec de quoi le placer. */}
              <div className="arbo-barre">
                <div className="seg">
                  <button type="button" className={"seg-btn" + (!isEnt ? " on" : "")} onClick={() => setKind("stagiaire")}>
                    Archivage stagiaire <span className="arbo-compte">{nbPlaces(tree)}</span>
                  </button>
                  <button type="button" className={"seg-btn" + (isEnt ? " on" : "")} onClick={() => setKind("entreprise")}>
                    Archivage entreprise <span className="arbo-compte">{nbPlaces(companyTree)}</span>
                  </button>
                </div>
                <label className="arbo-pour">
                  Aperçu pour
                  <select value={code} onChange={(e) => setCode(e.target.value)}>
                    <option value="">aucune formation</option>
                    {formations.map((f) => <option key={f.code} value={f.code}>{f.code}</option>)}
                  </select>
                </label>
              </div>
              {/* LES DEUX RÔLES, DITS : l'école rangeait l'arborescence entreprise comme une copie (« je
                  n'en veux pas de copie »), alors qu'elle rangeait jusque-là le dossier ENTIER des stagiaires
                  inscrits par une entreprise. C'est désormais ce qu'elle est (placesDansLArchive). */}
              <p className="arbo-intro">
                Chaque document se range <b>une fois, pour toutes les formations</b> ; une formation qui ne l'a pas le saute.
                {isEnt
                  ? <> Ici, des <b>copies pour l'entreprise</b> : ce que vous rangez s'ajoute, pour les stagiaires qu'elle inscrit, à leur dossier de l'archivage stagiaire. Ses documents de groupe (🏢) n'ont que cette place.</>
                  : <> Ici, le dossier de <b>chaque stagiaire</b>, inscrit seul ou par une entreprise.</>}
                {" "}<b>Ce qui n'est rangé nulle part n'est pas archivé.</b> Cliquez le nom d'un dossier pour le renommer, « Document » pour y placer un document.
              </p>
              <ArchiveTreeEditor tree={isEnt ? companyTree : tree} onChange={isEnt ? setCompanyTree : setTree}
                eqMap={eqMap} docs={docs} nbFormations={formations.length}
                formation={formationVue} palette={libelles} groupes={groupes}
                arbre={kind} ailleurs={isEnt ? null : ailleurs} />
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          <button className="btn primary" onClick={enregistrer} disabled={saving || !etat || !etat.disponible}
            title={etat && !etat.disponible ? "Migration 182 non jouée" : undefined}>
            {saving ? "Enregistrement…" : "Enregistrer pour toutes les formations"}
          </button>
        </div>
      </div>
    </div>
  );
}
