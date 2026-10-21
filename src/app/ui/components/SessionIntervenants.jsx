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

// Les créneaux d'une demi-journée : la liste `plages` (migration 213) si elle est là, sinon la plage
// unique debut/fin (181) ramenée à une liste d'un élément — l'écran édite toujours une liste.
const plagesDe = (s) => (s && s.plages && s.plages.length ? s.plages : [{ debut: (s && s.debut) || "", fin: (s && s.fin) || "" }]);

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
  // Reflète l'état localement sans réécrire en base — pour une frappe en cours.
  const majSlots = (si, next) => setData((d) => ({ ...d, assigned: d.assigned.map((a) => (a.id === si.id ? { ...a, slots: next } : a)) }));
  /* UNE SEULE ÉCRITURE POUR TOUS LES GESTES — cocher une demi-journée, changer une heure, basculer
     « heures en plus » : la route REMPLACE la liste entière et met à jour le drapeau, donc tout
     part par le même chemin. */
  async function enregistrer(si, next) {
    setData((d) => ({ ...d, assigned: d.assigned.map((a) => (a.id === si.id ? { ...a, slots: next, extra: si.extra } : a)) }));
    try {
      const r = await setIntervenantSlots(sessionId, si.id, next, si.extra);
      /* Le serveur dit quand il a gardé les demi-journées SANS les heures (181) ou SANS les pauses
         (213) : sans ce mot, on croirait avoir saisi des heures/pauses qui n'existent pas. */
      setStatus(r?.message && r.message !== "Demi-journées enregistrées." ? { type: "error", message: r.message } : null);
    } catch (e) { setStatus({ type: "error", message: e.message }); load(); }
  }
  async function toggleSlot(si, date, slot) {
    const has = (si.slots || []).some((s) => s.date === date && s.slot === slot);
    const next = has
      ? si.slots.filter((s) => !(s.date === date && s.slot === slot))
      : [...(si.slots || []), { date, slot, plages: [{ debut: "", fin: "" }] }];
    await enregistrer(si, next);
  }
  /* LES HEURES NE PARTENT QU'UNE FOIS LES DEUX SAISIES : une plage à moitié remplie n'est pas
     enregistrée (lib/plageHoraire.js côté serveur). On écrit donc au `blur`, ou dès que TOUTES les
     plages de la demi-journée sont complètes. */
  function changerPlage(si, date, slot, idx, champ, valeur) {
    const next = (si.slots || []).map((s) => {
      if (!(s.date === date && s.slot === slot)) return s;
      return { ...s, plages: plagesDe(s).map((p, i) => (i === idx ? { ...p, [champ]: valeur } : p)) };
    });
    majSlots(si, next);
    const s = next.find((x) => x.date === date && x.slot === slot);
    if (s && plagesDe(s).every((p) => p.debut && p.fin)) enregistrer({ ...si, slots: next }, next);
  }
  function ajouterPlage(si, date, slot) {
    majSlots(si, (si.slots || []).map((s) => (s.date === date && s.slot === slot ? { ...s, plages: [...plagesDe(s), { debut: "", fin: "" }] } : s)));
  }
  function retirerPlage(si, date, slot, idx) {
    const next = (si.slots || []).map((s) => {
      if (!(s.date === date && s.slot === slot)) return s;
      const plages = plagesDe(s).filter((_, i) => i !== idx);
      return { ...s, plages: plages.length ? plages : [{ debut: "", fin: "" }] };
    });
    enregistrer({ ...si, slots: next }, next);
  }
  const poserHeures = (si) => enregistrer(si, si.slots || []);
  async function toggleExtra(si) {
    const next = { ...si, extra: !si.extra };
    await enregistrer(next, next.slots || []);
  }

  const assigned = data?.assigned || [];
  /* Sans la migration 181, les colonnes d'heures n'existent pas : on ne propose pas une saisie que
     l'enregistrement jetterait. `multi` (213) : plusieurs créneaux (pauses) + « heures en plus ». */
  const heuresPossibles = data?.horaires !== false;
  const multi = data?.multi === true;
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ flex: 1 }}>{si.last_name} {si.first_name}{si.specialty ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {si.specialty}</span> : null}
                  {!open && <span className="hint" style={{ marginLeft: 8 }}>{count} demi-journée{count > 1 ? "s" : ""}{si.extra ? " · heures en plus" : ""}</span>}
                </b>
                {/* « HEURES EN PLUS » : ses heures nettes s'ajoutent au total de la feuille, car il
                    enseigne un temps qui n'est PAS dans les demi-journées du stagiaire (l'hygiène, p.ex.). */}
                {canEdit && multi && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}
                    title="Ses heures s'ajoutent au total de la feuille — pour un intervenant qui enseigne EN PLUS des heures du stagiaire (ex. l'hygiène).">
                    <input type="checkbox" checked={!!si.extra} disabled={!canEdit} onChange={() => toggleExtra(si)} /> Heures en plus
                  </label>
                )}
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
                            const plages = ligne ? plagesDe(ligne) : [];
                            return (
                              <td key={h.slot} style={{ textAlign: "center", verticalAlign: "top" }}>
                                <input type="checkbox" checked={!!ligne} disabled={!canEdit} onChange={() => toggleSlot(si, d, h.slot)}
                                  aria-label={`${h.label} du ${frDay(d)}`} />
                                {/* LES HEURES N'APPARAISSENT QU'UNE FOIS LA CASE COCHÉE. Un intervenant
                                    peut faire plusieurs créneaux avec des pauses (213) : une plage par
                                    ligne, « ＋ plage » pour en ajouter. */}
                                {ligne && heuresPossibles && (
                                  <span className="interv-plages" style={{ display: "inline-flex", flexDirection: "column", gap: 3, marginTop: 3 }}>
                                    {plages.map((p, i) => (
                                      <span key={i} className="interv-heures" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                        <input type="time" value={p.debut || ""} disabled={!canEdit}
                                          aria-label={`Début ${i + 1}, ${h.label} du ${frDay(d)}`}
                                          onChange={(e) => changerPlage(si, d, h.slot, i, "debut", e.target.value)} onBlur={() => poserHeures(si)} />
                                        <i>–</i>
                                        <input type="time" value={p.fin || ""} disabled={!canEdit}
                                          aria-label={`Fin ${i + 1}, ${h.label} du ${frDay(d)}`}
                                          onChange={(e) => changerPlage(si, d, h.slot, i, "fin", e.target.value)} onBlur={() => poserHeures(si)} />
                                        {canEdit && multi && plages.length > 1 && (
                                          <button type="button" className="lien-nu" title="Retirer cette plage" aria-label="Retirer cette plage"
                                            onClick={() => retirerPlage(si, d, h.slot, i)}>×</button>
                                        )}
                                      </span>
                                    ))}
                                    {canEdit && multi && (
                                      <button type="button" className="lien-nu" style={{ fontSize: 11 }} onClick={() => ajouterPlage(si, d, h.slot)}>＋ plage</button>
                                    )}
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
                  {heuresPossibles && !multi && (
                    <p className="hint" style={{ margin: "6px 0 0" }}>
                      Une seule plage par demi-journée&nbsp;: pour des pauses et des heures qui comptent dans le total, jouer la migration 213.
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
