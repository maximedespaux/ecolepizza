import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.jsx";
import { useEchap } from "../lib/useEchap.js";
import { TRACEURS, NATURES, TOUT_EXEMPTE, TRANSMISSIONS } from "../lib/traceurs.js";

/**
 * CONFIDENTIALITÉ — ce que l'application dépose sur l'appareil, et pourquoi.
 *
 * PAGE PUBLIQUE, accessible sans être connecté : l'information doit pouvoir être lue AVANT de
 * créer un compte, sinon elle arrive après la décision qu'elle est censée éclairer.
 *
 * ELLE SE REND DEPUIS `lib/traceurs.js`, jamais écrite à la main. Une page d'information recopiée
 * une fois devient fausse au premier `localStorage.setItem` ajouté ailleurs — et une information
 * fausse engage l'organisme, ce qui est pire que pas d'information du tout. Un test refuse toute
 * clé utilisée dans le code qui ne serait pas déclarée dans l'inventaire.
 *
 * PAS DE BANDEAU DE CONSENTEMENT, et c'est un constat : tout ce qui est déposé relève de
 * l'exemption « strictement nécessaire au service demandé » (art. 82 de la loi Informatique et
 * Libertés). Le raisonnement complet est dans `lib/traceurs.js`.
 */
/**
 * L'EXPLICATION DE L'ABSENCE DE BANNIÈRE, derrière un clic.
 *
 * Elle occupait un pavé vert en tête de page. C'est l'information la plus contre-intuitive du
 * document, mais elle n'intéresse que ceux qui se posent la question, et six lignes de
 * raisonnement juridique avant la première donnée repoussaient la LISTE, qui est ce qu'on vient
 * lire. Une ligne discrète, ouverte à la demande, dit la même chose sans occuper la place de ce
 * qu'elle commente.
 */
function PourquoiPasDeBanniere({ onClose }) {
  useEchap(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 470 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Pourquoi aucune bannière ?</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          <p style={{ marginTop: 0 }}>
            Nous ne déposons rien à des fins publicitaires, rien qui vous suive d'un site à
            l'autre, et <b>aucun service tiers</b> n'est chargé, ni Google Analytics, ni pixel de
            réseau social, ni régie. Tout ce qui figure sur cette page est strictement nécessaire
            au fonctionnement du service que vous demandez : vous garder connecté, retenir votre
            panier, votre thème, votre progression.
          </p>
          <p style={{ marginBottom: 0 }}>
            La loi dispense ce type de dépôt de votre consentement préalable. Elle ne dispense pas
            de vous dire ce qui est déposé : c'est l'objet de cette page.
          </p>
        </div>
        <div className="mfoot"><button className="btn primary" onClick={onClose}>J'ai compris</button></div>
      </div>
    </div>
  );
}

