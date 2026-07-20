import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { colorOf } from "../lib/format.js";
import QuestBankEditor from "../components/QuestBankEditor.jsx";
import {
  getQuestStructure, createQuestCategory, updateQuestCategory, deleteQuestCategory,
  setProgramQuestCategories, addQuestPrerequisite, deleteQuestPrerequisite,
  getQuestContent, createQuestDifficulty, updateQuestDifficulty, deleteQuestDifficulty,
} from "../api/apiClient.js";

/**
 * Pizza Quest — paramétrage côté organisme (phase 1 : structure).
 *
 * Trois choses se règlent ici, et rien de plus :
 *   · les THÈMES (de quoi parle une formation) et les PALIERS (à quel niveau elle se situe) ;
 *   · le rangement de chaque formation dans ces deux axes ;
 *   · les PRÉREQUIS — quelle formation doit être terminée avant d'attaquer la suivante.
 *
 * Tout est facultatif : une formation non rangée et sans prérequis se comporte comme avant
 * (monde libre sur la carte du stagiaire). On ne force personne à structurer son catalogue.
 *
 * La banque de questions et l'XP arrivent en phase 2 — d'où l'absence d'onglet ici.
 */

const AXES = [
  { kind: "THEME", label: "Thèmes", one: "thème", ic: "compass",
    help: "De quoi parle la formation : Pizza, Gestion, Hygiène… Sert à regrouper les mondes sur la carte." },
  { kind: "TIER", label: "Paliers", one: "palier", ic: "star",
    help: "À quel niveau elle se situe : Débutant, Confirmé, Expert… Donne le sens de progression." },
];

export default function QuestManager() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("categories"); // structure | contenu
  const [difficulties, setDifficulties] = useState([]);

  const reload = () => getQuestStructure()
    .then((r) => setData(r.data || { categories: [], programs: [], prerequisites: [] }))
    .catch((e) => { setStatus({ type: "error", message: e.message }); setData({ categories: [], programs: [], prerequisites: [] }); });
  // Les difficultés vivent avec la banque (phase 2) mais servent aussi à l'éditeur de
  // questions : on les charge ici une fois, pour les passer aux deux écrans.
  const reloadDiff = () => getQuestContent()
    .then((r) => setDifficulties((r.data && r.data.difficulties) || []))
    .catch(() => setDifficulties([]));
  useEffect(() => { reload(); reloadDiff(); }, []);

  // Toute action passe par ici : une seule gestion d'erreur, un seul rechargement.
  async function run(fn, okMsg) {
    setStatus(null);
    try {
      await fn();
      await Promise.all([reload(), reloadDiff()]);
      if (okMsg) setStatus({ type: "success", message: okMsg });
    } catch (e) { setStatus({ type: "error", message: e.message || "Action impossible." }); }
  }

  if (!data) return <p className="hint">Chargement…</p>;
  const { categories, programs, prerequisites } = data;
  const catsOf = (kind) => categories.filter((c) => c.kind === kind);

  return (
    <>
      <PageHead eyebrow="Configuration" title="Pizza Quest"
        lead="Structurez le parcours d'entraînement : rangez vos formations par thème et par palier, et dites laquelle doit être terminée avant d'attaquer la suivante." />
      <StatusMessage status={status} />

      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={"seg-btn" + (tab === "categories" ? " on" : "")} onClick={() => setTab("categories")}>
          Thèmes &amp; paliers{categories.length ? ` (${categories.length})` : ""}
        </button>
        <button type="button" className={"seg-btn" + (tab === "formations" ? " on" : "")} onClick={() => setTab("formations")}>
          Rangement des formations
        </button>
        <button type="button" className={"seg-btn" + (tab === "prerequis" ? " on" : "")} onClick={() => setTab("prerequis")}>
          Prérequis{prerequisites.length ? ` (${prerequisites.length})` : ""}
        </button>
        <button type="button" className={"seg-btn" + (tab === "difficultes" ? " on" : "")} onClick={() => setTab("difficultes")}>
          Difficultés &amp; XP{difficulties.length ? ` (${difficulties.length})` : ""}
        </button>
        <button type="button" className={"seg-btn" + (tab === "questions" ? " on" : "")} onClick={() => setTab("questions")}>
          Questions
        </button>
      </div>

      {tab === "categories" && AXES.map((axe) => (
        <AxeCard key={axe.kind} axe={axe} cats={catsOf(axe.kind)} programs={programs} run={run} />
      ))}

      {tab === "formations" && (
        <RangementCard programs={programs} themes={catsOf("THEME")} tiers={catsOf("TIER")} run={run} />
      )}

      {tab === "prerequis" && (
        <PrerequisCard programs={programs} prerequisites={prerequisites} run={run} />
      )}

      {tab === "difficultes" && <DifficultesCard difficulties={difficulties} run={run} />}

      {tab === "questions" && (
        <QuestBankEditor programs={programs} difficulties={difficulties} onStatus={setStatus} />
      )}
    </>
  );
}

