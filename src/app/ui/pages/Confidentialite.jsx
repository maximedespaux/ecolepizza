import { Link } from "react-router-dom";
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
export default function Confidentialite() {
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

        {TOUT_EXEMPTE && (
          <div className="legale-encart">
            <b>Aucune bannière à cliquer, et ce n'est pas un oubli.</b>
            <p>
              Nous ne déposons rien à des fins publicitaires, rien qui vous suive d'un site à
              l'autre, et <b>aucun service tiers</b> n'est chargé — ni Google Analytics, ni pixel
              de réseau social, ni régie. Tout ce qui figure ci-dessous est strictement nécessaire
              au fonctionnement du service que vous demandez : vous garder connecté, retenir votre
              panier, votre thème, votre progression.
            </p>
            <p>
              La loi dispense ce type de dépôt de votre consentement préalable. Elle ne dispense
              pas de vous dire ce qui est déposé — c'est l'objet de cette page.
            </p>
          </div>
        )}

        {parNature.map(({ nature, items }) => (
          <section key={nature}>
            <h2>{NATURES[nature].titre} <span className="legale-ou">— {NATURES[nature].ou}</span></h2>
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
            Deux périmètres, et ils ne se confondent pas — ce que l'application envoie d'elle-même,
            et ce que l'école transmet par d'autres moyens.
          </p>
          <ul className="legale-liste">
            {TRANSMISSIONS.map((t) => (
              <li key={t.destinataire} className={t.aCompleter ? "legale-incomplet" : ""}>
                <code>{t.destinataire} · {t.canal === "application" ? "envoyé par l'application" : "transmis par l'école"}</code>
                <b>{t.pourquoi}</b>
                <span className="legale-detail"><b>Ce qui est envoyé :</b> {t.donnees}</span>
                <span className="legale-detail">{t.qui}</span>
                <span className="legale-duree">{t.quand}</span>
                {t.aCompleter && (
                  <span className="legale-atraiter">
                    <b>À compléter avant mise en ligne :</b> quelles données exactement, pour quelle
                    finalité, et sur quelle base légale. Tant que ce n'est pas écrit, cette page ne
                    peut pas être publiée en l'état.
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
