import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { useEchap } from "../lib/useEchap.js";
import Coeurs from "./Coeurs.jsx";
import { COEURS_MAX, encoreEnVie } from "../lib/coeurs.js";

/**
 * Le Constructeur de pizza — jeu d'ordonnancement : remettre les étapes de la
 * recette (empâtement → cuisson) dans le bon ordre. Tape une étape pour la placer,
 * retape-la pour la retirer, puis « Vérifier ». Score → étoiles + XP.
 *
 * TROIS ESSAIS, ET LA RÉPONSE NE SE DONNE QU'À LA FIN. Le jeu n'en offrait qu'un seul : on
 * vérifiait, il affichait la bonne étape en face de chaque erreur, et c'était fini. Autant dire
 * qu'on ne cherchait qu'une fois. Un cœur coûte un essai imparfait ; tant qu'il en reste, on
 * apprend seulement QUELLES cases sont fausses — pas ce qu'il fallait mettre — et on corrige. La
 * correction complète n'apparaît qu'au dernier cœur. C'est plus généreux qu'avant (trois passages
 * au lieu d'un) et ça demande de raisonner au lieu de lire la solution.
 *
 * ON GARDE LE MEILLEUR SCORE des trois essais : le but est de trouver l'ordre, pas de le trouver
 * du premier coup.
 *
 * ⚠️ Démo : étapes d'exemple (méthode simplifiée) — à caler sur les manuels.
 */
