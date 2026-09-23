import { useEffect, useMemo, useState } from "react";
import Card from "./Card.jsx";
import {
  getSessionIntervenants, addSessionIntervenant, setIntervenantSlots, removeSessionIntervenant,
} from "../api/apiClient.js";

const HALF = [{ slot: "MATIN", label: "Matin" }, { slot: "APRES_MIDI", label: "Après-midi" }];

// Jours ouvrés entre deux dates (ISO), bornés. On formate à partir des composantes
// LOCALES (pas toISOString, qui convertit en UTC et décalerait d'un jour).
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function businessDays(start, end) {
  const out = [];
  if (!start || !end) return out;
  const d = new Date(`${start}T12:00:00`); // midi : évite les bords de changement d'heure
  const last = new Date(`${end}T12:00:00`);
  while (d <= last && out.length < 60) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(isoLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const frDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });

// Affectation des intervenants externes à une session, par demi-journée.
function SessionIntervenants({ sessionId, startDate, endDate, canEdit }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [pick, setPick] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [openId, setOpenId] = useState(null); // affectation dont la grille de jours est ouverte
  const days = useMemo(() => businessDays(startDate, endDate), [startDate, endDate]);

  async function load() {
    try { const r = await getSessionIntervenants(sessionId); setData(r.data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, [sessionId]);

  async function add() {
    if (!pick) return;
    try {
      const r = await addSessionIntervenant(sessionId, { user_id: pick, specialty: specialty.trim() || null });
      setPick(""); setSpecialty("");
      setOpenId(r.data?.id || null); // ouvre la grille pour choisir les demi-journées
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function remove(si) {
    if (!window.confirm(`Retirer ${si.first_name} ${si.last_name} de la session ?`)) return;
    try { await removeSessionIntervenant(sessionId, si.id); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  /* UNE SEULE ÉCRITURE POUR LES DEUX GESTES — cocher une demi-journée, changer une heure : la
     route REMPLACE la liste entière, donc l'une et l'autre partent par le même chemin. */
  async function enregistrer(si, next) {
    setData((d) => ({ ...d, assigned: d.assigned.map((a) => (a.id === si.id ? { ...a, slots: next } : a)) }));
    try {
      const r = await setIntervenantSlots(sessionId, si.id, next);
      /* Le serveur dit quand il a gardé les demi-journées SANS les heures (migration 181 non
         jouée) : sans ce mot, on croirait avoir saisi des heures qui n'existent pas. */
      if (r?.horaires === false) setStatus({ type: "error", message: r.message });
      else setStatus(null);
    } catch (e) { setStatus({ type: "error", message: e.message }); load(); }
  }
  async function toggleSlot(si, date, slot) {
    const has = (si.slots || []).some((s) => s.date === date && s.slot === slot);
    const next = has
      ? si.slots.filter((s) => !(s.date === date && s.slot === slot))
      : [...(si.slots || []), { date, slot, debut: "", fin: "" }];
    await enregistrer(si, next);
  }
  /* LES HEURES NE PARTENT QU'UNE FOIS LES DEUX SAISIES : une plage à moitié remplie n'est pas
     enregistrée (lib/plageHoraire.js côté serveur), et un aller-retour par frappe ferait
     clignoter la ligne sans rien garder. On écrit donc au `blur`, ou dès que la paire est
     complète. */
  function changerHeure(si, date, slot, champ, valeur) {
    const next = (si.slots || []).map((s) => (s.date === date && s.slot === slot ? { ...s, [champ]: valeur } : s));
    setData((d) => ({ ...d, assigned: d.assigned.map((a) => (a.id === si.id ? { ...a, slots: next } : a)) }));
    const ligne = next.find((s) => s.date === date && s.slot === slot);
    if (ligne && ligne.debut && ligne.fin) enregistrer({ ...si, slots: next }, next);
  }
  const poserHeures = (si) => enregistrer(si, si.slots || []);

  const assigned = data?.assigned || [];
  /* Sans la migration 181, les colonnes d'heures n'existent pas : on ne propose pas une
     saisie que l'enregistrement jetterait, on l'explique une fois sous le tableau. */
  const heuresPossibles = data?.horaires !== false;
  const roster = data?.roster || [];

  return (
    <Card title={`Intervenants externes (${assigned.length})`}>
      {status && <p className="hint" style={{ color: "var(--amber,#b8860b)" }}>{status.message}</p>}

      {assigned.length === 0 ? (
        <p className="hint" style={{ margin: "0 0 10px" }}>Aucun intervenant externe sur cette session.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 12 }}>
          {assigned.map((si) => {
            const open = openId === si.id;
            const count = (si.slots || []).length;
            return (
            <div key={si.id} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b style={{ flex: 1 }}>{si.last_name} {si.first_name}{si.specialty ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {si.specialty}</span> : null}
                  {!open && <span className="hint" style={{ marginLeft: 8 }}>{count} demi-journée{count > 1 ? "s" : ""}</span>}
                </b>
                {canEdit && (open
                  ? <button className="btn sm primary" onClick={() => setOpenId(null)}>Terminé</button>
                  : <button className="btn sm ghost" onClick={() => setOpenId(si.id)}>Modifier les dates</button>)}
                {canEdit && <button className="btn sm ghost danger" onClick={() => remove(si)}>Retirer</button>}
              </div>
              {open && (
                <div className="tablewrap" style={{ border: "none", marginTop: 8 }}>
                  <table style={{ fontSize: 12 }}>
                    <thead><tr><th>Jour</th>{HALF.map((h) => <th key={h.slot} style={{ textAlign: "center" }}>{h.label}</th>)}</tr></thead>
                    <tbody>
                      {days.map((d) => (
                        <tr key={d}>
                          <td style={{ whiteSpace: "nowrap" }}>{frDay(d)}</td>
                          {HALF.map((h) => {
                            const ligne = (si.slots || []).find((s) => s.date === d && s.slot === h.slot);
                            return (
                              <td key={h.slot} style={{ textAlign: "center" }}>
                                <input type="checkbox" checked={!!ligne} disabled={!canEdit} onChange={() => toggleSlot(si, d, h.slot)}
                                  aria-label={`${h.label} du ${frDay(d)}`} />
                                {/* LES HEURES N'APPARAISSENT QU'UNE FOIS LA CASE COCHÉE : deux
                                    champs vides sur chaque demi-journée non assurée feraient un
                                    mur de quarante cases à ne pas remplir. */}
                                {ligne && heuresPossibles && (
                                  <span className="interv-heures">
                                    <input type="time" value={ligne.debut || ""} disabled={!canEdit}
                                      aria-label={`Début, ${h.label} du ${frDay(d)}`}
                                      onChange={(e) => changerHeure(si, d, h.slot, "debut", e.target.value)}
                                      onBlur={() => poserHeures(si)} />
                                    <i>–</i>
                                    <input type="time" value={ligne.fin || ""} disabled={!canEdit}
                                      aria-label={`Fin, ${h.label} du ${frDay(d)}`}
                                      onChange={(e) => changerHeure(si, d, h.slot, "fin", e.target.value)}
                                      onBlur={() => poserHeures(si)} />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!heuresPossibles && (
                    <p className="hint" style={{ margin: "6px 0 0" }}>
                      Les demi-journées s'enregistrent, mais pas leurs heures&nbsp;: la migration 181 n'est pas jouée.
                    </p>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        roster.length === 0 && assigned.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Créez d'abord des comptes « Intervenant externe » dans Équipe & accès.</p>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Ajouter un intervenant</option>
              {roster.map((u) => <option key={u.id} value={u.id}>{u.last_name} {u.first_name}</option>)}
            </select>
            <input className="inp" style={{ maxWidth: 220 }} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Spécialité (ex. Expert HACCP)" />
            <button className="btn sm primary" disabled={!pick} onClick={add}>＋ Ajouter</button>
          </div>
        )
      )}
    </Card>
  );
}

export default SessionIntervenants;
