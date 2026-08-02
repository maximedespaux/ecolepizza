// Gamification de l'espace stagiaire : avatars (pizza), grades, XP.
// L'avatar et la progression sont MIROIR : localStorage (lecture synchrone instantanée)
// + base de données (source de vérité, partagée entre appareils / communauté).
// hydrateProfile() (appelé à l'entrée de l'espace) fusionne serveur ↔ local ; les
// écritures (setAvatar / progression) sont poussées vers l'API.
import { getMyProfile, saveMyAvatar, saveMyQuest } from "../api/apiClient.js";
import { adopterCadreServeur } from "./cadres.js";

const QUEST_KEY = "pizzaquest.v1";

// Avatars pizza-thémés : un emoji sur un fond de la charte.
export const AVATARS = [
  { id: "pizza", emoji: "🍕", color: "#dc3e37" },
  { id: "chef", emoji: "🧑‍🍳", color: "#2c3371" },
  { id: "flame", emoji: "🔥", color: "#ff6900" },
  { id: "wheat", emoji: "🌾", color: "#fcb900" },
  { id: "tomato", emoji: "🍅", color: "#e0533e" },
  { id: "cheese", emoji: "🧀", color: "#f0b429" },
  { id: "olive", emoji: "🫒", color: "#2f9e6f" },
  { id: "chili", emoji: "🌶️", color: "#c0392b" },
  { id: "mushroom", emoji: "🍄", color: "#8a5a2b" },
  { id: "bread", emoji: "🥖", color: "#b8860b" },
  { id: "chef2", emoji: "👨‍🍳", color: "#3a4291" },
  { id: "chef3", emoji: "👩‍🍳", color: "#7b3f9e" },
  { id: "basil", emoji: "🌿", color: "#2f9e6f" },
  { id: "oven", emoji: "🍞", color: "#a0522d" },
  // Emojis food supplémentaires.
  { id: "burger", emoji: "🍔", color: "#b5651d" },
  { id: "fries", emoji: "🍟", color: "#f0b429" },
  { id: "pasta", emoji: "🍝", color: "#e0533e" },
  { id: "salad", emoji: "🥗", color: "#2f9e6f" },
  { id: "egg", emoji: "🍳", color: "#f5a623" },
  { id: "bacon", emoji: "🥓", color: "#c0392b" },
  { id: "shrimp", emoji: "🍤", color: "#e67e22" },
  { id: "sushi", emoji: "🍣", color: "#e0533e" },
  { id: "taco", emoji: "🌮", color: "#d98c3f" },
  { id: "hotdog", emoji: "🌭", color: "#c0392b" },
  { id: "sandwich", emoji: "🥪", color: "#c9a227" },
  { id: "croissant", emoji: "🥐", color: "#c98a2b" },
  { id: "pretzel", emoji: "🥨", color: "#8a5a2b" },
  { id: "avocado", emoji: "🥑", color: "#6b8e23" },
  { id: "pepper", emoji: "🫑", color: "#2f9e6f" },
  { id: "corn", emoji: "🌽", color: "#fcb900" },
  { id: "grapes", emoji: "🍇", color: "#7b3f9e" },
  { id: "lemon", emoji: "🍋", color: "#f4d03f" },
  { id: "icecream", emoji: "🍦", color: "#e8a5c0" },
  { id: "coffee", emoji: "☕", color: "#6f4e37" },
];
export const avatarById = (id) => AVATARS.find((a) => a.id === id) || null;
export const isHexColor = (c) => /^#[0-9a-fA-F]{6}$/.test(c || "");

// L'avatar est stocké sous la forme "id" ou "id|#rrggbb" (couleur de fond personnalisée).
// parseAvatar renvoie { id, emoji, color } — la couleur choisie, ou celle par défaut de l'emoji.
export function parseAvatar(value) {
  if (!value) return null;
  const [id, color] = String(value).split("|");
  const base = avatarById(id);
  if (!base) return null;
  return { ...base, color: isHexColor(color) ? color : base.color };
}

const AVATAR_KEY = (uid) => `impasto.avatar.${uid || "me"}`;
const AVATAR_EVT = "impasto:avatar";
export function getAvatar(uid) {
  try { const v = localStorage.getItem(AVATAR_KEY(uid)); return v ? parseAvatar(v) : null; } catch { return null; }
}
export function setAvatar(uid, id, color) {
  const value = isHexColor(color) ? `${id}|${color}` : id;
  try { localStorage.setItem(AVATAR_KEY(uid), value); window.dispatchEvent(new CustomEvent(AVATAR_EVT)); } catch { /* ignore */ }
  saveMyAvatar(value).catch(() => {}); // persistance serveur (best-effort)
}
export const AVATAR_EVENT = AVATAR_EVT;