export default function Confidentialite() {
  const [pourquoi, setPourquoi] = useState(false);
  const parNature = ["cookie", "local", "session"].map((n) => ({
    nature: n, items: TRACEURS.filter((t) => t.nature === n),
  })).filter((g) => g.items.length);

  return (
    <div className="stu-app stu-app-nu">
      <div className="page-legale">
        <Link to="/login" className="btn ghost sm" style={{ marginBottom: 18 }}>← Retour</Link>

        <h1>Confidentialité</h1>
        <p className="lead">
          Ce que cette application enregistre sur votre appareil, à quoi ça sert, et combien de
          temps ça reste.
        </p>

        {/* Le pavé vert a laissé la place à ce déclencheur : l'information reste accessible, mais
            elle ne s'interpose plus entre le titre et la liste, qui est ce qu'on vient lire. */}
        {TOUT_EXEMPTE && (
          <button className="legale-pourquoi" onClick={() => setPourquoi(true)}>
            <Icon name="info" size={14} />
            Aucune bannière à cliquer, et ce n'est pas un oubli.
            <span>Pourquoi ?</span>
          </button>
        )}
        {pourquoi && <PourquoiPasDeBanniere onClose={() => setPourquoi(false)} />}

        {parNature.map(({ nature, items }) => (
          <section key={nature}>
            <h2>{NATURES[nature].titre}, <span className="legale-ou">{NATURES[nature].ou}</span></h2>
            <ul className="legale-liste">
              {items.map((t) => (
                <li key={t.cle}>
                  <code>{t.cle}</code>
                  <b>{t.role}</b>
                  {t.detail && <span className="legale-detail">{t.detail}</span>}
                  <span className="legale-duree">Conservation : {t.duree}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* DEUX QUESTIONS DIFFÉRENTES, et la première version de cette page ne traitait que la
            première : ce qu'on écrit sur l'APPAREIL, et ce qui QUITTE NOS SERVEURS. On peut
            n'avoir aucun traceur tiers et transmettre quand même des données — c'était le cas. */}
        <section>
          <h2>Données transmises à l'extérieur</h2>
          <p>
            Distinct de ce qui précède : il s'agit ici de données qui <b>quittent l'organisme</b>.
            Deux périmètres, et ils ne se confondent pas : ce que l'application envoie d'elle-même,
            et ce que l'école transmet par d'autres moyens. La seconde ligne ci-dessous ne vous
            concerne <b>que si vous y avez consenti</b>.
          </p>
          <ul className="legale-liste">
            {TRANSMISSIONS.map((t) => (
              <li key={t.destinataire} className={t.surConsentement ? "legale-consent" : ""}>
                <code>{t.destinataire} · {t.canal === "application" ? "envoyé par l'application" : "transmis par l'école"}</code>
                <b>{t.pourquoi}</b>
                <span className="legale-detail"><b>Ce qui est envoyé :</b> {t.donnees}</span>
                <span className="legale-detail">{t.qui}</span>
                <span className="legale-duree">{t.quand}</span>
                {/* CETTE LIGNE-LÀ REPOSE SUR VOTRE ACCORD, pas sur la nécessité du service. Le
                    dire explicitement évite qu'un lecteur comprenne que ses coordonnées partent de
                    toute façon — et lui indique où reprendre la main. */}
                {t.surConsentement && (
                  <span className="legale-consent-note">
                    <b>Uniquement avec votre accord.</b> Cette transmission n'a lieu que si vous
                    l'avez explicitement acceptée. Refuser n'a aucune conséquence sur votre
                    formation, et vous pouvez revenir sur votre réponse à tout moment depuis
                    <b> Mon profil → Visibilité</b>. Votre réponse est conservée avec sa date.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Effacer ces données</h2>
          <p>
            Vous pouvez les supprimer à tout moment depuis les réglages de votre navigateur
            (« données de sites », « cookies et données stockées »). Vous serez alors déconnecté et
            vos préférences d'affichage repartiront de zéro : votre <b>progression Pizza Quest</b>,
            votre avatar et votre cadre sont également enregistrés sur nos serveurs et vous seront
            rendus à la prochaine connexion.
          </p>
        </section>

        <section>
          <h2>Vos droits</h2>
          <p>
            Vous disposez d'un droit d'accès, de rectification, d'effacement et d'opposition sur
            les données qui vous concernent. Pour l'exercer, adressez-vous à l'organisme de
            formation qui gère votre dossier.
          </p>
          {/* À COMPLÉTER PAR L'ORGANISME : coordonnées du responsable de traitement, adresse de
              contact pour l'exercice des droits, et — si l'organisme en désigne un — le délégué à
              la protection des données. Laissé en clair plutôt que rempli d'un texte inventé : une
              adresse fausse sur une page de droits est pire qu'une page absente. */}
          <p className="legale-atraiter">
            <b>À compléter avant mise en ligne :</b> coordonnées du responsable de traitement et
            adresse de contact pour l'exercice des droits.
          </p>
        </section>
      </div>
    </div>
  );
}
