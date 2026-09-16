import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { colorOf } from "../lib/format.js";
import { grouperParSemaine } from "../lib/sessions.js";

/**
 * CHOISIR UNE SEMAINE — pas une session.
 *
 * POURQUOI CE SECOND SÉLECTEUR, alors qu'il en existe déjà un pour les sessions. Parce que les
 * deux écrans ne posent pas la même question. Le Pipeline suit UNE session, étape par étape :
 * choisir la session EST son sujet. La notation, elle, se fait par semaine — on installe les
 * épreuves une fois et on note tout le monde, que les stagiaires suivent la même formation ou
 * non. Lui faire désigner une session revenait à lui faire cliquer pour dire ce que la semaine
 * détermine déjà, puis à recommencer pour la formation d'à côté.
 *
 * LES RÈGLES DE RANGEMENT RESTENT PARTAGÉES (`lib/sessions.js`) : c'est elles qui divergeaient
 * quand le code était recopié, pas le balisage. Deux présentations d'un même rangement ne posent
 * pas de problème ; deux rangements, si.
 *
 * LA SEMAINE MONTRE CE QU'ELLE CONTIENT : les badges de ses formations, aux mêmes couleurs que
 * partout ailleurs. On choisit une semaine en voyant ce qu'on y trouvera — pas un numéro nu.
 */
function SelecteurSemaine({ sessions, valeur, onChoisir, label = "Semaine" }) {
    const semaines = useMemo(() => grouperParSemaine(sessions), [sessions]);
    const courante = useMemo(() => semaines.find((g) => g.cle === valeur) || null, [semaines, valeur]);
    const [ouvert, setOuvert] = useState(false);
    useEffect(() => { setOuvert(false); }, [valeur]);

    const badges = (g) => {
        /* Une formation peut tenir deux sessions la même semaine : on ne répète pas son badge. */
        const vus = [...new Set(g.sessions.map((s) => s.code).filter(Boolean))];
        return vus.map((c) => (
            <span key={c} className="badge n mono"
                style={{ background: colorOf(c), color: "#fff", borderColor: "transparent" }}>{c}</span>
        ));
    };

    return (
        <details className="sess-pick" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
            <summary className="inp sess-pick-tete" aria-label={label}>
                {courante ? (
                    <>
                        <b>S{courante.semaine} · {courante.annee}</b>
                        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>{badges(courante)}</span>
                        <span className="sub" style={{ color: "var(--dim)" }}>{courante.inscrits} inscrit(s)</span>
                    </>
                ) : <span style={{ color: "var(--dim)" }}>Aucune semaine</span>}
                <Icon name="chevron-down" size={14} style={{ marginLeft: "auto", flexShrink: 0 }} />
            </summary>
            <div className="sess-pick-corps">
                {semaines.length === 0 ? (
                    <p className="hint" style={{ margin: 8 }}>Aucune session à noter.</p>
                ) : semaines.map((g) => (
                    <button key={g.cle} type="button"
                        className={"sess-pick-item" + (g.cle === valeur ? " on" : "")}
                        onClick={() => { onChoisir(g.cle); setOuvert(false); }}>
                        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                            <b style={{ display: "block", fontSize: 13 }}>S{g.semaine} · {g.annee}</b>
                            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>{badges(g)}</span>
                        </span>
                        <span className="arch-count">{g.inscrits}</span>
                        {g.cle === valeur && <Icon name="check" size={15} />}
                    </button>
                ))}
            </div>
        </details>
    );
}

export default SelecteurSemaine;
