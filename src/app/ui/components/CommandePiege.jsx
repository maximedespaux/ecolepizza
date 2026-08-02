import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { useEchap } from "../lib/useEchap.js";

/**
 * LA COMMANDE PIÈGE — un client commande avec une contrainte, tu réponds en professionnel.
 *
 * CE QU'IL ENSEIGNE, ET POURQUOI CE N'EST PAS UN QCM DE PLUS. Le QCM demande « quels sont les
 * 14 allergènes » ; le comptoir demande « cette dame est allergique aux fruits à coque, tu fais
 * quoi ? ». Entre les deux il y a un RÉFLEXE, et c'est lui qui manque quand ça arrive pour de
 * vrai — au coup de feu, sans le temps de réfléchir.
 *
 * ⚠️ LA SOURCE, ET SA LIMITE. Tout ce qui est affirmé ici vient de la fiche « Les allergènes »
 * du manuel (`lib/notions.js`) : les 14 allergènes à déclaration obligatoire, l'obligation
 * d'information, les contaminations croisées, les fiches recettes. Les seuls allergènes NOMMÉS
 * par produit sont ceux que le manuel donne lui-même dans son exemple — « Une Reine : gluten
 * (la pâte), lait (la mozzarella), et souvent des sulfites (le jambon) ».
 *
 * `garnitures.js` NE DÉCLARE AUCUN ALLERGÈNE : la table produit → allergène n'existe nulle part
 * dans le projet. On ne l'a pas inventée, et c'est délibéré. Sur un sujet réglementaire, une
 * correspondance approximative enseignée avec l'autorité de l'école est PIRE que pas de jeu :
 * un stagiaire à qui l'on dit qu'un pepperoni ne contient pas de soja répétera l'erreur à un
 * client, et l'erreur dépend du fournisseur. D'où des situations qui portent sur la CONDUITE À
 * TENIR — vérifier, informer, refuser, prévenir la contamination — et non sur un devinez-quoi
 * produit par produit. Le jour où l'école valide sa table d'allergènes, on ajoute la seconde
 * série de situations, celle qui manque.
 */

/* Chaque situation : ce que dit le client, les réponses possibles, la bonne, et POURQUOI —
   avec la section du manuel qui la fonde. Se tromper doit apprendre quelque chose (cf.
   l'en-tête de PizzaQuest : chaque question porte son explication et sa page de manuel). */