/* ---- Difficultés & XP ----------------------------------------------------------------- */

function DifficultesCard({ difficulties, run }) {
  const [nom, setNom] = useState("");
  const [xp, setXp] = useState(10);
  return (
    <Card title={<span className="card-ttl"><Icon name="target" size={16} /> Difficultés &amp; XP</span>}>
      <p className="hint" style={{ marginTop: 0 }}>
        Chaque difficulté porte l'XP gagné par question. Régler « Difficile » à 20 requalifie
        d'un coup toutes les questions de ce niveau — inutile de les rouvrir une à une. Une
        question peut malgré tout fixer son propre XP, qui l'emporte alors.
      </p>

      <form style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!nom.trim()) return;
          run(() => createQuestDifficulty({ name: nom.trim(), xp: Number(xp) || 0 }), "Difficulté ajoutée.");
          setNom(""); setXp(10);
        }}>
        <div className="field" style={{ margin: 0 }}>
          <label>Intitulé</label>
          <input className="inp" value={nom} onChange={(e) => setNom(e.target.value)}
            placeholder="Expert…" style={{ maxWidth: 220 }} />
        </div>
        <div className="field" style={{ margin: 0, width: 110 }}>
          <label>XP</label>
          <input className="inp" type="number" min="0" value={xp} onChange={(e) => setXp(e.target.value)} />
        </div>
        <button type="submit" className="btn sm" disabled={!nom.trim()}><Icon name="plus" size={14} /> Ajouter</button>
      </form>

      {difficulties.length === 0
        ? <p className="hint">Aucune difficulté. Sans elle, chaque question vaut son XP propre (10 par défaut).</p>
        : (
          <table className="tbl">
            <thead><tr><th>Difficulté</th><th style={{ width: 120 }}>XP</th><th style={{ width: 110 }}>Couleur</th><th style={{ width: 60 }} /></tr></thead>
            <tbody>
              {difficulties.map((d) => (
                <tr key={d.id}>
                  <td>
                    <input className="inp" defaultValue={d.name}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== d.name) run(() => updateQuestDifficulty(d.id, { name: e.target.value.trim() })); }} />
                  </td>
                  <td>
                    <input className="inp" type="number" min="0" defaultValue={d.xp}
                      onBlur={(e) => { if (Number(e.target.value) !== d.xp) run(() => updateQuestDifficulty(d.id, { xp: Number(e.target.value) || 0 })); }} />
                  </td>
                  <td>
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(d.color || "") ? d.color : "#5b6079"}
                      onChange={(e) => run(() => updateQuestDifficulty(d.id, { color: e.target.value }))} />
                  </td>
                  <td>
                    <button type="button" className="btn sm ghost danger"
                      onClick={() => {
                        // Les questions rattachées ne sont PAS supprimées : elles retombent
                        // simplement sur l'XP par défaut.
                        if (window.confirm(`Supprimer « ${d.name} » ? Les questions de ce niveau garderont leur XP propre, ou 10 par défaut.`)) {
                          run(() => deleteQuestDifficulty(d.id), "Difficulté supprimée.");
                        }
                      }}><Icon name="trash" size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Card>
  );
}

