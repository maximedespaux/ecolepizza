import { useEffect, useMemo, useRef, useState } from "react";
import { getMyFormations, getMyProfile, getPlayableChapters } from "../api/apiClient.js";
import { Icon } from "../components/Icon.jsx";
import ConstructorGame from "../components/ConstructorGame.jsx";
import SimulateurPizza from "../components/SimulateurPizza.jsx";
import { colorOf } from "../lib/format.js";
import { saveQuestProgress } from "../lib/gamification.js";

/**
 * Pizza Quest — entraînement QCM ludique (façon Duolingo × Mario/Royal Match).
 * ACCUEIL = le schéma des formations, en carte de jeu : le tronc (Niveau I / I Pro
 * → Niveau II en prérequis) + Fabriquer des pizzas artisanales + les spécialisations,
 * thématisé pizza (blé, eau, huile, levure…). On clique une formation → son « monde »
 * (chemin de chapitres) → un chapitre = mini-QCM (les « étapes »).
 *
 * Les questions viennent EXCLUSIVEMENT de la banque de l'organisme (Configuration →
 * Pizza Quest), chargée par formation. Une formation sans chapitre affiche un état vide :
 * plus aucune question de démonstration ni banque codée en dur, qui donnaient à voir au
 * stagiaire du contenu que son école n'avait jamais écrit.
 * Chaque question porte son explication (`expl`) et sa page de manuel (`src`) : se tromper
 * doit apprendre quelque chose, pas seulement coûter un cœur.
 * Progression miroir localStorage + serveur (learner_quest_progress) : réhydratée au
 * montage, donc un cache vidé ne perd rien.
 */

/* Plus de questions de repli ici. La banque de l'organisme (base, cf. Configuration →
   Pizza Quest) est la SEULE source : un monde sans chapitre affiche un état vide et non
   des questions de démonstration. Servir du contenu que l'organisme n'a pas écrit lui
   faisait découvrir, côté stagiaire, des questions absentes de son import. */

/**
 * Chapitres d'un monde — UNIQUEMENT ceux de l'organisme (cf. Configuration → Pizza Quest).
 *
 * `w.dbChapters` vaut `null` tant que l'API n'a pas répondu, et un tableau ensuite : c'est
 * ce qui distingue « en cours de chargement » de « aucun chapitre », deux états qui ne
 * s'affichent pas pareil.
 */
const chaptersFor = (w) => (w && Array.isArray(w.dbChapters) ? w.dbChapters : []);
const chaptersLoading = (w) => !!w && w.dbChapters === null;

/**
 * Défilement horizontal animé, en ease-in-out.
 *
 * Fait à la main plutôt qu'avec `scrollTo({ behavior: "smooth" })` : la courbe native n'est
 * ni réglable ni la même d'un navigateur à l'autre, et la durée nous échappe. Ici le trajet
 * démarre doucement, prend de la vitesse au milieu et se pose en fin de course — c'est ce
 * qui donne à lire le chemin parcouru plutôt qu'un saut.
 *
 * Renvoie une fonction d'ANNULATION (et non l'identifiant de la première image : chaque
 * image en demande une nouvelle, annuler la première ne stopperait rien une fois lancée).
 */