/**
 * « Quelque chose a été vu ou lu dans la Communauté ». La pastille du menu vit dans
 * StudentLayout, la Communauté est rendue dans son Outlet : sans ce signal, le compteur
 * ne retomberait qu'au prochain changement de page — on ouvrirait une fiche commentée en
 * voyant la pastille rester à 3.
 *
 * L'événement ne porte AUCUN nombre : il dit seulement « recompte ». Le serveur reste seul
 * juge du total, ce qui évite de tenir un compte parallèle côté navigateur, qui dériverait
 * dès qu'un commentaire arrive pendant la visite.
 */
export const COMMUNITY_EVENT = "impasto:communaute-vue";
export const pingCommunaute = () => window.dispatchEvent(new Event(COMMUNITY_EVENT));

// Fusionne deux cartes de progression { world: { step: stars } } en gardant le meilleur score.
function mergeProgress(a = {}, b = {}) {
  const out = {};
  for (const src of [a, b]) for (const [w, steps] of Object.entries(src || {})) {
    out[w] = out[w] || {};
    for (const [s, stars] of Object.entries(steps || {})) out[w][s] = Math.max(out[w][s] || 0, Number(stars) || 0);
  }
  return out;
}

// Enregistre la progression Pizza Quest en local ET en base (best-effort).
export function saveQuestProgress(progress) {
  try { localStorage.setItem(QUEST_KEY, JSON.stringify(progress)); } catch { /* ignore */ }
  saveMyQuest(progress).catch(() => {});
}

// À l'entrée de l'espace stagiaire : charge le profil serveur, fusionne avec le local,
// réécrit le local (pour les lectures synchrones) et repousse le tout en base.
export async function hydrateProfile(uid) {
  let data;
  try { ({ data } = await getMyProfile()); } catch { return; } // hors-ligne / non stagiaire : on garde le local
  if (!data) return;
  if (data.avatar) { try { localStorage.setItem(AVATAR_KEY(uid), data.avatar); } catch { /* ignore */ } }
  /* LE CADRE AUSSI, et il manquait ici. L'avatar traversait les navigateurs, le cadre non : il
     était écrit en base à chaque choix mais jamais relu, si bien que chaque poste gardait le
     sien. Deux lignes voisines, un seul des deux réglages suivait l'utilisateur. */
  adopterCadreServeur(uid, data.cadre);
  let local = {};
  try { local = JSON.parse(localStorage.getItem(QUEST_KEY)) || {}; } catch { /* ignore */ }
  const merged = mergeProgress(local, data.progress || {});
  try { localStorage.setItem(QUEST_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(AVATAR_EVT));
  // Repousse la progression locale non encore en base (progression faite avant connexion).
  if (JSON.stringify(merged) !== JSON.stringify(data.progress || {})) saveMyQuest(merged).catch(() => {});
}

// Grades pizza : débloqués selon un score = XP du jeu + formations terminées.
export const GRADES = [
  { min: 0, name: "Marmiton", emoji: "🍅" },
  { min: 100, name: "Apprenti", emoji: "🌾" },
  { min: 300, name: "Commis pizzaïolo", emoji: "🍕" },
  { min: 600, name: "Pizzaïolo", emoji: "🔥" },
  { min: 1000, name: "Chef pizzaïolo", emoji: "⭐" },
  { min: 1800, name: "Maestro", emoji: "👑" },
];
export function gradeFor(score) {
  let idx = 0;
  for (let i = 0; i < GRADES.length; i++) if (score >= GRADES[i].min) idx = i;
  return { grade: GRADES[idx], next: GRADES[idx + 1] || null, index: idx };
}

// XP + étoiles accumulés dans Pizza Quest (localStorage).
export function readGameStats() {
  try {
    const p = JSON.parse(localStorage.getItem(QUEST_KEY)) || {};
    let xp = 0, stars = 0;
    for (const w of Object.values(p)) for (const s of Object.values(w)) { xp += s * 10; stars += s; }
    return { xp, stars };
  } catch { return { xp: 0, stars: 0 }; }
}

// Score de progression = XP du jeu + 100 par formation terminée.
export const scoreOf = ({ xp = 0, formationsDone = 0 }) => xp + formationsDone * 100;