/* ---- Thèmes / paliers ---------------------------------------------------------------- */

function AxeCard({ axe, cats, programs, run }) {
  const [nom, setNom] = useState("");
  const champ = axe.kind === "THEME" ? "quest_theme_id" : "quest_tier_id";
  const usage = (id) => programs.filter((p) => p[champ] === id).length;

  return (
    <Card title={<span className="card-ttl"><Icon name={axe.ic} size={16} /> {axe.label}</span>}>
      <p className="hint" style={{ marginTop: 0 }}>{axe.help}</p>

      <form style={{ display: "flex", gap: 8, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const name = nom.trim();
          if (!name) return;
          run(() => createQuestCategory({ kind: axe.kind, name }), `${axe.one[0].toUpperCase()}${axe.one.slice(1)} ajouté.`);
          setNom("");
        }}>
        <input className="inp" value={nom} onChange={(e) => setNom(e.target.value)}
          placeholder={`Nouveau ${axe.one}…`} style={{ maxWidth: 280 }} />
        <button type="submit" className="btn sm" disabled={!nom.trim()}><Icon name="plus" size={14} /> Ajouter</button>
      </form>

      {cats.length === 0
        ? <p className="hint">Aucun {axe.one} pour l'instant.</p>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cats.map((c) => <CatRow key={c.id} cat={c} axe={axe} used={usage(c.id)} run={run} />)}
          </div>
        )}
    </Card>
  );
}

function CatRow({ cat, axe, used, run }) {
  const [edit, setEdit] = useState(false);
  const [nom, setNom] = useState(cat.name);
  const couleur = cat.color || colorOf(cat.name);

  if (edit) {
    return (
      <form style={{ display: "flex", gap: 8, alignItems: "center" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!nom.trim()) return;
          run(() => updateQuestCategory(cat.id, { name: nom.trim() }), "Enregistré.");
          setEdit(false);
        }}>
        <input className="inp" value={nom} onChange={(e) => setNom(e.target.value)} style={{ maxWidth: 260 }} autoFocus />
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(couleur) ? couleur : "#5b6079"} title="Couleur"
          onChange={(e) => run(() => updateQuestCategory(cat.id, { color: e.target.value }))} />
        <button type="submit" className="btn sm">Enregistrer</button>
        <button type="button" className="btn sm ghost" onClick={() => { setNom(cat.name); setEdit(false); }}>Annuler</button>
      </form>
    );
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: couleur, flex: "0 0 auto" }} />
      <b style={{ flex: 1 }}>{cat.name}</b>
      <span className="hint">{used === 0 ? "aucune formation" : `${used} formation${used > 1 ? "s" : ""}`}</span>
      <button type="button" className="btn sm ghost" onClick={() => setEdit(true)}><Icon name="pencil" size={13} /></button>
      <button type="button" className="btn sm ghost danger"
        onClick={() => {
          // On prévient du DÉTACHEMENT : la suppression ne touche pas aux formations
          // elles-mêmes, mais elles perdent ce rangement.
          const msg = used
            ? `Supprimer « ${cat.name} » ? ${used} formation${used > 1 ? "s perdront" : " perdra"} ce ${axe.one}.`
            : `Supprimer « ${cat.name} » ?`;
          if (window.confirm(msg)) run(() => deleteQuestCategory(cat.id), "Supprimé.");
        }}>
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}

/* ---- Rangement des formations -------------------------------------------------------- */

