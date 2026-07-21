// Jeu d'exemples réaliste, chargeable en un tap depuis le hub. But : voir l'application vivante
// (badges qui s'allument, historique rempli, non-conformité ouverte, DLC proches) sans passer dix
// minutes à tout saisir à la main. Crée le référentiel s'il manque, puis quelques entrées datées.
//
// Réutilise les équipements / tâches déjà présents (ne les duplique pas) ; n'ajoute que les
// entrées d'exemple. Rejouable — au pire on empile quelques entrées, supprimables une à une.
import {
  getHygieneEquipment, addHygieneEquipment, getHygieneTasks, addHygieneTask, addHygieneEntry,
} from "../api/apiClient.js";
import { DEFAULT_EQUIPMENT, DEFAULT_CLEANING, tempStatus } from "./hygiene.js";

export async function loadHygieneExamples() {
  // 1) Référentiel équipements — on garde l'existant, sinon on pose les points courants.
  let equip = (await getHygieneEquipment(true)).data || [];
  if (equip.length === 0) {
    const created = [];
    for (const p of DEFAULT_EQUIPMENT) created.push((await addHygieneEquipment(p)).data);
    equip = created;
  }
  // 2) Plan de nettoyage — idem.
  let tasks = (await getHygieneTasks(true)).data || [];
  if (tasks.length === 0) {
    const created = [];
    for (const t of DEFAULT_CLEANING) created.push((await addHygieneTask(t)).data);
    tasks = created;
  }

  const froid = equip.find((e) => e.type === "FROID") || equip[0];
  const congel = equip.find((e) => e.type === "CONGELATEUR");
  const friteuse = equip.find((e) => e.type === "FRITEUSE");
  const now = Date.now();
  const hAgo = (h) => new Date(now - h * 3600e3).toISOString();
  const inDays = (d) => new Date(now + d * 864e5).toISOString();

  const entries = [];
  // Températures — aujourd'hui (conforme) + hier (congélateur hors zone, avec action corrective).
  if (froid) {
    entries.push({ register: "TEMPERATURE", equipment_id: froid.id, value_num: 3, unit: "°C", status: tempStatus(3, froid), occurred_at: hAgo(2) });
    entries.push({ register: "TEMPERATURE", equipment_id: froid.id, value_num: 3.5, unit: "°C", status: tempStatus(3.5, froid), occurred_at: hAgo(26) });
  }
  if (congel) {
    entries.push({ register: "TEMPERATURE", equipment_id: congel.id, value_num: -19, unit: "°C", status: tempStatus(-19, congel), occurred_at: hAgo(2) });
    entries.push({ register: "TEMPERATURE", equipment_id: congel.id, value_num: -14, unit: "°C", status: tempStatus(-14, congel), occurred_at: hAgo(26), corrective: "Porte mal fermée — refermée, recontrôle à 16 h" });
  }
  // Nettoyage fait aujourd'hui.
  if (tasks[0]) entries.push({ register: "CLEANING", task_id: tasks[0].id, status: "FAIT", occurred_at: hAgo(3) });
  if (tasks[1]) entries.push({ register: "CLEANING", task_id: tasks[1].id, status: "FAIT", occurred_at: hAgo(4) });
  // Réceptions (avec lot + DLC — l'une proche pour déclencher l'alerte).
  entries.push({ register: "RECEPTION", title: "Mozzarella fior di latte", value_num: 4, unit: "°C", status: "CONFORME", occurred_at: hAgo(5), due_at: inDays(2), meta: { supplier: "Metro", lot: "MZ-2451" } });
  entries.push({ register: "RECEPTION", title: "Farine type 00", status: "CONFORME", occurred_at: hAgo(28), due_at: inDays(120), meta: { supplier: "Transgourmet", lot: "FR-8830" } });
  // Étiquette de DLC secondaire.
  entries.push({ register: "LABEL", title: "Sauce tomate maison", occurred_at: hAgo(6), due_at: inDays(2), meta: { type: "FABRICATION", lot: "ST-0721" } });
  // Huile de friture (conforme).
  if (friteuse) entries.push({ register: "OIL", equipment_id: friteuse.id, value_num: 18, unit: "%", status: "CONFORME", occurred_at: hAgo(7), meta: { aspect: "CLAIR" } });
  // Non-conformité ouverte (reliée à l'écart du congélateur).
  entries.push({ register: "NONCONF", title: "Congélateur à -14 °C hier soir", corrective: "Produits sensibles vérifiés, joint de porte à remplacer", status: "OUVERT", occurred_at: hAgo(27), meta: { categorie: "TEMPERATURE" } });
  // Biodéchets pesés.
  entries.push({ register: "BIOWASTE", value_num: 4.2, unit: "kg", occurred_at: hAgo(8), meta: { type_dechet: "EPLUCHURES", destination: "COLLECTE" } });
  // Audit hebdomadaire conforme.
  entries.push({ register: "AUDIT", title: "Auto-contrôle hebdomadaire du labo", status: "CONFORME", occurred_at: hAgo(30), note: "RAS. Plan de nettoyage à jour, DLC respectées.", meta: { type: "AUTO" } });

  for (const e of entries) await addHygieneEntry(e);
  return { equipment: equip.length, tasks: tasks.length, entries: entries.length };
}