const SITUATIONS = [
  {
    client: "« Je suis cœliaque. Vous avez une pizza sans gluten ? »",
    choix: [
      "Oui, je retire la farine de blé de la pâte",
      "Non — et je lui explique pourquoi je ne peux pas garantir l'absence de gluten",
      "Oui, je prends la pâte habituelle et j'enlève la croûte",
    ],
    bonne: 1,
    pourquoi: "Le gluten EST la pâte : il n'y a rien à « retirer ». Et même avec une farine sans "
      + "gluten, un four et un plan de travail où l'on manipule de la farine de blé toute la journée "
      + "exposent à une contamination croisée. Un cœliaque ne joue pas avec ça.",
    source: "Manuel — Les allergènes · Points de vigilance (contaminations croisées)",
  },
  {
    client: "« Mon fils est allergique aux fruits à coque. La Reine, c'est bon pour lui ? »",
    choix: [
      "Oui, il n'y a pas de fruits à coque dans une Reine",
      "Je vérifie la fiche recette avant de répondre",
      "Je lui dis de demander à son médecin",
    ],
    bonne: 1,
    pourquoi: "La réponse est probablement « oui », mais on ne répond pas de mémoire sur un "
      + "allergène : c'est la fiche recette qui fait foi, et elle seule connaît le fournisseur du "
      + "mois. Le manuel en fait une bonne pratique explicite — « fiches recettes avec allergènes ».",
    source: "Manuel — Les allergènes · Bonnes pratiques",
  },
  {
    client: "« Vous affichez les allergènes quelque part ? Je ne vois rien sur la carte. »",
    choix: [
      "Ce n'est obligatoire qu'en restauration assise",
      "La liste est disponible sur demande, et un affichage le dit",
      "On les donne à l'oral, c'est suffisant",
    ],
    bonne: 1,
    pourquoi: "L'information doit être écrite, claire et accessible — et un affichage doit dire "
      + "qu'elle existe : « La liste des allergènes présents dans nos plats est disponible sur "
      + "demande. » Carte, tableau, classeur ou support numérique, au choix. L'oral seul ne suffit pas.",
    source: "Manuel — Les allergènes · Modalités d'affichage",
  },
  {
    client: "Tu viens de trancher du saumon. Commande suivante : une Reine pour un allergique au poisson.",
    choix: [
      "Je change de planche et je me lave les mains",
      "Je rince la planche à l'eau claire",
      "Il n'y a pas de poisson dans une Reine, je continue",
    ],
    bonne: 0,
    pourquoi: "C'est le cas d'école du manuel — « attention à la planche qui a servi au poisson "
      + "juste avant ». Une pizza sans poisson préparée sur une planche à poisson contient du "
      + "poisson. Un rinçage n'enlève pas une protéine allergène.",
    source: "Manuel — Les allergènes · exemple de la Reine, et Points de vigilance",
  },
  {
    client: "« Je ne supporte pas le lactose. Une Marinara, c'est possible ? »",
    choix: [
      "Non, toutes nos pizzas ont de la mozzarella",
      "Oui — la Marinara n'en porte pas, et je le confirme sur la fiche",
      "Oui, je remplace la mozzarella par de la crème",
    ],
    bonne: 1,
    pourquoi: "La Marinara est justement la pizza sans fromage — tomate, ail, origan, huile. "
      + "C'est la réponse la plus simple à une contrainte lait, et elle ne demande aucune "
      + "improvisation. La crème, elle, est un produit laitier : la proposer serait une faute.",
    source: "Manuel — Les allergènes (lait) · fiche recette",
  },
  {
    client: "« Sans sulfites, s'il vous plaît. » Ta pizza du jour porte du jambon et du vinaigre balsamique.",
    choix: [
      "Les sulfites ne sont pas un allergène à déclarer",
      "Les deux en contiennent souvent : je vérifie et je propose autre chose",
      "Je retire seulement le balsamique",
    ],
    bonne: 1,
    pourquoi: "Les sulfites font partie des 14 à déclaration obligatoire, et le manuel cite "
      + "précisément le vinaigre balsamique et les charcuteries. Retirer le balsamique en laissant "
      + "le jambon ne règle donc que la moitié du problème.",
    source: "Manuel — Les 14 allergènes à déclaration obligatoire",
  },
  {
    client: "Un extra vient d'être embauché. Il prend seul une commande « allergie arachide ».",
    choix: [
      "C'est bon, il a la liste sous les yeux",
      "Je reprends la commande moi-même et je le forme",
      "Je lui dis de refuser toutes les commandes avec allergie",
    ],
    bonne: 1,
    pourquoi: "« Formation des équipes » et « personnel formé » sont deux points distincts du "
      + "manuel, et ce n'est pas un hasard : une liste ne remplace pas quelqu'un qui sait la lire. "
      + "Refuser systématiquement n'est pas non plus une réponse — c'est renoncer à servir.",
    source: "Manuel — Les allergènes · Bonnes pratiques et Points de vigilance",
  },
  {
    client: "« Vous aviez dit que la pâte à la châtaigne était sans gluten. »",
    choix: [
      "C'est exact, la châtaigne n'en contient pas",
      "La substitution ne remplace qu'une PART de la farine de blé : le gluten reste",
      "Je vérifie le sac de farine",
    ],
    bonne: 1,
    pourquoi: "Une substitution remplace une partie du poids de farine de blé par une autre "
      + "farine, à poids initial constant. Le blé reste majoritaire : la pâte contient toujours du "
      + "gluten. Confondre « substitution » et « éviction » est l'erreur qui envoie un cœliaque aux urgences.",
    source: "Manuel — Les substitutions · Définition",
  },
];

