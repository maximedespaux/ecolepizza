import { useEffect, useMemo, useState } from "react";
import { getArborescenceCommune, saveArborescenceCommune, getEquivalences } from "../api/apiClient.js";
import ArchiveTreeEditor, { treeHasEmptyName, ArchiveTreePreview } from "./ArchiveTreeEditor.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { groupesDepuis } from "../lib/arborescence.js";

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
  /* Archivage STAGIAIRE : sans les documents de groupe (🏢), qui vont à l'entreprise. Archivage
     ENTREPRISE : tout — l'inscription passant par une entreprise, chaque document signé peut lui
     être archivé. (Même règle que l'éditeur par formation qu'il remplace.) */
  const deGroupe = useMemo(() => new Set(documents.filter((d) => d.company_level).map((d) => d.cle)), [documents]);
  const docs = isEnt ? documents : documents.filter((d) => !d.company_level);
  const formation = formations.find((f) => f.code === code) || null;
  const formationVue = formation && {
    ...formation,
    documents: isEnt ? formation.documents : formation.documents.filter((c) => !deGroupe.has(c)),
  };

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
      setEtat((e) => ({ ...e, propose: false, conflits: [], retires: [] }));
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
              <div className="seg" style={{ marginBottom: 12 }}>
                <button type="button" className={"seg-btn" + (!isEnt ? " on" : "")} onClick={() => setKind("stagiaire")}>Archivage stagiaire</button>
                <button type="button" className={"seg-btn" + (isEnt ? " on" : "")} onClick={() => setKind("entreprise")}>Archivage entreprise</button>
              </div>
              {/* En classes et non en style : sur un écran étroit, l'aperçu passe SOUS l'éditeur
                  (cf. `.fm-archives` dans app.css). À deux colonnes sur un téléphone, il coupait
                  chaque nom de dossier au bout de dix caractères. */}
              <div className="fm-archives">
                <ArchiveTreeEditor tree={isEnt ? companyTree : tree} onChange={isEnt ? setCompanyTree : setTree}
                  eqMap={eqMap} docs={docs} nbFormations={formations.length} />
                <div className="fm-archives-apercu">
                  <div className="arbo-apercu-t">
                    Aperçu, {isEnt ? "entreprise" : "stagiaire"}, pour
                    <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Formation de l'aperçu">
                      {formations.map((f) => <option key={f.code} value={f.code}>{f.code}</option>)}
                    </select>
                  </div>
                  <ArchiveTreePreview tree={isEnt ? companyTree : tree} formation={formationVue} palette={libelles} groupes={groupes} />
                </div>
              </div>
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