function animerDefilement(boite, arrivee, duree = 800) {
    const depart = boite.scrollLeft;
    const delta = arrivee - depart;
    const t0 = performance.now();
    // Cubique : accélère jusqu'à mi-parcours, freine ensuite.
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let id = 0;
    const pas = (maintenant) => {
        const t = Math.min(1, (maintenant - t0) / duree);
        boite.scrollLeft = depart + delta * ease(t);
        if (t < 1) id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
}

const KEY = "pizzaquest.v1";
const loadProg = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
// Enregistre en local ET en base (miroir) via gamification.saveQuestProgress.
const saveProg = (p) => saveQuestProgress(p);

// Rôle d'une formation dans le schéma (par mots-clés du titre) + ingrédient-thème.
function roleOf(w) {
  const t = `${w.title} ${w.code}`.toLowerCase();
  if (/artisanal/.test(t)) return "decouverte";
  if (/expert/.test(t)) return "expert"; // suite du Niveau II (prérequis Niveau II)
  if (/teglia|pala|napolit/.test(t)) return "spe";
  if (/niveau ii|emp[aâ]tement/.test(t)) return "niv2";
  if (/pro/.test(t)) return "niv1pro";
  if (/niveau i|classique/.test(t)) return "niv1";
  return "autre";
}
const INGREDIENT = { decouverte: "🍕", niv1: "🌾", niv1pro: "🌾", niv2: "🧫", expert: "🏆", spe: "🔥", autre: "🧑‍🍳" };

/* Géométrie du chemin. Les décalages verticaux dessinent le sentier ; ECART_X est la
   distance entre deux CENTRES de pastilles.
   Chaque case a une LARGEUR FIXE (--pq-w = 116) et la rangée un écart constant
   (--pq-gap = 8) : l'écart entre centres vaut donc leur somme, 124. Sans largeur fixe, la
   case s'étirait à la taille de son libellé et cette distance changeait à chaque paire —
   le segment, lui, était calculé sur une valeur unique et tombait à côté.
   À modifier EN MÊME TEMPS que --pq-w / --pq-gap dans .pq-path. */
const DECALAGES = [0, -26, -38, -26, 0, 26];
const ECART_X = 124;

function PizzaQuest() {
  const [worlds, setWorlds] = useState(null);
  const [active, setActive] = useState(null); // null = carte ; sinon code du monde
  const [prog, setProg] = useState(loadProg);
  const [quiz, setQuiz] = useState(null);
  const [mini, setMini] = useState(null); // { key, obj? } du mini-jeu ouvert, ou null
  /* Les CŒURS et l'XP ont été retirés (2026-07-28) : ils récompensaient le temps passé à
     cliquer, et le manque de cœur BLOQUAIT la révision — punir quelqu'un qui veut réviser est
     un contresens pédagogique. La progression se voit désormais aux CADRES, gagnés sur les
     formations réellement terminées (cf. lib/cadres.js). Les étoiles restent : elles notent la
     réussite d'un chapitre, elles ne rationnent pas l'accès. */

  useEffect(() => {
    getMyFormations().then((r) => {
      setWorlds((r.data || []).map((f) => ({
        code: f.program_code, title: f.program_title, program_id: f.program_id,
        color: f.color || colorOf(f.program_code),
        // Une formation DÉJÀ TERMINÉE reste ouverte quoi qu'il arrive : lui opposer un
        // prérequis après coup reviendrait à reprendre un acquis.
        unlocked: !!f.finished
          || ((!!f.has_badge || !!f.enrolled) && !f.revoked && !f.prereq_locked),
        // Ce qui manque, nommé : un cadenas muet n'indique pas quoi faire pour l'ouvrir.
        prereqMissing: f.prereq_locked ? (f.prereq_missing || []) : [],
        // TOUS les prérequis, acquis compris : c'est le plan de parcours (« pour l'Expert,
        // il faut le Niveau II »), lisible même une fois le Niveau II obtenu.
        prereqAll: f.prereq_all || [],
        theme: f.quest_theme || null,
        tier: f.quest_tier || null,
        dbChapters: null, // complété juste après par la banque de l'organisme
      })));
    }).catch(() => setWorlds([]));
  }, []);

  // Banque de l'organisme, par formation. Chargée APRÈS la carte : les mondes s'affichent
  // tout de suite avec leurs chapitres codés en dur, puis basculent sur ceux de la base si
  // l'organisme en a. Un échec ou une banque vide laisse simplement le repli en place.
  useEffect(() => {
    if (!worlds || !worlds.length) return;
    let alive = true;
    const aCharger = worlds.filter((w) => w.program_id && w.dbChapters === null);
    if (!aCharger.length) return;
    Promise.all(aCharger.map((w) =>
      getPlayableChapters(w.program_id)
        .then((r) => ({ code: w.code, chapters: (r && r.data && r.data.chapters) || [] }))
        .catch(() => ({ code: w.code, chapters: [] }))
    )).then((res) => {
      if (!alive) return;
      const parCode = new Map(res.map((x) => [x.code, x.chapters]));
      setWorlds((ws) => ws.map((w) => (parCode.has(w.code) ? { ...w, dbChapters: parCode.get(w.code) } : w)));
    });
    return () => { alive = false; };
  }, [worlds]);

  // Réhydrate la progression depuis le serveur (source de vérité) et fusionne avec le local
  // (meilleur score conservé). Le localStorage peut être vidé sans perdre la progression.
  useEffect(() => {
    getMyProfile().then((r) => {
      const server = (r && r.data && r.data.progress) || {};
      if (!Object.keys(server).length) return;
      setProg((local) => {
        const merged = { ...local };
        for (const [w, steps] of Object.entries(server)) {
          merged[w] = { ...(merged[w] || {}) };
          for (const [st, stars] of Object.entries(steps)) merged[w][st] = Math.max(Number(stars) || 0, merged[w][st] || 0);
        }
        try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        return merged;
      });
    }).catch(() => {});
  }, []);

  const totalStars = useMemo(() => Object.values(prog).reduce((s, w) => s + Object.values(w).reduce((a, v) => a + v, 0), 0), [prog]);

  function finishChapter(code, chIdx, stars) {
    setProg((p) => {
      const next = { ...p, [code]: { ...(p[code] || {}), [chIdx]: Math.max(stars, (p[code] || {})[chIdx] || 0) } };
      saveProg(next); return next;
    });
    setQuiz(null);
  }
  function finishMini(key, stars) {
    setProg((p) => { const next = { ...p, [key]: { 0: Math.max(stars, (p[key] || {})[0] || 0) } }; saveProg(next); return next; });
    setMini(null);
  }

  if (!worlds) return <div className="hero"><div className="eyebrow">Espace stagiaire</div><h1>Pizza Quest</h1><p>Chargement…</p></div>;
  const world = active ? worlds.find((w) => w.code === active) : null;

  return (
    <>
      <div className="hero" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="eyebrow">Espace stagiaire · entraînement</div>
          <h1 style={{ marginBottom: 4 }}>Pizza Quest</h1>
          <p style={{ margin: 0 }}>Entraîne-toi pour le QCM de demain — choisis une formation sur la carte.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Les étoiles restent : elles notent la réussite d'un chapitre. Ce sont l'XP et les
              cœurs qui ont disparu — ils comptaient le temps passé et rationnaient l'accès. */}
          <div className="pq-stat"><span style={{ fontSize: 15 }}>⭐</span><b>{totalStars}</b><span>étoiles</span></div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Questions du manuel — QCM, vrai/faux et associations. Chaque bonne réponse s'accompagne
        de son explication : c'est là que le chapitre se révise.
      </p>

      {world
        ? <WorldView world={world} prog={prog[world.code] || {}} onBack={() => setActive(null)}
            onChapter={(chIdx, chapter) => setQuiz({ code: world.code, chIdx, chapter, questions: chapter.questions || [] })}
            onGame={(g) => setMini({ key: g.key, obj: g.obj })} />
        : <FormationMap worlds={worlds} prog={prog} onPick={setActive} />}

      {/* Quitter un chapitre ne coûte plus rien : les cœurs sont supprimés. On ne demande
          donc plus confirmation — il n'y a plus rien à perdre. */}
      {quiz && world && (
        <QuizModal world={world} data={quiz}
          onClose={() => setQuiz(null)}
          // Reprise après échec : toujours possible et sans contrepartie.
          onRetry={null}
          // Validation : au moins une étoile, garanti par l'écran de résultat.
          onFinish={(stars) => finishChapter(quiz.code, quiz.chIdx, stars)} />
      )}
      {mini?.key === "constructeur" && <ConstructorGame onClose={() => setMini(null)} onFinish={(stars) => finishMini("constructeur", stars)} />}
      {mini?.key === "simulateur" && <SimulateurPizza objectifId={mini.obj} onClose={() => setMini(null)} onFinish={(stars) => finishMini("simulateur", stars)} />}

    </>
  );
}

/**
 * Carte de parcours.
 *
 * Deux mises en page, et c'est l'ORGANISME qui tranche sans le savoir : dès qu'il a rangé
 * au moins une formation (Configuration → Pizza Quest), on affiche SON classement — thèmes
 * en sections, paliers en rangées ordonnées. Tant qu'il n'a rien rangé, on garde la carte
 * historique déduite des noms de formation, pour ne pas afficher une page vide à ceux qui
 * n'ont jamais ouvert cet écran.
 */
function FormationMap({ worlds, prog, onPick }) {
  const card = (w) => <FCard key={w.code} w={w} prog={prog[w.code]} onPick={onPick} />;
  // Dès que l'organisme a commencé à ranger son catalogue, le rangement fait office de
  // SÉLECTION : une formation sans thème ni palier n'est pas au programme de Pizza Quest et
  // ne s'affiche pas. Ranger une formation, c'est la mettre sur la carte.
  const rangees = worlds.filter((w) => w.theme || w.tier);
  if (rangees.length) return <CarteRangee worlds={rangees} card={card} />;
  // Aucun rangement du tout : on garde la carte historique et TOUTES les formations —
  // appliquer la règle ici viderait Pizza Quest chez qui n'a jamais ouvert cet écran.

  const by = { decouverte: [], niv1: [], niv1pro: [], niv2: [], expert: [], spe: [], autre: [] };
  for (const w of worlds) by[roleOf(w)].push(w);
  const hasTronc = by.decouverte.length || by.niv1.length || by.niv1pro.length || by.niv2.length || by.expert.length;

  return (
    <div className="pq-board">
      {hasTronc && <>
        <div className="pq-tier-label">Nos formations</div>
        {by.decouverte.length > 0 && <><div className="pq-row">{by.decouverte.map((w) => card(w))}</div><PrerequisResume worlds={by.decouverte} /></>}
        {(by.niv1.length > 0 || by.niv1pro.length > 0) && (
          <><div className="pq-row" style={{ marginTop: 12 }}>{by.niv1.map((w) => card(w))}{by.niv1pro.map((w) => card(w))}</div><PrerequisResume worlds={[...by.niv1, ...by.niv1pro]} /></>
        )}
        {by.niv2.length > 0 && (
          <>
            <div className="pq-connect"><Icon name="chevron-down" size={22} /><Icon name="chevron-down" size={22} /></div>
            <div className="pq-row">{by.niv2.map((w) => card(w))}</div>
            <PrerequisResume worlds={by.niv2} />
          </>
        )}
        {by.expert.length > 0 && (
          <>
            <div className="pq-connect"><Icon name="chevron-down" size={22} /></div>
            <div className="pq-row">{by.expert.map((w) => card(w))}</div>
            <PrerequisResume worlds={by.expert} />
          </>
        )}
      </>}

      {by.spe.length > 0 && <>
        <div className="pq-divider" />
        <div className="pq-tier-label">Nos spécialisations</div>
        <div className="pq-row">{by.spe.map((w) => card(w))}</div>
        <PrerequisResume worlds={by.spe} />
      </>}

      {by.autre.length > 0 && <>
        <div className="pq-divider" />
        <div className="pq-tier-label">Autres</div>
        <div className="pq-row">{by.autre.map((w) => card(w))}</div>
        <PrerequisResume worlds={by.autre} />
      </>}
    </div>
  );
}

/**
 * Légende des pastilles « ! » d'UN GROUPE, affichée juste sous ce groupe.
 *
 * La pastille signale, la légende dit ce qu'elle veut dire — et elle est placée là où les
 * pastilles se trouvent, pas en pied de page : sur une carte à plusieurs rangées, chercher
 * au bas de l'écran le sens d'un « ! » aperçu en haut fait perdre le fil.
 *
 * Le DÉTAIL (quelle formation, déjà acquise ou non) reste dans l'infobulle de la carte et,
 * en toutes lettres, à l'ouverture du monde : la légende n'a pas à répéter le parcours.
 * Ne rend rien si aucune formation du groupe n'a de prérequis.
 */
function PrerequisResume({ worlds }) {
  const avec = (worlds || []).filter((w) => (w.prereqAll || []).length > 0);
  if (!avec.length) return null;
  return (
    <div style={{ textAlign: "center", marginTop: 10 }}>
      {/* Mise en forme de la pastille : dans .pq-legend .pq-prereq, pas en style inline —
          des surcharges partielles laissaient la police et la bordure de la carte. */}
      <span className="pq-legend">
        <span className="pq-prereq" aria-hidden="true">!</span>
        = prérequis (niveau précédent)
      </span>
    </div>
  );
}

/**
 * Carte construite sur le classement de l'organisme : une SECTION par thème (« de quoi ça
 * parle »), une RANGÉE par palier à l'intérieur (« à quel niveau »), dans l'ordre défini en
 * configuration. Les rangées s'enchaînent avec le même chevron que la carte historique :
 * c'est ce qui donne à lire une progression plutôt qu'une grille.
 *
 * Les formations non rangées ne disparaissent pas — elles atterrissent en fin de section, ou
 * dans une section « Autres formations ». Un catalogue à moitié classé reste donc complet.
 */
function CarteRangee({ worlds, card }) {
  const SANS = "__sans__";
  const ordre = (c) => (c && typeof c.sort_order === "number" ? c.sort_order : 9999);

  // Thèmes présents, dans leur ordre de configuration ; les non-rangées en dernier.
  const themes = [];
  const vus = new Map();
  for (const w of worlds) {
    const key = w.theme ? w.theme.id : SANS;
    if (!vus.has(key)) { vus.set(key, { key, cat: w.theme || null, worlds: [] }); themes.push(vus.get(key)); }
    vus.get(key).worlds.push(w);
  }
  themes.sort((a, b) => (a.key === SANS) - (b.key === SANS) || ordre(a.cat) - ordre(b.cat));

  return (
    <div className="pq-board">
      {themes.map((section, si) => {
        // Paliers de CETTE section, ordonnés ; les formations sans palier ferment la marche.
        const paliers = [];
        const vusP = new Map();
        for (const w of section.worlds) {
          const key = w.tier ? w.tier.id : SANS;
          if (!vusP.has(key)) { vusP.set(key, { key, cat: w.tier || null, worlds: [] }); paliers.push(vusP.get(key)); }
          vusP.get(key).worlds.push(w);
        }
        paliers.sort((a, b) => (a.key === SANS) - (b.key === SANS) || ordre(a.cat) - ordre(b.cat));

        return (
          <div key={section.key}>
            {si > 0 && <div className="pq-divider" />}
            <div className="pq-tier-label" style={section.cat?.color ? { color: section.cat.color } : undefined}>
              {section.cat ? section.cat.name : "Autres formations"}
            </div>
            {paliers.map((p, pi) => (
              <div key={p.key}>
                {/* Le chevron ne sépare que deux paliers : il annonce une progression, pas
                    une simple mise en page. */}
                {pi > 0 && <div className="pq-connect"><Icon name="chevron-down" size={22} /></div>}
                {p.cat && (
                  <div className="pq-sub-label" style={p.cat.color ? { color: p.cat.color } : undefined}>
                    {p.cat.name}
                  </div>
                )}
                <div className="pq-row">{p.worlds.map((w) => card(w))}</div>
                {/* Sous CE palier : ce que signalent les « ! » de la rangée juste au-dessus. */}
                <PrerequisResume worlds={p.worlds} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Les défis-jeux propres à chaque formation. DIFFÉRENTS selon le rôle : le Constructeur
// (ordonner la recette) sur les formations « process », « Fais ta pizza » sur celles qui
// travaillent les paramètres — et il s'ouvre directement sur le style visé (obj). Un jeu
// « Bientôt » par formation garde la promesse sans mentir sur ce qui existe.
const GAME_SIM = (obj, sub) => ({ key: "simulateur", obj, ic: "flame", tint: "var(--orange)", label: "Fais ta pizza", sub });
const GAME_CONS = { key: "constructeur", ic: "pizza", tint: "var(--ember1)", label: "Le Constructeur", sub: "Ordonne la recette" };
const GAME_SOON = { key: null, ic: "clock", tint: "var(--dim)", label: "Chrono Rush", sub: "Bientôt", soon: true };
const GAMES_BY_ROLE = {
  decouverte: [GAME_CONS, GAME_SOON],
  niv1: [GAME_CONS, GAME_SIM("classique", "Réussis une classique"), GAME_SOON],
  niv1pro: [GAME_CONS, GAME_SOON],
  niv2: [GAME_SIM("contemporaine", "Réussis une contemporaine"), GAME_CONS, GAME_SOON],
  expert: [GAME_SIM(null, "Tous les styles"), GAME_CONS, GAME_SOON],
  spe: [GAME_SIM(null, "Réussis ta spécialité"), GAME_SOON],
  autre: [GAME_CONS, GAME_SOON],
};

// Les défis d'un monde, rendus sous le chemin de chapitres.
function WorldGames({ world, onGame }) {
  const games = GAMES_BY_ROLE[roleOf(world)] || [GAME_CONS];
  return (
    <>
      <div className="pq-games-t">Les défis de cette formation</div>
      <div className="pq-minis">
        {games.map((g, i) => g.soon ? (
          <div key={i} className="pq-mini soon">
            <span className="pq-mini-e" style={{ color: g.tint }}><Icon name={g.ic} size={24} /></span>
            <span className="pq-mini-txt"><b>{g.label}</b><span className="pq-mini-sub">{g.sub}</span></span>
          </div>
        ) : (
          <button key={i} className="pq-mini" onClick={() => onGame(g)}>
            <span className="pq-mini-e" style={{ color: g.tint }}><Icon name={g.ic} size={24} /></span>
            <span className="pq-mini-txt"><b>{g.label}</b><span className="pq-mini-sub">{g.sub}</span></span>
          </button>
        ))}
      </div>
    </>
  );
}

// Carte-formation (rectangle coloré façon schéma) → ouvre le monde.
function FCard({ w, prog, onPick }) {
  const done = prog ? Object.keys(prog).length : 0;
  const stars = prog ? Object.values(prog).reduce((a, s) => a + s, 0) : 0;
  const nbCh = chaptersFor(w).length;
  const ing = INGREDIENT[roleOf(w)];
  // Pastille « ! » dès que la formation a un prérequis, acquis ou non : elle SIGNALE, et le
  // détail se lit dans le récapitulatif placé sous le groupe où elle apparaît.
  const manque = w.prereqMissing || [];
  const tous = w.prereqAll || [];
  const infobulle = tous.length
    ? `Prérequis :\n${tous.map((p) => `${p.done ? "✓" : "✗"} ${p.code} — ${p.title}`).join("\n")}`
    : null;
  const raison = manque.length
    ? `À terminer d'abord : ${manque.map((m) => m.code).join(", ")}`
    : "Obtiens le badge de ce niveau pour le débloquer";
  return (
    <button
      className={"pq-fcard" + (w.unlocked ? "" : " locked")}
      style={w.unlocked ? { background: w.color } : undefined}
      disabled={!w.unlocked}
      onClick={() => onPick(w.code)}
      title={w.unlocked ? (infobulle || w.title) : raison}
    >
      {tous.length > 0 && (
        <span className="pq-prereq" title={infobulle || "Prérequis"} aria-label={infobulle || "Prérequis"}>!</span>
      )}
      <span className="pq-fcard-top">
        <span className="pq-fcard-code">{w.code}</span>
        <span className="pq-fcard-ing" aria-hidden="true">{w.unlocked ? ing : <Icon name="lock" size={16} />}</span>
      </span>
      <span className="pq-fcard-title">{w.title}</span>
      <span className="pq-fcard-meta">
        {!w.unlocked
          ? (manque.length ? `Après ${manque.map((m) => m.code).join(" + ")}` : "Non débloqué")
          : chaptersLoading(w) ? "…"
            : nbCh === 0 ? "Questions à venir"
              : `${done}/${nbCh} chapitres · ${stars} ⭐`}
      </span>
      {/* La progression ne se lisait qu'en toutes lettres (« 8/20 chapitres »). Une jauge la
          donne d'un coup d'œil — et c'est elle qui fait qu'on repère la formation à reprendre
          sans lire toute la carte. Affichée seulement quand il y a réellement des chapitres :
          une jauge vide sur une formation sans questions annoncerait un retard imaginaire. */}
      {w.unlocked && nbCh > 0 && (
        <span className="pq-fcard-jauge" aria-hidden="true">
          <span style={{ width: `${Math.round((done / nbCh) * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

// Vue d'un monde : chemin de chapitres façon Duolingo + les défis-jeux de la formation.
function WorldView({ world, prog, onBack, onChapter, onGame }) {
  const chapters = chaptersFor(world);
  const doneCount = Object.keys(prog).length;
  // Chapitre en cours = le premier non terminé. `-1` quand tout est fait.
  const courant = chapters.findIndex((_, i) => !(i in prog));

  /* Amener le chapitre à faire sous les yeux. Sur un parcours entamé, il est loin à droite
     et le stagiaire arrivait devant des chapitres déjà terminés, sans rien à y faire.
     On fait défiler LE CONTENEUR (et non `scrollIntoView`, qui déplacerait aussi la page
     verticalement) ; les positions sont mesurées à l'écran, donc indépendantes du parent
     positionné.
     À l'ouverture, le chemin part du DÉBUT et remonte le parcours jusqu'au chapitre en
     cours : on voit défiler ce qui est déjà acquis avant de s'arrêter là où il reste à
     faire. Ensuite, un chapitre terminé fait simplement avancer la carte d'un cran. */
  const pathRef = useRef(null);
  const nodeRef = useRef(null);
  const dejaPlace = useRef(false);
  const animRef = useRef(null); // fonction d'annulation de l'animation en cours

  /* Flèches de bord : elles disent qu'il RESTE du chemin de ce côté. Sans elles, un chemin
     coupé net au bord de l'écran se lit comme un chemin fini — surtout au milieu du
     parcours, où l'on ne voit ni le début ni la fin. Elles ne s'affichent que du côté où il
     y a effectivement à aller, et font défiler de deux chapitres au clic. */
  const [bords, setBords] = useState({ gauche: false, droite: false });
  const majBords = () => {
    const b = pathRef.current;
    if (!b) return;
    const marge = 4; // tolérance : les positions ne tombent pas au pixel près
    setBords({
      gauche: b.scrollLeft > marge,
      droite: b.scrollLeft + b.clientWidth < b.scrollWidth - marge,
    });
  };
  useEffect(() => {
    majBords();
    window.addEventListener("resize", majBords);
    return () => window.removeEventListener("resize", majBords);
  }, [world.code, chapters.length]);

  const glisser = (sens) => {
    const b = pathRef.current;
    if (!b) return;
    animRef.current?.();
    animRef.current = animerDefilement(b, b.scrollLeft + sens * ECART_X * 2, 350);
  };
  useEffect(() => { dejaPlace.current = false; }, [world.code]);
  useEffect(() => {
    const boite = pathRef.current, cible = nodeRef.current;
    if (!boite || !cible) return;
    const premier = !dejaPlace.current;
    dejaPlace.current = true;

    // Départ du début pour la première mise en place : c'est ce trajet qu'on donne à voir.
    if (premier) boite.scrollLeft = 0;

    // Un cran de rendu avant de mesurer : au premier passage, les libellés viennent d'être
    // posés et les positions ne sont pas encore définitives.
    const id = requestAnimationFrame(() => {
      const b = boite.getBoundingClientRect(), c = cible.getBoundingClientRect();
      const delta = (c.left + c.width / 2) - (b.left + b.width / 2);
      const arrivee = boite.scrollLeft + delta;
      if (Math.abs(delta) < 1) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        boite.scrollLeft = arrivee;
        return;
      }
      animRef.current = animerDefilement(boite, arrivee, premier ? 900 : 450);
    });
    return () => { cancelAnimationFrame(id); animRef.current?.(); };
  }, [world.code, courant, chapters.length]);

  return (
    <div className="pq-map">
      <button className="btn sm ghost" onClick={onBack} style={{ marginBottom: 12 }}><Icon name="chevron-left" size={15} /> Carte des formations</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="pq-world-dot" style={{ background: world.color }}>{world.code}</span>
        <b style={{ fontSize: 15 }}>{world.title}</b>
        {/* Classement défini par l'organisme — rappelé ici pour situer la formation dans
            son parcours, comme sur la carte. */}
        {[world.theme, world.tier].filter(Boolean).map((c) => (
          <span key={c.id} className="badge n" style={c.color ? { color: c.color } : undefined}>{c.name}</span>
        ))}
      </div>
      {/* Le parcours en toutes lettres : de quoi cette formation dépend, et où on en est.
          Sur la carte l'information tient dans une pastille ; ici elle a la place d'être lue. */}
      {(world.prereqAll || []).length > 0 && (
        <p className="pq-prereq-line">
          <span className="field-opt">Accessible après :</span>
          {world.prereqAll.map((p) => (
            <span key={p.code} className={"pq-prereq-chip" + (p.done ? " ok" : "")} title={p.title}>
              <Icon name={p.done ? "check" : "lock"} size={11} /> {p.code}
            </span>
          ))}
        </p>
      )}

      {/* Aucun chapitre : on le dit franchement plutôt que de servir des questions
          génériques. Les défis-jeux, eux, restent disponibles. */}
      {!chaptersLoading(world) && chapters.length === 0 && (
        <p className="hint" style={{ margin: "10px 0 16px" }}>
          <Icon name="clock" size={13} style={{ verticalAlign: "-2px" }} />{" "}
          Les questions de cette formation ne sont pas encore en ligne. Reviens plus tard —
          en attendant, les défis ci-dessous sont ouverts.
        </p>
      )}
      <div className="pq-path-wrap">
      {bords.gauche && (
        <button type="button" className="pq-nav g" onClick={() => glisser(-1)} aria-label="Chapitres précédents">
          <Icon name="chevron-left" size={18} />
        </button>
      )}
      {bords.droite && (
        <button type="button" className="pq-nav d" onClick={() => glisser(1)} aria-label="Chapitres suivants">
          <Icon name="chevron-right" size={18} />
        </button>
      )}
      <div className="pq-path" ref={pathRef} onScroll={majBords}>
        {chapters.map((ch, i) => {
          const stars = prog[i] || 0;
          const done = i in prog;
          // UN SEUL chapitre jouable : le premier non terminé. Les précédents sont acquis et
          // ne se rejouent pas (ni pour refaire les étoiles, ni au risque d'un cœur), les
          // suivants attendent leur tour.
          const encours = i === courant;
          // Un chapitre acquis SANS les 3 étoiles reste ouvert : il y a encore à y gagner.
          // Seul le sans-faute se ferme — le rejouer ne rapporterait rien et coûterait un
          // cœur en cas de faux pas.
          const parfait = done && stars >= 3;
          const partiel = done && !parfait;
          const verrou = !done && !encours;
          // Le zigzag se lit horizontalement : le décalage joue sur la hauteur.
          const offset = DECALAGES[i % 6];
          // Segment reliant le CENTRE de la pastille précédente au centre de celle-ci.
          // Les pastilles n'étant pas à la même hauteur, un trait horizontal ne joignait
          // rien : on calcule longueur et angle réels, et le trait passe SOUS les pastilles.
          // Le décalage vertical passe par `top` et non par `transform` : une transformation
          // créerait un contexte d'empilement, et le segment ne pourrait plus passer sous la
          // pastille de la case voisine — il lui barrerait la figure.
          const dy = offset - DECALAGES[(i - 1 + 6) % 6];
          // Cible du défilement : le chapitre en cours, ou le dernier quand tout est fait
          // — il n'y a alors plus rien « à faire », mais montrer la fin du parcours vaut
          // mieux que rester bloqué au début.
          const cible = i === (courant >= 0 ? courant : chapters.length - 1);
          const lien = {
            "--len": `${Math.hypot(ECART_X, dy).toFixed(1)}px`,
            "--ang": `${(Math.atan2(-dy, -ECART_X) * 180 / Math.PI).toFixed(2)}deg`,
          };
          const titre = parfait ? `${ch.title} — sans faute (3/3 ⭐)`
            : partiel ? `${ch.title} — ${stars}/3 ⭐, retente pour les 3`
              : encours ? ch.title
                : "Termine les chapitres précédents";
          return (
            <div key={i} className={"pq-node-wrap" + (i > 0 && (i - 1) in prog ? " lien-fait" : "")}
              ref={cible ? nodeRef : null}
              style={{ top: `${offset}px`, ...lien }}>
              <button className={"pq-node" + (parfait ? " done" : "") + (partiel ? " partiel" : "")
                + (verrou ? " locked" : "") + (encours ? " on" : "")}
                style={{ "--c": world.color }} disabled={parfait || verrou}
                onClick={() => onChapter(i, ch)} title={titre}>
                <Icon name={parfait ? "check" : verrou ? "lock" : ch.ic} size={18} />
              </button>
              <div className="pq-node-label">
                <b>{ch.title}</b>
                <span className="pq-stars">{[0, 1, 2].map((s) => <span key={s} style={{ opacity: s < stars ? 1 : 0.25 }}>⭐</span>)}</span>
              </div>
            </div>
          );
        })}
      </div>
      </div>
      <p className="hint" style={{ textAlign: "center", marginTop: 8 }}>{doneCount}/{chapters.length} chapitres terminés</p>
      <WorldGames world={world} onGame={onGame} />
    </div>
  );
}

// Mélange (Fisher-Yates) sans muter l'original.
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Mini-quiz d'un chapitre : une question à la fois, formats variés (QCM / vrai-faux /
// associations), feedback immédiat, cœurs, résultat étoilé.
function QuizModal({ world, data, onClose, onFinish, onRetry }) {
  const { chapter, questions } = data;
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);   // QCM : index ; Vrai/Faux : booléen
  const [matched, setMatched] = useState({});   // Associations : { gaucheIdx: true }
  const [selLeft, setSelLeft] = useState(null);  // Associations : gauche sélectionnée
  const [wrong, setWrong] = useState(null);      // Associations : droite en erreur (flash)
  const [correct, setCorrect] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [done, setDone] = useState(false);

  /** Remet le chapitre à zéro pour une nouvelle tentative (bouton « Recommencer »). */
  function recommencer() {
    setIdx(0); setPicked(null); setMatched({}); setSelLeft(null); setWrong(null);
    setCorrect(0); setHearts(3); setDone(false);
  }

  const q = questions[idx];
  const type = q.t || "qcm";
  // Colonne de droite mélangée (recalculée à chaque question).
  const rightCol = useMemo(() => (type === "assoc" ? shuffled(q.pairs.map((p, li) => ({ text: p[1], li }))) : []), [q, type]);
  /* Les banques écrivent la bonne réponse en premier (a: 0) — c'est lisible à la relecture,
     mais affiché tel quel, taper le 1er bouton donnait 100 % sans rien connaître : le quiz ne
     testait plus rien. On mélange donc à l'affichage, en gardant l'index d'origine pour la
     correction. useMemo : sinon les choix sauteraient entre le clic et l'affichage du résultat. */
  const choices = useMemo(() => (type === "qcm" ? shuffled((q.c || []).map((text, ci) => ({ text, ci }))) : []), [q, type]);
  const assocSolved = type === "assoc" && q.pairs && Object.keys(matched).length === q.pairs.length;
  const answered = type === "assoc" ? assocSolved : picked !== null;
  const total = questions.length;

  function choose(val) {
    if (answered) return;
    setPicked(val);
    if (val === q.a) setCorrect((c) => c + 1);
    else setHearts((h) => h - 1);
  }
  function tapRight(r) {
    if (selLeft === null || matched[r.li]) return;
    if (r.li === selLeft) {
      const nm = { ...matched, [selLeft]: true };
      setMatched(nm); setSelLeft(null);
      if (Object.keys(nm).length === q.pairs.length) setCorrect((c) => c + 1); // tout relié
    } else {
      setSelLeft(null); setWrong(r.li);
      setTimeout(() => setWrong(null), 400);
    }
  }
  function next() {
    if (hearts <= 0 || idx + 1 >= questions.length) { setDone(true); return; }
    setIdx((i) => i + 1); setPicked(null); setMatched({}); setSelLeft(null);
  }

  const ratio = correct / total;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.5 ? 1 : 0;
  const echoue = done && stars === 0; // moins de la moitié de bonnes réponses
  const good = type === "assoc" ? assocSolved : picked === q.a;

  const answerLabel = type === "vf" ? (q.a ? "Vrai" : "Faux") : type === "qcm" ? q.c[q.a] : "";

  return (
    <div className="overlay" onClick={() => onClose(!done)}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pq-world-dot" style={{ background: world.color, width: 24, height: 24, fontSize: 11 }}>{world.code}</span>
            {chapter.title}
          </h3>
          <button className="x" onClick={() => onClose(!done)} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        {!done ? (
          <div className="mbody">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div className="pq-progress"><span style={{ width: `${(idx / total) * 100}%`, background: world.color }} /></div>
              <span style={{ whiteSpace: "nowrap", fontSize: 14 }}>{"❤️".repeat(Math.max(0, hearts))}</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
              <span className={"pq-tag pq-tag-" + type}>{type === "vf" ? "Vrai / Faux" : type === "assoc" ? "Associe" : "QCM"}</span>
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>{idx + 1}. {q.q}</p>
            {/* Difficulté et XP, tels que l'organisme les a réglés. Affichés AVANT de
                répondre : savoir qu'une question pèse lourd fait relire l'énoncé. */}
            <p className="hint" style={{ margin: "0 0 14px", display: "flex", gap: 8, alignItems: "center" }}>
              {q.diff && (
                <span className="badge n" style={q.diff.color ? { color: q.diff.color } : undefined}>{q.diff.name}</span>
              )}
            </p>

            {type === "qcm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {choices.map(({ text, ci }) => {
                  let cls = "pq-choice";
                  if (answered) { if (ci === q.a) cls += " ok"; else if (ci === picked) cls += " ko"; }
                  return <button key={ci} className={cls} onClick={() => choose(ci)} disabled={answered}>{text}</button>;
                })}
              </div>
            )}

            {type === "vf" && (
              <div style={{ display: "flex", gap: 10 }}>
                {[true, false].map((val) => {
                  let cls = "pq-choice pq-vf";
                  if (answered) { if (val === q.a) cls += " ok"; else if (val === picked) cls += " ko"; }
                  return (
                    <button key={String(val)} className={cls} onClick={() => choose(val)} disabled={answered}>
                      <Icon name={val ? "check" : "x"} size={18} /> {val ? "Vrai" : "Faux"}
                    </button>
                  );
                })}
              </div>
            )}

            {type === "assoc" && (
              <>
                <div className="pq-assoc">
                  <div className="pq-assoc-col">
                    {q.pairs.map((p, li) => (
                      <button key={li} disabled={!!matched[li]}
                        className={"pq-assoc-item" + (matched[li] ? " ok" : "") + (selLeft === li ? " sel" : "")}
                        onClick={() => setSelLeft(li)}>{p[0]}</button>
                    ))}
                  </div>
                  <div className="pq-assoc-col">
                    {rightCol.map((r) => (
                      <button key={r.li} disabled={!!matched[r.li]}
                        className={"pq-assoc-item" + (matched[r.li] ? " ok" : "") + (wrong === r.li ? " ko" : "")}
                        onClick={() => tapRight(r)}>{r.text}</button>
                    ))}
                  </div>
                </div>
                {!assocSolved && <p className="hint" style={{ margin: "10px 0 0" }}>Touche un élément à gauche, puis sa correspondance à droite.</p>}
              </>
            )}

            {answered && (
              <div className="pq-after">
                <div className="pq-after-h">
                  <span className={"pq-verdict " + (good ? "ok" : "ko")}>
                    <Icon name={good ? "check-circle" : "x-circle"} size={16} />
                    {good ? "Bravo !" : `Réponse : ${answerLabel}`}
                  </span>
                  <button className="btn primary" onClick={next}>{idx + 1 >= total ? "Terminer" : "Suivant"} <Icon name="chevron-right" size={15} /></button>
                </div>
                {/* Le POURQUOI. Sans lui, le stagiaire retient la bonne case et pas la raison —
                    et une bonne case oubliée ne se retrouve pas. `src` cite la page du manuel
                    pour qu'il puisse y retourner. Les questions sans `expl` s'affichent comme
                    avant : le champ est facultatif, on enrichit banque par banque. */}
                {q.expl && (
                  <p className="pq-expl">
                    <Icon name="book-open" size={13} />
                    <span>{q.expl}{q.src ? <em> — {q.src}</em> : null}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mbody" style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>{stars > 0 ? "🍕" : "💪"}</div>
            <div style={{ fontSize: 26, letterSpacing: 4, marginBottom: 8 }}>{[0, 1, 2].map((s) => <span key={s} style={{ opacity: s < stars ? 1 : 0.25 }}>⭐</span>)}</div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{correct}/{total} bonnes réponses</p>
            <p className="hint" style={{ marginTop: 0 }}>
              {stars >= 2 ? "Excellent, prêt pour le QCM !"
                : stars === 1 ? "Bien — retente pour 3 étoiles."
                  : "Il faut au moins une étoile (la moitié de bonnes réponses) pour valider le chapitre. Reprends-le dans le manuel et réessaie."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button className="btn ghost" onClick={() => onClose(false)}>Fermer</button>
              {/* Échec (aucune étoile) : rien à valider, le chapitre n'est pas acquis. On
                  propose de le refaire plutôt qu'un « Valider » qui l'enregistrerait à 0 et
                  ouvrirait le suivant. Le bouton est barré s'il ne reste plus de cœur. */}
              {echoue ? (
                /* Relancer ne coûte rien : l'échec qui précède a déjà pris son cœur. Ce qui
                   ration la boucle, c'est que chaque tentative ratée en coûte un — pas le
                   fait d'appuyer sur le bouton. */
                <button className="btn primary"
                  onClick={() => { onRetry?.(); recommencer(); }}>
                  <Icon name="refresh" size={14} /> Recommencer
                </button>
              ) : (
                <button className="btn primary" onClick={() => onFinish(stars)}>
                  <Icon name="check" size={15} /> Valider
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PizzaQuest;