const NOTE = (bon, total) => (bon === total ? 3 : bon >= Math.ceil(total * 0.75) ? 2 : bon >= Math.ceil(total / 2) ? 1 : 0);

export default function CommandePiege({ onClose, onFinish }) {
  useEchap(onClose);
  /* Tirage au sort de l'ordre, mais TOUTES les situations sont jouées : en retirer au hasard
     ferait deux parties incomparables, et la note n'aurait plus de sens d'une fois sur l'autre. */
  const ordre = useMemo(() => {
    const a = SITUATIONS.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }, []);
  const [idx, setIdx] = useState(0);
  const [choisi, setChoisi] = useState(null);
  const [bons, setBons] = useState(0);
  const [fini, setFini] = useState(false);

  const s = SITUATIONS[ordre[idx]];
  const repondu = choisi !== null;
  const juste = repondu && choisi === s.bonne;
  const total = SITUATIONS.length;
  const stars = NOTE(bons, total);

  function repondre(i) {
    if (repondu) return;
    setChoisi(i);
    if (i === s.bonne) setBons((b) => b + 1);
  }
  function suivant() {
    if (idx + 1 >= total) { setFini(true); return; }
    setIdx((i) => i + 1); setChoisi(null);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="shield" size={17} /> La commande piège
          </h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        {!fini ? (
          <div className="mbody">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div className="pq-progress"><span style={{ width: `${(idx / total) * 100}%`, background: "var(--red)" }} /></div>
              <span className="hint" style={{ whiteSpace: "nowrap" }}>{idx + 1} / {total}</span>
            </div>

            <p className="cp-client">{s.client}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.choix.map((c, i) => {
                let cls = "pq-choice";
                if (repondu) { if (i === s.bonne) cls += " ok"; else if (i === choisi) cls += " ko"; }
                return <button key={i} className={cls} onClick={() => repondre(i)} disabled={repondu}>{c}</button>;
              })}
            </div>

            {/* L'EXPLICATION EST LE JEU. Sans elle on retient qu'on s'est trompé, pas pourquoi —
                et c'est le pourquoi qu'on ressortira au comptoir. */}
            {repondu && (
              <div className={"cp-expl" + (juste ? " ok" : "")}>
                <b>{juste ? "Exact." : "Non."}</b> {s.pourquoi}
                <span className="cp-src"><Icon name="book-open" size={12} /> {s.source}</span>
              </div>
            )}

            {repondu && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button className="btn primary" onClick={suivant} autoFocus>
                  {idx + 1 >= total ? "Voir le résultat" : "Situation suivante"} <Icon name="chevron-right" size={15} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mbody" style={{ textAlign: "center", padding: "24px 20px" }}>
            <div className="pq-fin-stars" aria-label={`${stars} étoile${stars > 1 ? "s" : ""} sur 3`}>
              {[0, 1, 2].map((n) => (
                <Icon key={n} name="star" size={38} fill={n < stars ? "currentColor" : "none"}
                  className={n < stars ? "on" : ""} style={{ animationDelay: `${n * 0.14}s` }} />
              ))}
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{bons}/{total} bonnes réponses</p>
            <p className="hint" style={{ marginTop: 0 }}>
              {stars === 3 ? "Sans faute — c'est exactement le réflexe qu'on attend au comptoir."
                : stars === 2 ? "Bien. Relis les points de vigilance : la contamination croisée revient souvent."
                  : "Reprends la fiche « Les allergènes » dans Notions, puis retente."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button className="btn ghost" onClick={onClose}>Fermer</button>
              <button className="btn primary" onClick={() => onFinish(stars)}>
                <Icon name="check" size={15} /> Valider
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
