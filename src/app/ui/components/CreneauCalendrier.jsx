import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { getPickupSlots } from "../api/apiClient.js";

/**
 * Choix du créneau de retrait, en calendrier (façon Calendly) : un mois, puis les heures
 * du jour choisi.
 *
 * Les jours ouverts et leurs créneaux viennent de l'API — le front ne recopie pas les
 * horaires (cf. api/lib/horaires.js). Un jour absent de la réponse est fermé, point : le
 * calendrier n'a aucune règle métier à lui, il ne fait qu'afficher ce que le serveur autorise.
 * C'est ce qui garantit qu'on ne proposera jamais un créneau que l'API refusera ensuite.
 */

const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];

/* Clé locale d'un jour. JAMAIS toISOString() : il repasse en UTC et décale d'un jour
   (cf. api/lib/horaires.js). */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Les cases d'un mois, alignées sur une semaine qui commence le LUNDI (getDay() : 0 = dimanche). */
function grilleMois(annee, mois) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7; // lundi = 0
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const cases = Array(decalage).fill(null);
  for (let j = 1; j <= nbJours; j++) cases.push(new Date(annee, mois, j));
  while (cases.length % 7) cases.push(null);
  return cases;
}

function CreneauCalendrier({ value, onChange, textile }) {
  const [days, setDays] = useState(null);
  const [info, setInfo] = useState(null);
  const [curseur, setCurseur] = useState(() => { const d = new Date(); return { a: d.getFullYear(), m: d.getMonth() }; });

  // `textile` = le panier contient un article brodé → l'API n'ouvre qu'après le délai de
  // fabrication. On grise donc les jours trop proches AU LIEU de laisser choisir puis refuser.
  useEffect(() => {
    getPickupSlots(textile)
      .then((r) => {
        const d = r.data || [];
        setDays(d);
        setInfo({ min: r.min_date, delai: r.delai_ouvres });
        // Ouvrir sur le premier mois qui a des créneaux, pas sur le mois courant : une veste
        // commandée le 29 juillet n'est prête qu'en août, et le stagiaire tomberait sur un
        // juillet entièrement grisé sans deviner qu'il faut cliquer « mois suivant ».
        const premier = d.map((x) => x.date).sort()[0];
        if (premier) { const [a, m] = premier.split("-"); setCurseur({ a: +a, m: +m - 1 }); }
      })
      .catch(() => setDays([]));
  }, [textile]);

  const parDate = useMemo(() => new Map((days || []).map((d) => [d.date, d.slots])), [days]);
  const [selDate, selHeure] = value ? value.split("T") : [null, null];

  if (!days) return <p className="hint">Chargement des créneaux…</p>;
  if (!days.length) return null;

  // On ne laisse pas naviguer hors de la fenêtre servie par l'API : un mois vide donnerait
  // l'impression que l'école est fermée, alors qu'on ne connaît juste pas encore ses créneaux.
  const dispo = days.map((d) => d.date).sort();
  const borneMin = dispo[0].slice(0, 7), borneMax = dispo[dispo.length - 1].slice(0, 7);
  const moisCourant = `${curseur.a}-${String(curseur.m + 1).padStart(2, "0")}`;
  const bouger = (n) => setCurseur(({ a, m }) => { const d = new Date(a, m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; });

  const cases = grilleMois(curseur.a, curseur.m);
  const slots = selDate ? parDate.get(selDate) : null;

  return (
    <div>
      <div className="cal-nav">
        <button className="iconbtn" onClick={() => bouger(-1)} disabled={moisCourant <= borneMin} aria-label="Mois précédent">
          <Icon name="chevron-left" size={15} />
        </button>
        <b>{MOIS[curseur.m]} {curseur.a}</b>
        <button className="iconbtn" onClick={() => bouger(1)} disabled={moisCourant >= borneMax} aria-label="Mois suivant">
          <Icon name="chevron-right" size={15} />
        </button>
      </div>

      <div className="cal-dows">{JOURS_COURTS.map((j, i) => <span key={i}>{j}</span>)}</div>
      <div className="cal-days">
        {cases.map((d, i) => {
          if (!d) return <span key={i} />;
          const k = ymd(d);
          const ouvert = parDate.has(k);
          return (
            <button key={i} type="button" disabled={!ouvert}
              className={"cal-day" + (selDate === k ? " on" : "") + (ouvert ? "" : " off")}
              aria-label={ouvert ? `${d.getDate()} ${MOIS[d.getMonth()]}` : `${d.getDate()} ${MOIS[d.getMonth()]}, fermé`}
              onClick={() => onChange(`${k}T${parDate.get(k)[0]}`)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>

      {slots ? (
        <div className="cal-slots">
          <b className="cal-slots-t">Heure de retrait</b>
          <div className="slot-grid">
            {slots.map((s) => (
              <button key={s} type="button" className={"slot" + (selHeure === s ? " on" : "")}
                onClick={() => onChange(`${selDate}T${s}`)}>{s}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="hint cal-vide">
          {textile
            ? "Choisis un jour : ta veste est brodée sur commande, on ne peut pas te la donner avant."
            : "Choisis un jour, ou passe quand tu veux pendant nos horaires."}
        </p>
      )}

      {info && info.delai ? (
        <p className="hint" style={{ margin: "12px 0 0", color: "var(--orange)" }}>
          <Icon name="clock" size={13} style={{ verticalAlign: "-2px" }} /> Ta veste est brodée sur commande :
          compte {info.delai} jours ouvrés. Les jours avant le {String(info.min).split("-").reverse().join("/")} sont grisés.
        </p>
      ) : null}
      {value ? (
        <button className="btn sm ghost" style={{ marginTop: 12 }} onClick={() => onChange(null)}>
          <Icon name="x" size={13} /> Finalement, je passerai sans rendez-vous
        </button>
      ) : null}
    </div>
  );
}

export default CreneauCalendrier;
