// Helpers de calendrier (vue mois, lundi -> dimanche).

export const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
export const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Format « YYYY-MM-DD » d'une Date locale. */
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Grille du mois : 6 semaines × 7 jours (Date), commençant un lundi. */
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = new Date(year, month, 1 - offset);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      days.push(dt);
    }
    weeks.push(days);
  }
  return weeks;
}

export function isWeekend(d) {
  const w = d.getDay();
  return w === 0 || w === 6;
}

/** La date (chaîne YYYY-MM-DD) est-elle dans l'intervalle [start, end] inclus ? */
export function inRange(dayStr, startStr, endStr) {
  if (!startStr || !endStr) return false;
  return dayStr >= startStr && dayStr <= endStr;
}

export function isToday(d) {
  return ymd(d) === ymd(new Date());
}
