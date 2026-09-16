import { useMemo, useRef, useState, useEffect } from "react";
import { Icon } from "./Icon.jsx";
import { colorOf } from "../lib/format.js";
import { normaliserSession, grouperParSemaine } from "../lib/sessions.js";

/**
 * CHOISIR UNE SESSION — par SEMAINE, puis par FORMATION.
 *
 * CE QU'IL REMPLACE. Deux écrans — Notation et Pipeline — alignaient les sessions dans un menu
 * déroulant : soixante lignes « CODE, S38 2026 · N stag. » à lire une à une, fermées sur
 * elles-mêmes. On n'y voyait jamais ce qu'il y avait à traiter cette semaine-là, ni combien de
 * formations tournaient en parallèle. Or une école pense en SEMAINES : c'est l'unité de ses
 * sessions, de ses feuilles d'émargement et de son classement d'archives.
 *
 * MÊME ARBORESCENCE QUE LE COFFRE DOCUMENTAIRE (Suivi → Archives), et MÊMES COULEURS de
 * formation (`colorOf`) : deux écrans qui rangent la même réalité doivent la ranger pareil,
 * sans quoi on apprend deux fois le même classement.
 *
 * UN COMPOSANT ET NON DEUX COPIES. Le second écran a été trouvé en cherchant — l'utilisateur
 * se souvenait que « la méthode existe ailleurs » sans savoir où. C'est exactement ce que coûte
 * une logique recopiée : elle finit par diverger, et personne ne sait plus combien d'exemplaires
 * il y en a.
 *
 * `<details>` NATIF plutôt qu'un menu maison : il se ferme à Échap, se parcourt au clavier et
 * ne demande aucune gestion de clic extérieur. Le repli garde l'en-tête compact, là où le menu
 * déroulant vivait — Pipeline le loge dans les actions de son titre, qui n'a pas la place d'un
 * arbre déployé en permanence.
 *
 * LES NOMS DE CHAMPS DIFFÈRENT d'un écran à l'autre (`code`/`program_code`,
 * `inscrits`/`stagiaires`) : on les normalise ici plutôt que d'imposer une forme unique aux
 * deux API, ce qui aurait demandé de toucher à deux contrôleurs pour un composant d'affichage.
 */

function SelecteurSession({ sessions, valeur, onChoisir, label = "Session" }) {
    const liste = useMemo(() => (sessions || []).map(normaliserSession), [sessions]);
    const courante = useMemo(() => liste.find((s) => s.id === valeur) || null, [liste, valeur]);
    const [ouvert, setOuvert] = useState(false);
    const ref = useRef(null);

    /* Le choix referme : on vient de répondre à la question posée. Laisser l'arbre ouvert
       obligerait à un second geste pour voir l'écran qu'on vient de demander. */
    useEffect(() => { setOuvert(false); }, [valeur]);

    const semaines = useMemo(() => grouperParSemaine(sessions), [sessions]);

    const etiquette = (s) => `S${s.semaine ?? "?"} · ${s.annee ?? "?"}`;

    return (
        <details ref={ref} className="sess-pick" open={ouvert}
            onToggle={(e) => setOuvert(e.currentTarget.open)}>
            <summary className="inp sess-pick-tete" aria-label={label}>
                {courante ? (
                    <>
                        {courante.code && (
                            <span className="badge n mono" style={{ background: colorOf(courante.code), color: "#fff", borderColor: "transparent" }}>{courante.code}</span>
                        )}
                        <b>{etiquette(courante)}</b>
                        <span className="sub" style={{ color: "var(--dim)" }}>{courante.inscrits} inscrit(s)</span>
                    </>
                ) : <span style={{ color: "var(--dim)" }}>Aucune session</span>}
                <Icon name="chevron-down" size={14} style={{ marginLeft: "auto", flexShrink: 0 }} />
            </summary>

            <div className="sess-pick-corps">
                {semaines.length === 0 ? (
                    <p className="hint" style={{ margin: 8 }}>Aucune session à afficher.</p>
                ) : semaines.map((g, i) => (
                    /* La semaine la plus récente est ouverte — c'est celle qu'on vient traiter
                       neuf fois sur dix. Celle qui porte la session choisie l'est aussi, sinon
                       on ne verrait pas d'où l'on part. */
                    <details key={g.cle} open={i === 0 || g.sessions.some((s) => s.id === valeur)}>
                        <summary className="arch-sum arch-y">
                            S{g.semaine} · {g.annee}
                            <span className="arch-count">{g.inscrits}</span>
                        </summary>
                        <div className="arch-in">
                            {g.sessions.map((s) => (
                                <button key={s.id} type="button"
                                    className={"sess-pick-item" + (s.id === valeur ? " on" : "")}
                                    onClick={() => { onChoisir(s.id); setOuvert(false); }}>
                                    {s.code && (
                                        <span className="badge n mono" style={{ background: colorOf(s.code), color: "#fff", borderColor: "transparent" }}>{s.code}</span>
                                    )}
                                    <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                                        <b style={{ display: "block", fontSize: 13 }}>{s.titre || "Session"}</b>
                                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.inscrits} inscrit(s)</span>
                                    </span>
                                    {s.id === valeur && <Icon name="check" size={15} />}
                                </button>
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        </details>
    );
}

export default SelecteurSession;
