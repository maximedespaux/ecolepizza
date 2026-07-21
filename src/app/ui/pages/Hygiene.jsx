import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import { Icon } from "../components/Icon.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import HygieneArt from "../components/HygieneArt.jsx";
import { GROUPS, registersOfGroup, tileBadge, fmtDate } from "../lib/hygiene.js";
import { loadHygieneExamples } from "../lib/hygieneDemo.js";
import { getHygieneSummary } from "../api/apiClient.js";

/**
 * Hub « Maîtrise sanitaire (HACCP) ». Reprend le tableau de bord des logiciels du métier
 * (e-pack, Kooklin) : trois colonnes colorées (Traçabilité / Températures / Hygiène & audits),
 * et sur chaque tuile un badge « système d'attente » qui dit d'un coup d'œil quoi faire, combien,
 * et avant quand — au lieu d'une simple liste. Répond au besoin AKTO « logiciel métier ».
 */
export default function Hygiene() {
  const [sum, setSum] = useState(null);
  const [migration, setMigration] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const now = new Date();

  const reload = () =>
    getHygieneSummary()
      .then((r) => { setSum(r.data); setMigration(!!r.migration); })
      .catch(() => setSum({ byRegister: {}, dueSoon: 0, openNonConf: 0 }));
  useEffect(() => { reload(); }, []);

  const by = sum?.byRegister || {};
  const dueSoon = sum?.dueSoon || 0;
  const openNc = sum?.openNonConf || 0;
  const hasData = Object.values(by).some((s) => (s?.n || 0) > 0);

  async function loadExamples() {
    setDemoBusy(true); setStatus(null);
    try {
      const r = await loadHygieneExamples();
      await reload();
      setStatus({ type: "success", message: `Exemples chargés : ${r.entries} entrées sur ${r.equipment} équipements. Ouvrez un module pour voir.` });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally { setDemoBusy(false); }
  }

  // Total « à faire » (registres planifiés en attente) pour le bandeau du haut.
  const totalPending = ["TEMPERATURE", "CLEANING"].reduce((n, r) => n + (by[r]?.pending || 0), 0);

  return (
    <div>
      <PageHead
        eyebrow="Maîtrise sanitaire · HACCP"
        title="Bonjour 👋"
        lead="Votre plan de maîtrise sanitaire, sur le téléphone. Ce qui reste à faire aujourd'hui apparaît en couleur sur chaque module."
        actions={
          <>
            <Link to="/hygiene/reglages" className="btn sm ghost">
              <Icon name="settings" size={15} /> Paramétrage
            </Link>
            <Link to="/hygiene/historique" className="btn sm">
              <Icon name="history" size={15} /> Historique complet
            </Link>
          </>
        }
      />

      {migration && (
        <div className="status" style={{ background: "var(--amber-bg)", color: "var(--text)" }}>
          Les registres seront actifs dès la mise à jour de la base (migration 103). Vous pouvez déjà les parcourir.
        </div>
      )}

      <StatusMessage status={status} />

      {/* Onboarding illustré : comment ça marche + charger des exemples. */}
      {!migration && !hasData && (
        <div className="hs-onboard">
          <div className="hs-onboard-head">
            <b>Première visite ? Voici le principe.</b>
            <span>Trois étapes, puis la saisie du quotidien tient en quelques taps.</span>
          </div>
          <div className="hs-steps">
            <div className="hs-step accent-blue">
              <HygieneArt name="setup" />
              <b>1 · Paramétrez</b>
              <span>Vos frigos, fournisseurs et produits — une seule fois.</span>
            </div>
            <div className="hs-step accent-green">
              <HygieneArt name="tap" />
              <b>2 · Enregistrez d'un tap</b>
              <span>Tournée de températures, checklist de nettoyage, étiquettes…</span>
            </div>
            <div className="hs-step accent-gold">
              <HygieneArt name="proof" />
              <b>3 · Prouvez</b>
              <span>Historique daté, non-conformités suivies, étiquettes réimprimables.</span>
            </div>
          </div>
          <div className="hs-onboard-actions">
            <button className="btn primary" onClick={loadExamples} disabled={demoBusy}>
              <Icon name={demoBusy ? "refresh" : "download"} size={16} /> {demoBusy ? "Chargement…" : "Charger des exemples"}
            </button>
            <Link to="/hygiene/reglages" className="btn ghost">
              <Icon name="settings" size={16} /> Paramétrer maintenant
            </Link>
          </div>
        </div>
      )}

      {/* Bandeau récapitulatif : à faire / retard / non-conformités */}
      {(totalPending > 0 || dueSoon > 0 || openNc > 0) && (
        <div className="hs-alerts">
          {totalPending > 0 && (
            <div className="hs-alert wait">
              <Icon name="clock" size={18} />
              <span><b>{totalPending}</b> {totalPending > 1 ? "contrôles à faire" : "contrôle à faire"} aujourd'hui</span>
            </div>
          )}
          {dueSoon > 0 && (
            <Link to="/hygiene/historique?filtre=dlc" className="hs-alert warn">
              <Icon name="clock" size={18} />
              <span><b>{dueSoon}</b> {dueSoon > 1 ? "DLC proches" : "DLC proche"} (sous 3 jours)</span>
              <Icon name="chevron-right" size={16} />
            </Link>
          )}
          {openNc > 0 && (
            <Link to="/hygiene/non-conformites" className="hs-alert bad">
              <Icon name="alert-triangle" size={18} />
              <span><b>{openNc}</b> {openNc > 1 ? "non-conformités ouvertes" : "non-conformité ouverte"}</span>
              <Icon name="chevron-right" size={16} />
            </Link>
          )}
        </div>
      )}

      {/* Trois colonnes façon logiciel HACCP */}
      <div className="hs-cols">
        {GROUPS.map((g) => (
          <section key={g.key} className={`hs-col accent-${g.accent}`}>
            <h2 className="hs-col-head">{g.label}</h2>
            <div className="hs-col-tiles">
              {registersOfGroup(g.key).map((r) => {
                const badge = tileBadge(r, by[r.register], sum || {}, now);
                return (
                  <Link key={r.key} to={`/hygiene/${r.key}`} className={`hs-mod accent-${r.accent}`}>
                    <span className="hs-mod-ic"><Icon name={r.icon} size={20} /></span>
                    <span className="hs-mod-t">{r.title}</span>
                    <span className={`hs-chip ${badge.tone}`}>
                      {badge.top && <span className="hs-chip-top">{badge.top}</span>}
                      {badge.check
                        ? <Icon name="check" size={15} />
                        : <span className="hs-chip-n">{badge.count ?? 0}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Link to="/hygiene/historique" className="hs-foot-link">
        <Icon name="shield" size={20} />
        <div>
          <b>Preuve de conformité.</b> Chaque action est datée et conservée. En cas de contrôle sanitaire,
          l'historique complet est consultable en un tap et les étiquettes sont réimprimables.
        </div>
        <Icon name="chevron-right" size={18} />
      </Link>
    </div>
  );
}
