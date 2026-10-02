import { useEffect, useState } from "react";
import { getStatistiquesConnexions } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";

/**
 * STATISTIQUES DE CONNEXION (Qualité & conformité) — qui se connecte, et quand.
 *
 * DEUX VUES, stagiaires (orange) et équipe (bleu) séparés :
 *  · la RÉPARTITION PAR RÉCENCE (depuis la dernière connexion de chaque compte, `user.last_login_at`) ;
 *  · les CONNEXIONS PAR JOUR sur deux semaines (`connexion_jour`, migration 200). Sans la table,
 *    `par_jour` est null : on affiche la récence, et on dit que la courbe se remplira au déploiement.
 *
 * Il N'Y A PAS d'historique des connexions : `last_login_at` ne garde que la dernière. La courbe se
 * construit à partir de la 200, jour après jour — d'où une fenêtre de deux semaines, voulue par l'école.
 */
const COUL = { stagiaires: "var(--orange)", equipe: "var(--blue)" };

function Synthese({ titre, couleur, v }) {
  const pct = v.total ? Math.round((v.connectes30 / v.total) * 100) : 0;
  return (
    <div className="stat-synth">
      <div className="stat-synth-t"><span className="stat-pastille" style={{ background: couleur }} /> {titre}</div>
      <div className="stat-chiffres">
        <div><b>{v.total}</b><span>compte{v.total > 1 ? "s" : ""}</span></div>
        <div><b>{v.connectes30}</b><span>connectés sur 30 j{v.total ? ` · ${pct} %` : ""}</span></div>
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

/* Connexions par jour : colonnes empilées (stagiaires sous équipe), une par jour de la fenêtre. */
function CourbeJours({ parJour }) {
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
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Connexions par jour (deux semaines)" style={{ width: "100%", height: "auto" }}>
        <text x={padL - 6} y={padT + 9} textAnchor="end" fontSize="11" fill="var(--muted)">{max}</text>
        <line x1={padL} y1={H - padB} x2={W} y2={H - padB} stroke="var(--border-soft)" />
        {parJour.map((d, i) => {
          const x = padL + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const hS = hFor(d.stagiaires), hE = hFor(d.equipe);
          const yS = H - padB - hS;
          return (
            <g key={d.jour}>
              <title>{`${d.jour} : ${d.stagiaires} stagiaire(s), ${d.equipe} équipe`}</title>
              <rect x={x} y={yS} width={w} height={hS} fill={COUL.stagiaires} rx="1.5" />
              <rect x={x} y={yS - hE} width={w} height={hE} fill={COUL.equipe} rx="1.5" />
              <text x={x + w / 2} y={H - padB + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">{jj(d.jour)}</text>
            </g>
          );
        })}
      </svg>
      <p className="hint" style={{ margin: "4px 0 0" }}>Du {parJour[0].jour.slice(8)}/{parJour[0].jour.slice(5, 7)} au {parJour[n - 1].jour.slice(8)}/{parJour[n - 1].jour.slice(5, 7)} — nombre de comptes qui se sont connectés chaque jour.</p>
    </>
  );
}

export default function Statistiques() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getStatistiquesConnexions().then((r) => setD(r.data)).catch((e) => setErr(e.message || "Erreur de chargement."));
  }, []);

  return (
    <>
      <PageHead eyebrow="Qualité & conformité" title="Statistiques"
        lead="Qui se connecte, et quand : la récence de la dernière connexion de chaque compte, et les connexions des deux dernières semaines." />

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

          <Card title={<span className="card-ttl">Depuis la dernière connexion</span>} style={{ marginTop: 14 }}>
            <Legende />
            <Recence d={d} />
          </Card>

          <Card title={<span className="card-ttl">Connexions des {d.fenetre} derniers jours</span>} style={{ marginTop: 14 }}>
            <Legende />
            <CourbeJours parJour={d.par_jour} />
          </Card>
        </>
      )}
    </>
  );
}
