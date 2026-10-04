import { useEffect, useRef, useState } from "react";
import { getStatistiquesConnexions } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";

/**
 * STATISTIQUES DE CONNEXION (Qualité & conformité) — qui se connecte, et quand.
 *
 * DEUX VUES, stagiaires (orange) et équipe (bleu) séparés :
 *  · les CONNEXIONS PAR JOUR sur une fenêtre réglable (7 / 14 / 30 j, `connexion_jour`, migration
 *    200) : colonnes empilées, DÉTAIL PAR FORMATION au survol d'un jour (« NIV1 : 1, NIV2 : 4 »),
 *    un résumé des personnes distinctes, et les plus assidus. Sans la table, la courbe se remplira
 *    au déploiement ;
 *  · la RÉPARTITION PAR RÉCENCE (depuis la dernière connexion, `user.last_login_at`), AVEC les noms
 *    des stagiaires à relancer (jamais connectés, plus de 30 jours) — placée SOUS la courbe.
 *
 * Il N'Y A PAS d'historique des connexions : `last_login_at` ne garde que la dernière. La courbe se
 * construit à partir de la 200, jour après jour.
 */
const COUL = { stagiaires: "var(--orange)", equipe: "var(--blue)" };
const JOURS_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

// Couleurs des FORMATIONS (barre et badges) — distinctes, lisibles en clair comme en sombre. La
// première (orange) rejoint la couleur « stagiaire » du reste de la page. « Sans formation » : gris.
const PALETTE = ["#ff6900", "#0ea5a4", "#7c5cfc", "#e8a600", "#db2777", "#16a34a", "#0284c7", "#dc2626", "#92682e", "#4f46e5"];
const COUL_AUTRE = "#9aa0b5";

// Associe une couleur stable à chaque formation, dans l'ordre global rendu par le serveur (`cles`).
function couleursFormations(cles) {
  const m = new Map();
  (cles || []).forEach((c, i) => m.set(c.key, c.key === "__autre" ? COUL_AUTRE : PALETTE[i % PALETTE.length]));
  return (key) => m.get(key) || COUL_AUTRE;
}
// Teinte d'un hexa (#rrggbb) avec une opacité — pour le fond des badges.
const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
// Un compte PONDÉRÉ : entier tel quel, sinon une décimale à la française (« 2,5 »).
const fmtN = (n) => { const r = Math.round(Number(n) * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ","); };

