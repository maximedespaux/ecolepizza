/**
 * OÙ S'OUVRE LE CALENDRIER DES SESSIONS — demandé le 2026-09-28 : « ouvrir Sessions sur la date de la
 * prochaine session, sauf si la session précédente a encore un stagiaire sous 100 % ». Le calendrier
 * s'ouvrait toujours sur le mois du jour : le 28/09/2026, sur septembre, quand les stagiaires de la
 * semaine écoulée avaient tous fini leur dossier et que les prochaines sessions étaient en octobre.
 *
 * LA RÈGLE, dans l'ordre :
 *   1. une session EN COURS aujourd'hui : on reste sur aujourd'hui — c'est elle qu'on travaille ;
 *   2. la SESSION PRÉCÉDENTE — la dernière terminée, avec celles de sa semaine (plusieurs formations
 *      finissent souvent ensemble) — a encore un dossier à finir : on s'ouvre sur elle, la première
 *      dans l'ordre des dates ;
 *   3. sinon, sur la PROCHAINE session ;
 *   4. sinon (aucune à venir), sur aujourd'hui.
 *
 * « À FINIR » EST LA RÈGLE DU TABLEAU DE BORD (`resteAFinir`, dossiersASuivre.js) : sous 100 %, un
 * parcours non vide, et un stagiaire venu (point de rupture franchi). Quelqu'un qui n'est jamais venu
 * ne complétera jamais son dossier : il ne retient pas plus le calendrier qu'il ne reste sur la carte
 * « Derniers dossiers » — les deux écrans disent la même chose d'un même dossier.
 *
 * Du JavaScript pur, sans JSX : les tests de `src/api/test` l'importent et l'éprouvent.
 *
 * @param sessions   GET /sessions : { id, start_date, end_date, year, week, program_code }
 * @param dossiers   GET /enrollments : { session_id, percent, total, point_franchi }
 * @param aujourdhui 'AAAA-MM-JJ' (heure locale)
 * @returns {{ date: string, raison: 'en-cours' | 'precedente' | 'suivante' | 'aujourdhui',
 *             session: object | null, aFinir: number }}
 *   `date` : le jour sur lequel ouvrir ; `session` : celle qui décide ; `aFinir` : ses dossiers à finir.
 */
import { resteAFinir } from "./dossiersASuivre.js";

const jour = (v) => String(v || "").slice(0, 10);
const debut = (s) => jour(s.start_date);
const fin = (s) => jour(s.end_date || s.start_date);

export function ouvertureDuCalendrier(sessions, dossiers, aujourdhui) {
  const datees = (sessions || []).filter((s) => s && s.start_date)
    .sort((a, b) => debut(a).localeCompare(debut(b)));

  const enCours = datees.find((s) => debut(s) <= aujourdhui && fin(s) >= aujourdhui);
  if (enCours) return { date: aujourdhui, raison: "en-cours", session: enCours, aFinir: 0 };

  const terminees = datees.filter((s) => fin(s) < aujourdhui);
  if (terminees.length) {
    const derniere = terminees.reduce((a, b) => (fin(b) > fin(a) ? b : a));
    /* SA SEMAINE, par l'année et le numéro que porte chaque session (S38) ; à défaut, elle seule. */
    const memeSemaine = (s) => (derniere.year != null && derniere.week != null
      ? String(s.year) === String(derniere.year) && String(s.week) === String(derniere.week)
      : s.id === derniere.id);
    const aFinirDe = (s) => (dossiers || []).filter((d) => d && d.session_id === s.id && resteAFinir(d)).length;
    const retenue = terminees.filter(memeSemaine).find((s) => aFinirDe(s) > 0);
    if (retenue) return { date: debut(retenue), raison: "precedente", session: retenue, aFinir: aFinirDe(retenue) };
  }

  // Une session qui commence aujourd'hui est « en cours » (plus haut) : la prochaine commence après.
  const suivante = datees.find((s) => debut(s) > aujourdhui);
  if (suivante) return { date: debut(suivante), raison: "suivante", session: suivante, aFinir: 0 };
  return { date: aujourdhui, raison: "aujourdhui", session: null, aFinir: 0 };
}
