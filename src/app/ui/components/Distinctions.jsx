import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDistinctions, getStagiaires, updateStagiaire } from "../api/apiClient.js";
import { CADRES, cadreClass } from "../lib/cadres.js";
import { Icon } from "./Icon.jsx";

const EXCLUSIFS = CADRES.filter((c) => c.exclusif);
const nomDe = (p) => [p.last_name, p.first_name].filter(Boolean).join(" ");

/**
 * DISTINCTIONS — les cadres exclusifs que l'ÉCOLE décerne : Champion, Podium, Jury, Fondateur…
 *
 * POURQUOI DANS LA COMMUNAUTÉ, ET PLUS SUR LA FICHE STAGIAIRE (déplacé le 2026-09-17, à la
 * demande de l'école). La carte « Cadres exclusifs » siégeait entre « Projet » et « Entreprise »,
 * au milieu du dossier administratif — identité, financement, entreprise, et un podium de
 * concours. Ces cadres ne servent qu'ici, où ils entourent l'avatar : c'est donc ici qu'on les
 * décerne. Et on voit enfin D'UN COUP qui est Champion et qui a siégé au jury, ce que la fiche,
 * une personne à la fois, ne pouvait pas montrer.
 *
 * Les cadres de PARCOURS (Bronze → Maestro) n'y figurent pas : ils se déduisent seuls des
 * formations terminées. Ceux-ci ne s'obtiennent pas en cumulant — ils se reçoivent.
 *
 * L'ÉCRITURE passe toujours par PATCH /stagiaires/:id, réservé au bureau et journalisé. La colonne
 * est une liste « champion,jury » : l'écrire, c'est la REMPLACER. La liste est donc relue juste
 * avant chaque écriture — calculer sur celle affichée depuis dix minutes effacerait un cadre
 * décerné entre-temps depuis un autre poste. Et si elle n'a pas pu être lue, on n'écrit rien :
 * une liste vide par erreur ferait croire que la personne n'en porte aucun, et on les lui
 * retirerait tous en lui en ajoutant un.
 */
export default function Distinctions() {
  const [porteurs, setPorteurs] = useState(null); // null tant que la liste n'est pas lue
  const [erreur, setErreur] = useState(false);
  const [cible, setCible] = useState(null);       // cadre dont la recherche « Attribuer » est ouverte
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);           // { ok, text }

  const charger = () => getDistinctions()
    .then((r) => { setPorteurs(r.data || []); setErreur(false); return r.data || []; });

  useEffect(() => { charger().catch(() => setErreur(true)); }, []);

  useEffect(() => {
    const terme = q.trim();
    if (!cible || !terme) { setResultats([]); return; }
    const t = setTimeout(() => {
      getStagiaires(terme).then((r) => setResultats((r.data || []).slice(0, 8))).catch(() => setResultats([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, cible]);

  async function ecrire(personne, cadre, attribuer) {
    setBusy(true); setMsg(null);
    try {
      const frais = await charger();
      const actuels = frais.find((p) => p.id === personne.id)?.cadres_exclusifs || [];
      const suivants = attribuer ? [...new Set([...actuels, cadre.id])] : actuels.filter((x) => x !== cadre.id);
      await updateStagiaire(personne.id, { cadres_exclusifs: suivants.join(",") });
      // L'écriture a RÉUSSI : un échec de la relecture ne doit pas la faire passer pour un échec.
      await charger().catch(() => setErreur(true));
      setMsg({ ok: true, text: attribuer ? `« ${cadre.nom} » décerné à ${nomDe(personne)}.` : `« ${cadre.nom} » retiré à ${nomDe(personne)}.` });
      if (attribuer) { setCible(null); setQ(""); }
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Échec de l'enregistrement." });
    } finally {
      setBusy(false);
    }
  }

  return (
    /* Replié par défaut : on décerne un podium quelques fois par an, et le fil reste le sujet
       de la page. */
    <details className="comm-distinctions">
      <summary>
        <Icon name="star" size={15} />
        <b>Distinctions de l'école</b>
        {porteurs && <span className="hint">· {porteurs.length} stagiaire{porteurs.length > 1 ? "s" : ""} distingué{porteurs.length > 1 ? "s" : ""}</span>}
        <Icon name="chevron-down" size={15} className="dist-chevron" />
      </summary>

      <p className="hint" style={{ margin: "8px 0 0" }}>
        Les cadres que l'école décerne, visibles autour de l'avatar dans la communauté. Les cadres de
        parcours (Bronze à Maestro) se gagnent seuls, aux formations terminées : ils n'apparaissent pas ici.
      </p>
      {msg && <p className="hint" role="status" style={{ margin: "8px 0 0", color: msg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)" }}>{msg.text}</p>}

      {erreur ? (
        <p className="hint" style={{ margin: "10px 0 0" }}>
          Impossible de lire les distinctions.{" "}
          <button type="button" className="btn sm ghost" onClick={() => charger().catch(() => setErreur(true))}>Réessayer</button>
        </p>
      ) : !porteurs ? (
        <p className="hint" style={{ margin: "10px 0 0" }}>Chargement…</p>
      ) : (
        <div className="dist-liste">
          {EXCLUSIFS.map((c) => {
            const ont = porteurs.filter((p) => p.cadres_exclusifs.includes(c.id));
            return (
              <div key={c.id} className="dist-ligne">
                <span className={"cadre-attrib-rond " + cadreClass(c.id)} aria-hidden="true" />
                <div className="dist-corps">
                  <div className="dist-tete"><b>{c.nom}</b><span className="hint">{c.condition}</span></div>
                  <div className="dist-porteurs">
                    {ont.length === 0 && <span className="hint">Personne pour l'instant.</span>}
                    {ont.map((p) => (
                      <span key={p.id} className="dist-chip">
                        <Link to={`/stagiaires/${p.id}`} title="Ouvrir la fiche">{nomDe(p)}</Link>
                        <button type="button" disabled={busy} onClick={() => ecrire(p, c, false)}
                          title="Retirer" aria-label={`Retirer le cadre ${c.nom} à ${nomDe(p)}`}>
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                    <button type="button" className="btn sm ghost" aria-expanded={cible === c.id}
                      onClick={() => { setCible(cible === c.id ? null : c.id); setQ(""); }}>
                      <Icon name="plus" size={13} /> Attribuer
                    </button>
                  </div>

                  {cible === c.id && (
                    <div style={{ position: "relative" }}>
                      <span className="gs-search">
                        <Icon name="search" size={14} aria-hidden="true" />
                        {/* Le focus va au champ : on vient de cliquer « Attribuer », taper le nom
                            est le seul geste suivant possible. */}
                        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                          placeholder="Nom ou e-mail du stagiaire…"
                          aria-label={`Rechercher le stagiaire à qui décerner le cadre ${c.nom}`} />
                        {q && <button type="button" className="gs-clear" aria-label="Effacer la recherche" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
                      </span>
                      {resultats.length > 0 && (
                        <div className="cat-pop">
                          {resultats.map((s) => {
                            const deja = ont.some((p) => p.id === s.id);
                            return (
                              <div key={s.id} className="cat-opt">
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <b>{nomDe(s)}</b>{s.email && <span className="hint"> · {s.email}</span>}
                                </span>
                                {deja ? <span className="hint">déjà {c.nom}</span> : (
                                  <button type="button" className="btn sm primary" disabled={busy} onClick={() => ecrire(s, c, true)}
                                    aria-label={`Décerner le cadre ${c.nom} à ${nomDe(s)}`}>
                                    <Icon name="plus" size={14} /> Décerner
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}