// « mer. 03/10 » — date LOCALE reconstruite depuis l'ISO, pour ne pas décaler d'un fuseau.
function labelJour(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS_FR[dt.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/* Légende de la courbe : une pastille par FORMATION (sa couleur), puis l'équipe. */
function LegendeFormations({ cles, couleur }) {
  return (
    <div className="stat-legende">
      {(cles || []).map((c) => (
        <span key={c.key}><span className="stat-pastille" style={{ background: couleur(c.key) }} /> {c.label}</span>
      ))}
      <span><span className="stat-pastille" style={{ background: COUL.equipe }} /> Équipe</span>
    </div>
  );
}

function Synthese({ titre, couleur, v }) {
  const pct = v.total ? Math.round((v.connectes30 / v.total) * 100) : 0;
  return (
    <div className="stat-synth">
      <div className="stat-synth-t"><span className="stat-pastille" style={{ background: couleur }} /> {titre}</div>
      <div className="stat-chiffres">
        <div><b>{v.total}</b><span>compte{v.total > 1 ? "s" : ""}</span></div>
        <div><b>{v.connectes30}</b><span>connectés sur 30 j{v.total ? ` · ${pct} %` : ""}</span></div>
        <div><b>{v.jamais}</b><span>jamais connecté{v.jamais > 1 ? "s" : ""}</span></div>
      </div>
    </div>
  );
}

function Legende() {
  return (
    <div className="stat-legende">
      <span><span className="stat-pastille" style={{ background: COUL.stagiaires }} /> Stagiaires</span>
      <span><span className="stat-pastille" style={{ background: COUL.equipe }} /> Équipe</span>
    </div>
  );
}

/* Récence : une barre par tranche et par groupe, à l'échelle du plus grand compte (barres CSS). */
function Recence({ d }) {
  const max = Math.max(1, ...d.tranches.flatMap((t) => [d.stagiaires.recence[t.cle], d.equipe.recence[t.cle]]));
  const Barre = ({ n, couleur }) => (
    <div className="stat-barre" title={`${n}`}>
      <div className="stat-barre-fill" style={{ width: `${(n / max) * 100}%`, background: couleur }} />
      <span className="stat-barre-n">{n}</span>
    </div>
  );
  return (
    <div className="stat-recence">
      {d.tranches.map((t) => (
        <div className="stat-recence-ligne" key={t.cle}>
          <div className="stat-recence-lbl">{t.libelle}</div>
          <div className="stat-recence-barres">
            <Barre n={d.stagiaires.recence[t.cle]} couleur={COUL.stagiaires} />
            <Barre n={d.equipe.recence[t.cle]} couleur={COUL.equipe} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Les stagiaires à relancer : les noms derrière « jamais connecté » et « plus de 30 jours ». */
function Relancer({ r }) {
  if (!r || (!r.jamais.length && !r.anciens.length)) return null;
  const Bloc = ({ titre, noms }) => noms.length > 0 && (
    <details className="stat-relancer">
      <summary>{titre} ({noms.length})</summary>
      <div className="stat-relancer-noms">{noms.join(" · ")}</div>
    </details>
  );
  return (
    <div className="stat-relancer-wrap">
      <div className="stat-relancer-t">Stagiaires à relancer</div>
      <Bloc titre="Jamais connectés" noms={r.jamais} />
      <Bloc titre="Sans connexion depuis plus de 30 jours" noms={r.anciens} />
    </div>
  );
}

/* Résumé de la fenêtre : personnes DIFFÉRENTES connectées + jour le plus actif. */
function Resume({ parJour, resume }) {
  if (!resume || !parJour) return null;
  if (!resume.uniques_stagiaires && !resume.uniques_equipe) return null;
  const busy = parJour.reduce((a, j) => { const t = j.stagiaires + j.equipe; return t > a.t ? { jour: j.jour, t } : a; }, { t: 0 });
  const s = resume.uniques_stagiaires, e = resume.uniques_equipe;
  return (
    <p className="stat-resume">
      <b>{s}</b> stagiaire{s > 1 ? "s" : ""} et <b>{e}</b> membre{e > 1 ? "s" : ""} de l'équipe se sont connectés (comptes différents).
      {busy.t > 0 && <> Jour le plus actif : <b>{labelJour(busy.jour)}</b> ({busy.t}).</>}
    </p>
  );
}

/* Les plus assidus : qui s'est connecté le plus de jours sur la fenêtre. */
function Assidus({ assidus }) {
  if (!assidus || !assidus.length) return null;
  return (
    <div className="stat-assidus">
      <div className="stat-assidus-t">Les plus assidus</div>
      <ol className="stat-assidus-l">
        {assidus.map((a, i) => (
          <li key={i}>
            <span className="stat-pastille" style={{ background: a.stagiaire ? COUL.stagiaires : COUL.equipe }} />
            <span className="stat-assidus-nom">{a.nom}</span>
            <span className="stat-assidus-j">{a.jours} jour{a.jours > 1 ? "s" : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* Sélecteur de fenêtre : 7 / 14 / 30 jours. */
function Fenetre({ valeur, options, onChange }) {
  return (
    <div className="stat-fenetre" role="group" aria-label="Fenêtre d'affichage">
      {options.map((o) => (
        <button key={o} type="button" className={o === valeur ? "actif" : ""} aria-pressed={o === valeur} onClick={() => onChange(o)}>{o} j</button>
      ))}
    </div>
  );
}

/* Connexions par jour : colonnes empilées — part stagiaire colorée PAR FORMATION, équipe au-dessus ;
   détail par formation au survol. Un stagiaire multi-formations est réparti (50/50 pour NIV1+NIV2). */
function CourbeJours({ parJour, couleur }) {
  const [tip, setTip] = useState(null); // { i, left, top } — position du survol, relative au cadre
  const wrapRef = useRef(null);
  if (!parJour) {
    return <p className="hint">La courbe des connexions se remplira à partir du déploiement — une fois la migration 200 jouée, chaque connexion est comptée pour le jour même.</p>;
  }
  const total = parJour.reduce((s, j) => s + j.stagiaires + j.equipe, 0);
  if (!total) {
    return <p className="hint">Aucune connexion sur les {parJour.length} derniers jours pour l'instant.</p>;
  }
  const W = 720, H = 210, padB = 22, padL = 26, padT = 10;
  const n = parJour.length;
  const max = Math.max(1, ...parJour.map((d) => d.stagiaires + d.equipe));
  const bw = (W - padL) / n;
  const hFor = (v) => (v / max) * (H - padB - padT);
  const jj = (iso) => iso.slice(8, 10);
  const montrer = (i, pt) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || !pt) return;
    const left = Math.min(Math.max(pt.clientX - r.left, 80), r.width - 80);
    setTip({ i, left, top: pt.clientY - r.top });
  };
  const j = tip ? parJour[tip.i] : null;
  return (
    <div className="stat-chart" ref={wrapRef} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Connexions par jour" style={{ width: "100%", height: "auto" }}>
        <text x={padL - 6} y={padT + 9} textAnchor="end" fontSize="11" fill="var(--muted)">{max}</text>
        <line x1={padL} y1={H - padB} x2={W} y2={H - padB} stroke="var(--border-soft)" />
        {parJour.map((d, i) => {
          const x = padL + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const hE = hFor(d.equipe);
          // Part stagiaire : un segment par formation, empilé depuis la base, à la couleur de la formation.
          let yb = H - padB;
          const segs = (d.formations || []).map((f) => {
            const h = hFor(f.n); const y = yb - h; yb = y;
            return h > 0 ? <rect key={f.key} x={x} y={y} width={w} height={h} fill={couleur(f.key)} /> : null;
          });
          return (
            <g key={d.jour} style={{ cursor: "pointer" }}
              onMouseMove={(e) => montrer(i, e)} onTouchStart={(e) => montrer(i, e.touches[0])}>
              <title>{`${labelJour(d.jour)} : ${d.stagiaires} stagiaire(s), ${d.equipe} équipe`}</title>
              {/* Zone de survol = toute la colonne, pour attraper le pointeur au-dessus des barres. */}
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
              {segs}
              {hE > 0 && <rect x={x} y={yb - hE} width={w} height={hE} fill={COUL.equipe} />}
              <text x={x + w / 2} y={H - padB + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">{jj(d.jour)}</text>
            </g>
          );
        })}
      </svg>
      {j && (
        <div className="stat-tip" style={{ left: tip.left, top: tip.top }}>
          <div className="stat-tip-d">{labelJour(j.jour)}</div>
          {(j.stagiaires || j.equipe) ? (
            <>
              {j.stagiaires > 0 && <div className="stat-tip-l">Stagiaires : <b>{j.stagiaires}</b></div>}
              {j.formations && j.formations.length > 0 && (
                <div className="stat-badges">
                  {j.formations.map((f) => (
                    <span className="stat-badge" key={f.key} style={{ background: hexA(couleur(f.key), 0.16), color: couleur(f.key) }}>{f.label} : {fmtN(f.n)}</span>
                  ))}
                </div>
              )}
              {j.equipe > 0 && (
                <div className="stat-tip-l"><span className="stat-pastille" style={{ background: COUL.equipe }} /> Équipe : <b>{j.equipe}</b></div>
              )}
            </>
          ) : <div className="stat-tip-l muted">Aucune connexion</div>}
        </div>
      )}
      <p className="hint" style={{ margin: "4px 0 0" }}>Du {parJour[0].jour.slice(8)}/{parJour[0].jour.slice(5, 7)} au {parJour[n - 1].jour.slice(8)}/{parJour[n - 1].jour.slice(5, 7)} — survolez un jour pour le détail par formation.</p>
    </div>
  );
}

export default function Statistiques() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [fenetre, setFenetre] = useState(14);

  useEffect(() => {
    let vivant = true;
    getStatistiquesConnexions(fenetre)
      .then((r) => { if (vivant) { setD(r.data); setErr(null); } })
      .catch((e) => { if (vivant) setErr(e.message || "Erreur de chargement."); });
    return () => { vivant = false; };
  }, [fenetre]);

  const couleur = couleursFormations(d && d.formations_cle);

  return (
    <>
      <PageHead eyebrow="Qualité & conformité" title="Statistiques"
        lead="Qui se connecte, et quand : les connexions des dernières semaines (détail par formation au survol), puis la récence de la dernière connexion de chaque compte." />

      {err && <Card><p style={{ color: "var(--ember1)", margin: 0 }}>{err}</p></Card>}
      {!d && !err && <Card><p className="hint" style={{ margin: 0 }}>Chargement…</p></Card>}

      {d && (
        <>
          <Card title="Synthèse">
            <div className="stat-synth-grille">
              <Synthese titre="Stagiaires" couleur={COUL.stagiaires} v={d.stagiaires} />
              <Synthese titre="Équipe" couleur={COUL.equipe} v={d.equipe} />
            </div>
          </Card>

          <Card title={<span className="card-ttl">Connexions des {fenetre} derniers jours</span>} style={{ marginTop: 14 }}>
            <div className="stat-head">
              <LegendeFormations cles={d.formations_cle} couleur={couleur} />
              <Fenetre valeur={fenetre} options={d.fenetres || [7, 14, 30]} onChange={setFenetre} />
            </div>
            <Resume parJour={d.par_jour} resume={d.resume} />
            <CourbeJours parJour={d.par_jour} couleur={couleur} />
            <Assidus assidus={d.assidus} />
          </Card>

          <Card title={<span className="card-ttl">Depuis la dernière connexion</span>} style={{ marginTop: 14 }}>
            <Legende />
            <Recence d={d} />
            <Relancer r={d.stagiaires.relancer} />
          </Card>
        </>
      )}
    </>
  );
}
