// Gamification de l'espace stagiaire : avatars (pizza), grades, XP.
// L'avatar et l'XP sont en localStorage pour l'instant (démo) ; ils passeront en base
// avec l'espace communauté (partage entre stagiaires).

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
];
export const avatarById = (id) => AVATARS.find((a) => a.id === id) || null;

const AVATAR_KEY = (uid) => `impasto.avatar.${uid || "me"}`;
const AVATAR_EVT = "impasto:avatar";
export function getAvatar(uid) {
  try { const id = localStorage.getItem(AVATAR_KEY(uid)); return id ? avatarById(id) : null; } catch { return null; }
}
export function setAvatar(uid, id) {
  try { localStorage.setItem(AVATAR_KEY(uid), id); window.dispatchEvent(new CustomEvent(AVATAR_EVT)); } catch { /* ignore */ }
}
export const AVATAR_EVENT = AVATAR_EVT;

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
    const p = JSON.parse(localStorage.getItem("pizzaquest.v1")) || {};
    let xp = 0, stars = 0;
    for (const w of Object.values(p)) for (const s of Object.values(w)) { xp += s * 10; stars += s; }
    return { xp, stars };
  } catch { return { xp: 0, stars: 0 }; }
}

// Score de progression = XP du jeu + 100 par formation terminée.
export const scoreOf = ({ xp = 0, formationsDone = 0 }) => xp + formationsDone * 100;