const RECIPE = [
  { t: "Peser les ingrédients", e: "⚖️" },
  { t: "Frasage (farine + eau)", e: "💧" },
  { t: "Pétrissage", e: "🤲" },
  { t: "Pointage (fermentation en masse)", e: "🫧" },
  { t: "Boulage (former les pâtons)", e: "⚪" },
  { t: "Apprêt (maturation)", e: "⏳" },
  { t: "Façonnage du disque", e: "🍥" },
  { t: "Garniture", e: "🍅" },
  { t: "Cuisson", e: "🔥" },
];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export default function ConstructorGame({ onClose, onFinish }) {
  const order = useMemo(() => shuffle(RECIPE.map((_, i) => i)), []);   // ordre d'affichage du vivier
  const [placed, setPlaced] = useState([]);                            // indices posés, dans l'ordre du joueur
  const [checked, setChecked] = useState(false);
  const [perdus, setPerdus] = useState(0);       // essais imparfaits déjà consommés
  const [meilleur, setMeilleur] = useState(0);   // le meilleur des trois essais, c'est lui qu'on valide

  const pool = order.filter((i) => !placed.includes(i));
  const N = RECIPE.length;
  const correct = placed.filter((idx, pos) => idx === pos).length;
  const noteDe = (bons) => (bons === N ? 3 : bons >= N - 2 ? 2 : bons >= Math.ceil(N / 2) ? 1 : 0);
  const stars = checked ? noteDe(correct) : 0;
  /* La partie est FINIE quand la recette est juste, ou qu'il ne reste plus de cœur. C'est le seul
     moment où l'on affiche la bonne étape en face des erreurs : la donner plus tôt viderait les
     essais restants de leur intérêt. */
  const fini = checked && (correct === N || !encoreEnVie(perdus));

  function verifier() {
    setChecked(true);
    setMeilleur((m) => Math.max(m, noteDe(correct)));
    if (correct !== N) setPerdus((p) => p + 1);
  }

  /* Dès qu'un score existe, TOUTES les sorties le valident — la croix, le voile et Échap.
     Elles appelaient `onClose`, qui referme sans rien enregistrer : l'écran affichait les étoiles
     obtenues et fermer par la croix les jetait. C'est le geste le plus naturel devant un
     résultat, et c'était le seul qui perdait le score. Avant la première vérification il n'y a
     rien à garder : la croix abandonne, comme avant. */
  const fermer = checked ? () => onFinish(meilleur) : onClose;
  useEchap(fermer);

  const place = (i) => { if (!checked) setPlaced((p) => [...p, i]); };
  const unplace = (i) => { if (!checked) setPlaced((p) => p.filter((x) => x !== i)); };

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>🍕 Le Constructeur de pizza</h3>
          {/* Dans l'EN-TÊTE, pas sous le sous-titre : à 375 px la rangée passait à la ligne et
              coûtait une hauteur de plus à un écran qui défile déjà (neuf cases plus neuf
              étiquettes). Ici elle occupe une place qui existait. */}
          <Coeurs perdus={perdus} />
          <button className="x" onClick={fermer} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          <p className="sub" style={{ marginTop: 0 }}>Remets les étapes dans le bon ordre, de l'empâtement à la cuisson.</p>

          {/* Séquence du joueur */}
          <div className="cg-seq">
            {Array.from({ length: N }, (_, pos) => {
              const idx = placed[pos];
              const ok = checked && idx === pos;
              const ko = checked && idx != null && idx !== pos;
              // Le vivier est fait de vrais <button> : au clavier on POUVAIT remplir la
              // séquence, mais plus jamais la corriger — retirer une étape n'existait qu'à la
              // souris. Une case n'est focalisable que lorsqu'elle a réellement quelque chose
              // à faire : ni vide, ni après vérification.
              const retirable = idx != null && !checked;
              return (
                <div key={pos} className={"cg-slot" + (idx == null ? " empty" : "") + (ok ? " ok" : "") + (ko ? " ko" : "")}
                  role={retirable ? "button" : undefined} tabIndex={retirable ? 0 : undefined}
                  onClick={() => idx != null && unplace(idx)}
                  onKeyDown={retirable ? (e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    unplace(idx);
                  } : undefined}
                  title={retirable ? "Retirer" : undefined}>
                  <span className="cg-num">{pos + 1}</span>
                  {idx != null ? <span><span className="cg-e">{RECIPE[idx].e}</span> {RECIPE[idx].t}</span> : <span className="cg-ph">…</span>}
                  {/* Tant qu'il reste un essai, on dit SEULEMENT que la case est fausse. La bonne
                      étape n'apparaît qu'une fois la partie finie — sinon le deuxième essai
                      consisterait à recopier ce qui est déjà écrit à l'écran. */}
                  {checked && idx != null && <span style={{ marginLeft: "auto" }}>{ok ? "✅" : fini ? `→ ${pos + 1}. ${RECIPE[pos].t}` : "❌"}</span>}
                </div>
              );
            })}
          </div>

          {/* ─────────────────────────────────────────────────────────────────────────────
              LE VIVIER, DANS UN BLOC À LUI — pour qu'il puisse coller en bas sur téléphone.

              Mesuré avant : le contenu faisait 927 px pour 589 px visibles, soit 1,57 écran.
              Les neuf emplacements occupaient toute la hauteur et les étapes à placer
              commençaient SOUS la ligne de flottaison : on ne voyait jamais ensemble ce qu'on
              prend et où on le pose, il fallait défiler à chaque étape. Neuf fois.

              Le libellé et les pastilles étaient deux frères ; coller le second aurait laissé
              le premier partir au défilement, et la barre serait apparue sans son titre. */}
          {!checked && pool.length > 0 && (
            <div className="cg-reserve">
              <div className="hint cg-reserve-t">Étapes à placer :</div>
              <div className="cg-pool">
                {pool.map((i) => (
                  <button key={i} className="cg-chip" onClick={() => place(i)}><span className="cg-e">{RECIPE[i].e}</span> {RECIPE[i].t}</button>
                ))}
              </div>
            </div>
          )}

          {checked && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              {/* Mêmes étoiles que la fin d'un chapitre de Pizza Quest : c'est le même geste
                  (« voilà ce que tu as obtenu »), il doit avoir la même forme. */}
              <div className="pq-fin-stars" aria-label={`${stars} étoile${stars > 1 ? "s" : ""} sur 3`}>
                {[0, 1, 2].map((s) => (
                  <Icon key={s} name="star" size={32} fill={s < stars ? "currentColor" : "none"}
                    className={s < stars ? "on" : ""} style={{ animationDelay: `${s * 0.14}s` }} />
                ))}
              </div>
              <p style={{ fontWeight: 700, margin: "4px 0 0" }}>{correct}/{N} étapes bien placées</p>
              <p className="hint" style={{ marginTop: 2 }}>
                {correct === N ? "Belle recette !"
                  : fini ? "Plus de cœur, le bon ordre est affiché ci-dessus. On garde ton meilleur essai."
                    : `Les cases ❌ sont mal placées. Il te reste ${COEURS_MAX - perdus} essai${COEURS_MAX - perdus > 1 ? "s" : ""}.`}
              </p>
            </div>
          )}
        </div>
        <div className="mfoot">
          {/* « Fermer » disparaît dès qu'un score existe : le bouton principal dit alors
              « Valider (n ★) », et deux boutons au même effet sous deux libellés différents ne
              s'expliquent à personne. */}
          {!checked && <button className="btn ghost" onClick={onClose}>Fermer</button>}
          {/* « Valider » et non « Valider (+90 XP) » : l'XP a été retirée du jeu, ce bouton
              promettait une monnaie qui n'existe plus. Ce sont les ÉTOILES qui comptent, et
              elles sont affichées juste au-dessus. */}
          {!checked
            ? <button className="btn primary" disabled={placed.length !== N} onClick={verifier}>Vérifier</button>
            : fini
              ? <button className="btn primary" onClick={() => onFinish(meilleur)}>Valider ({meilleur} ★)</button>
              : <button className="btn primary" onClick={() => setChecked(false)}>Réessayer</button>}
        </div>
      </div>
    </div>
  );
}
