import { useState } from "react";
import { Icon } from "./Icon.jsx";
import {
  TYPES_PIZZA, ENERGIES, PETRINS,
  energiesPour, petrinsPour, tempRequise, kgPateDepuisPizzas,
} from "../lib/materiel.js";

/**
 * Aide au choix du gros matériel — fours et pétrins.
 *
 * Ce n'est PAS une fiche produit : c'est le conseil de l'école, tiré des manuels
 * (cf. lib/materiel.js). Le principe tient en une règle : on ne masque jamais une option, on
 * explique pourquoi elle ne convient pas. Un stagiaire qui lit « le convoyeur monte à 350 °C,
 * il t'en faut 400 » apprend quelque chose ; un menu qui aurait juste caché le convoyeur, non.
 */

/* Détail repliable d'une option : les « pour » (ce que ça t'apporte) et les « contraintes »
   (ce que le vendeur ne dira pas). Les contraintes sont le vrai contenu — le ramonage 2×/an
   d'un four à bois, le triphasé d'un gros pétrin. */
function Detail({ pour, contraintes, ouvert, onToggle }) {
  if (!pour?.length && !contraintes?.length) return null;
  return (
    <div className="cm-detail">
      <button className="cm-detail-t" onClick={onToggle} aria-expanded={ouvert}>
        <Icon name={ouvert ? "chevron-down" : "chevron-right"} size={13} />
        {ouvert ? "Masquer" : "Ce que ça implique"}
      </button>
      {ouvert ? (
        <div className="cm-detail-b">
          {pour?.length ? (
            <ul className="cm-pts cm-pour">
              {pour.map((t, i) => <li key={i}><Icon name="check" size={12} /> {t}</li>)}
            </ul>
          ) : null}
          {contraintes?.length ? (
            <ul className="cm-pts cm-contr">
              {contraintes.map((t, i) => <li key={i}><Icon name="info" size={12} /> {t}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── FOURS ─────────────────────────────────────────────────────────────────────────────── */
function FourConseil() {
  const [types, setTypes] = useState([]);
  const [avpn, setAvpn] = useState(false);
  const [ouvert, setOuvert] = useState(null); // id de l'énergie dépliée

  const toggle = (id) => setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const veutNapo = types.includes("napolitaine");
  const need = tempRequise(types, avpn && veutNapo);
  const energies = energiesPour(types, avpn && veutNapo);
  const possibles = energies.filter((e) => e.possible).length;

  return (
    <>
      <div className="cm-step">
        <p className="cm-q"><b>1.</b> Qu'est-ce que tu veux cuire ? <span className="cm-multi">plusieurs choix possibles</span></p>
        <div className="cm-chips">
          {TYPES_PIZZA.map((t) => (
            <button key={t.id} className={"cm-chip" + (types.includes(t.id) ? " on" : "")}
              onClick={() => toggle(t.id)} title={t.aide}>
              {t.label}
              <span className="cm-chip-t">{t.tmin === t.tmax ? `${t.tmin} °C` : `${t.tmin}–${t.tmax} °C`}</span>
            </button>
          ))}
        </div>
        {veutNapo ? (
          <label className="cm-avpn">
            <input type="checkbox" checked={avpn} onChange={(e) => setAvpn(e.target.checked)} />
            <span>Je vise la certification <b>AVPN</b> (napolitaine verace)</span>
          </label>
        ) : null}
      </div>

      {need != null ? (
        <div className="cm-verdict">
          <Icon name="thermometer" size={18} />
          <span>Il te faut un four qui monte à <b>{need} °C</b> minimum
            {avpn && veutNapo ? <>, <span className="cm-avpn-note">une napolitaine AVPN se cuit entre 400 et 485 °C</span></> : null}.
            <span className="cm-count"> {possibles} énergie{possibles > 1 ? "s" : ""} sur {energies.length} conviennent.</span>
          </span>
        </div>
      ) : (
        <p className="hint cm-vide">Choisis au moins un type de pizza, je te dis quelle énergie tient la route.</p>
      )}

      {need != null ? (
        <div className="cm-opts">
          {energies.map((e) => (
            <div key={e.id} className={"cm-opt" + (e.possible ? "" : " off")}>
              <div className="cm-opt-h">
                <b>{e.label}</b>
                <span className={"cm-temp" + (e.possible ? "" : " ko")}>{e.tmax} °C</span>
                {e.possible
                  ? <span className="badge g"><Icon name="check-circle" size={12} /> convient</span>
                  : <span className="badge n"><Icon name="x-circle" size={12} /> non</span>}
              </div>
              <p className="cm-resume">{e.possible ? e.resume : e.pourquoi_pas}</p>
              {e.possible ? (
                <Detail pour={e.pour} contraintes={e.contraintes}
                  ouvert={ouvert === e.id} onToggle={() => setOuvert(ouvert === e.id ? null : e.id)} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ── PÉTRINS ───────────────────────────────────────────────────────────────────────────── */
const PRESETS_KG = [10, 25, 50, 80];

function PetrinConseil() {
  const [kg, setKg] = useState(25);
  const [ouvert, setOuvert] = useState(null);

  const petrins = petrinsPour(kg);
  const possibles = petrins.filter((p) => p.possible).length;
  const pizzas = kg > 0 ? Math.round((kg * 1000) / 280) : 0;

  return (
    <>
      <div className="cm-step">
        <p className="cm-q"><b>1.</b> Quelle quantité de pâte tu prépares en une fois ?</p>
        <div className="cm-kg">
          <div className="cm-kg-in">
            <input type="number" min="0" max="300" value={kg}
              onChange={(e) => setKg(Math.max(0, Math.min(300, Number(e.target.value) || 0)))} />
            <span>kg</span>
          </div>
          <span className="cm-kg-eq">{pizzas > 0 ? `≈ ${pizzas} pâtons de 280 g` : " "}</span>
        </div>
        <div className="cm-chips">
          {PRESETS_KG.map((v) => (
            <button key={v} className={"cm-chip" + (kg === v ? " on" : "")} onClick={() => setKg(v)}>
              {v} kg
            </button>
          ))}
        </div>
      </div>

      {kg > 0 ? (
        <div className="cm-verdict">
          <Icon name="sliders" size={18} />
          <span>Pour <b>{kg} kg</b> de pâte,
            <span className="cm-count"> {possibles} famille{possibles > 1 ? "s" : ""} sur 3 conviennent.</span>
            {" "}Le choix ne se joue pas que sur le volume, chacune fait une pâte différente.
          </span>
        </div>
      ) : (
        <p className="hint cm-vide">Indique une quantité, je te dis quelle famille de pétrin tient ce volume.</p>
      )}

      {kg > 0 ? (
        <div className="cm-opts">
          {petrins.map((p) => (
            <div key={p.id} className={"cm-opt" + (p.possible ? "" : " off")}>
              <div className="cm-opt-h">
                <b>{p.label}</b>
                <span className={"cm-temp" + (p.possible ? "" : " ko")}>{p.kg_min}–{p.kg_max} kg</span>
                {p.possible
                  ? <span className="badge g"><Icon name="check-circle" size={12} /> convient</span>
                  : <span className="badge n"><Icon name="x-circle" size={12} /> non</span>}
              </div>
              <p className="cm-resume">{p.possible ? p.resume : p.pourquoi_pas}</p>
              {p.possible ? (
                <Detail pour={p.pour} contraintes={p.contraintes}
                  ouvert={ouvert === p.id} onToggle={() => setOuvert(ouvert === p.id ? null : p.id)} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** L'aide au choix, avec ses deux volets. Autonome : se pose où on veut (onglet partenaires,
 *  page dédiée). Aucune donnée serveur — c'est du conseil, pas du catalogue. */
export default function ConseilMateriel() {
  const [mode, setMode] = useState("four");
  return (
    <div className="cm">
      <div className="kind-seg" style={{ marginBottom: 16 }}>
        <button className={"kind-btn" + (mode === "four" ? " on" : "")} onClick={() => setMode("four")}>
          <Icon name="flame" size={15} /> Quel four ?
        </button>
        <button className={"kind-btn" + (mode === "petrin" ? " on" : "")} onClick={() => setMode("petrin")}>
          <Icon name="refresh" size={15} /> Quel pétrin ?
        </button>
      </div>
      {mode === "four" ? <FourConseil /> : <PetrinConseil />}
      <p className="cm-src"><Icon name="book-open" size={12} /> Conseils tirés des manuels de l'école.</p>
    </div>
  );
}