function RangementCard({ programs, themes, tiers, run }) {
  if (!programs.length) {
    return <EmptyState icon="graduation" title="Aucune formation"
      text="Créez d'abord vos formations : elles deviendront les mondes de Pizza Quest." />;
  }
  return (
    <Card title={<span className="card-ttl"><Icon name="columns" size={16} /> Rangement des formations</span>}>
      <p className="hint" style={{ marginTop: 0 }}>
        Chaque formation est un « monde » de Pizza Quest. Le thème et le palier sont facultatifs :
        laissés vides, la formation reste sur la carte sans regroupement.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr><th>Formation</th><th style={{ width: 200 }}>Thème</th><th style={{ width: 200 }}>Palier</th></tr>
          </thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color || colorOf(p.code) }} />
                    <b>{p.code}</b> <span className="hint">{p.title}</span>
                  </span>
                </td>
                {[["quest_theme_id", themes, "thème"], ["quest_tier_id", tiers, "palier"]].map(([champ, opts, mot]) => (
                  <td key={champ}>
                    {opts.length === 0
                      ? <span className="hint">aucun {mot} défini</span>
                      : (
                        <select value={p[champ] || ""}
                          onChange={(e) => run(() => setProgramQuestCategories(p.id, { [champ]: e.target.value || null }))}>
                          <option value="">—</option>
                          {opts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---- Prérequis ----------------------------------------------------------------------- */

function PrerequisCard({ programs, prerequisites, run }) {
  const [cible, setCible] = useState("");
  const [requis, setRequis] = useState("");
  const nom = (id) => {
    const p = programs.find((x) => x.id === id);
    return p ? `${p.code} — ${p.title}` : "formation supprimée";
  };
  // Prérequis regroupés par formation cible : on lit « pour X, il faut Y et Z ».
  const parCible = new Map();
  for (const pr of prerequisites) {
    if (!parCible.has(pr.program_id)) parCible.set(pr.program_id, []);
    parCible.get(pr.program_id).push(pr);
  }

  if (programs.length < 2) {
    return <EmptyState icon="list-checks" title="Pas assez de formations"
      text="Il faut au moins deux formations pour définir un ordre de passage." />;
  }

  return (
    <Card title={<span className="card-ttl"><Icon name="list-checks" size={16} /> Prérequis entre formations</span>}>
      <p className="hint" style={{ marginTop: 0 }}>
        « Pour attaquer cette formation, il faut avoir <b>terminé</b> celle-là. » Sur la carte du
        stagiaire, un monde dont les prérequis ne sont pas remplis reste verrouillé, avec la liste
        de ce qui manque. Une formation peut en exiger plusieurs.
      </p>

      <form style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!cible || !requis) return;
          run(() => addQuestPrerequisite({ program_id: cible, requires_program_id: requis }), "Prérequis ajouté.");
          setRequis("");
        }}>
        <span>Pour</span>
        <select value={cible} onChange={(e) => setCible(e.target.value)}>
          <option value="">choisir une formation…</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
        </select>
        <span>il faut avoir terminé</span>
        <select value={requis} onChange={(e) => setRequis(e.target.value)} disabled={!cible}>
          <option value="">choisir…</option>
          {programs.filter((p) => p.id !== cible).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
        </select>
        <button type="submit" className="btn sm" disabled={!cible || !requis}><Icon name="plus" size={14} /> Ajouter</button>
      </form>

      {prerequisites.length === 0
        ? <p className="hint">Aucun prérequis : toutes les formations sont accessibles librement.</p>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...parCible.entries()].map(([progId, liste]) => (
              <div key={progId}>
                <b>{nom(progId)}</b>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {liste.map((pr) => (
                    <span key={pr.id} className="pill" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <Icon name="lock" size={12} /> {nom(pr.requires_program_id)}
                      <button type="button" className="pf-x" title="Retirer ce prérequis"
                        onClick={() => run(() => deleteQuestPrerequisite(pr.id), "Prérequis retiré.")}>
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </Card>
  );
}
