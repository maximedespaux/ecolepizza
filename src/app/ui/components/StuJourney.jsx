import { Link } from "react-router-dom";
import { Icon } from "./Icon.jsx";
import { CADRES, cadreFor, cadreClass, cadreStyle } from "../lib/cadres.js";

/**
 * Le parcours du stagiaire, en tête de son espace.
 *
 * Deux manques que ça comble :
 *
 * 1. LA PROGRESSION ÉTAIT INVISIBLE, et mal comptée. Elle vivait dans la modale de profil,
 *    que personne n'ouvre, et se nourrissait de l'XP du jeu de QCM — donc du temps passé à
 *    cliquer. Elle remonte ici, sur la page d'atterrissage, et ne compte plus que les
 *    formations réellement terminées (cf. lib/cadres.js).
 *
 * 2. L'ACCUEIL NE DISAIT PAS QUOI FAIRE. On arrivait sur deux onglets (« Mes formations » /
 *    « Mes documents ») — une boîte à archives. Il fallait fouiller pour savoir ce qui
 *    attendait. La carte « prochaine étape » désigne UNE action, la plus urgente, et rien
 *    d'autre : signer, répondre au QCM, ou reprendre l'entraînement.
 *
 * L'ordre de priorité est délibéré : ce qui BLOQUE l'école (une signature manquante) passe
 * avant ce qui fait plaisir au stagiaire (le jeu).
 */

/** Décide de l'unique action mise en avant. Retourne null quand il n'y a rien à faire. */
export function prochaineEtape({ enAttente = [], questUnlocked, formations = [] }) {
  const quiz = enAttente.find((d) => d.quiz_id);
  const signature = enAttente.find((d) => d.signable && !d.quiz_id);
  if (signature) return {
    ton: "urgent", ic: "pencil", titre: "Un document attend votre signature",
    detail: signature.title, action: "Consulter et signer", doc: signature,
  };
  if (quiz) return {
    ton: "urgent", ic: "list-checks", titre: "Un QCM vous attend",
    detail: quiz.title, action: "Répondre", doc: quiz,
  };
  if (questUnlocked) return {
    ton: "jeu", ic: "pizza", titre: "Entraînez-vous pour le prochain QCM",
    detail: "Pizza Quest, des questions tirées de vos manuels.", action: "Reprendre l'entraînement", to: "/pizza-quest",
  };
  const encours = formations.find((f) => f.enrolled && !f.finished);
  if (encours) return {
    ton: "calme", ic: "folder-check", titre: "Votre formation en cours",
    detail: encours.program_title, action: "Ouvrir le dossier",
    to: encours.enrollment_id ? `/formations/${encours.enrollment_id}` : null,
  };
  return null;
}

/**
 * Barre de parcours : le cadre obtenu et celui qui suit.
 *
 * Elle ne compte PLUS l'XP du jeu de QCM. Récompenser le temps passé à cliquer sur des
 * questions poussait à farmer ; ici la seule monnaie est la formation réellement terminée —
 * ce qui compte pour une école, et ce qui ne se triche pas.
 */
export function RankBar({ formationsDone = 0 }) {
  const { cadre, suivant } = cadreFor(formationsDone);
  const bas = cadre.min;
  const haut = suivant ? suivant.min : CADRES[CADRES.length - 1].min;
  // Progression DANS le palier courant : les paliers s'écartent (0,1,2,3,5,8), une barre
  // calculée depuis zéro semblerait pleine très tôt puis ne bougerait plus.
  const pct = suivant ? Math.min(100, Math.round(((formationsDone - bas) / (haut - bas)) * 100)) : 100;
  const reste = suivant ? suivant.min - formationsDone : 0;

  return (
    <div className="stu-rank">
      <div className="stu-rank-top">
        <span className="stu-rank-grade">
          <span className={"stu-rank-cadre " + cadreClass(cadre.valeur || cadre.id)}
                  style={cadreStyle(cadre.valeur)} aria-hidden="true" />
          {cadre.id === "aucun" ? "Aucun cadre" : `Cadre ${cadre.nom}`}
        </span>
        <span className="stu-rank-pts">
          {formationsDone} formation{formationsDone > 1 ? "s" : ""} terminée{formationsDone > 1 ? "s" : ""}
        </span>
      </div>
      <div className="stu-rank-bar"><span style={{ width: `${pct}%` }} /></div>
      <div className="stu-rank-foot">
        {suivant
          ? <>Encore <b>{reste} formation{reste > 1 ? "s" : ""}</b> pour le cadre <b>{suivant.nom}</b></>
          : <>Vous avez obtenu le dernier cadre.</>}
      </div>
    </div>
  );
}

/** Carte « prochaine étape » — une seule action, la plus urgente. */
export function NextStep({ etape, onOpenDoc }) {
  if (!etape) return (
    <div className="stu-next ok">
      <span className="stu-next-ic"><Icon name="check-circle" size={22} /></span>
      <div className="stu-next-txt">
        <b>Tout est à jour.</b>
        <span>Rien ne vous attend, vos dossiers sont en bas de page.</span>
      </div>
    </div>
  );
  const contenu = (
    <>
      <span className="stu-next-ic"><Icon name={etape.ic} size={22} /></span>
      <div className="stu-next-txt">
        <span className="stu-next-lbl">Votre prochaine étape</span>
        <b>{etape.titre}</b>
        {etape.detail && <span>{etape.detail}</span>}
      </div>
      <span className="stu-next-go">{etape.action} <Icon name="chevron-right" size={16} /></span>
    </>
  );
  // Un document s'ouvre dans une modale (pas de page dédiée) : il faut donc un bouton, pas
  // un lien — un lien sans destination n'est pas atteignable au clavier.
  if (etape.doc) return (
    <button type="button" className={`stu-next ${etape.ton}`} onClick={() => onOpenDoc?.(etape.doc)}>{contenu}</button>
  );
  if (etape.to) return <Link to={etape.to} className={`stu-next ${etape.ton}`}>{contenu}</Link>;
  return <div className={`stu-next ${etape.ton}`}>{contenu}</div>;
}
