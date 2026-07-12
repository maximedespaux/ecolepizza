/**
 * Son de notification — synthétisé via Web Audio (aucun fichier à charger).
 * Un « pop » doux à deux notes. Coupable (mute) et mémorisé dans localStorage.
 *
 * Note navigateur : l'AudioContext démarre parfois « suspended » tant que
 * l'utilisateur n'a pas interagi avec la page. On tente un resume() ; si aucune
 * interaction n'a eu lieu, le son reste silencieux (comportement attendu).
 */

const MUTE_KEY = "impasto.notifMuted";

export function isNotifMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotifMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* stockage indisponible : on ignore */
  }
}

let ctx;

/** Joue un carillon discret (sauf si coupé). */
export function playNotif() {
  if (isNotifMuted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    // Deux blips sinus enchaînés → un « pop » agréable, non agressif.
    const notes = [
      { freq: 660, at: 0 },
      { freq: 880, at: 0.09 },
    ];
    for (const { freq, at } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    }
  } catch {
    /* Web Audio indisponible : silencieux */
  }
}
