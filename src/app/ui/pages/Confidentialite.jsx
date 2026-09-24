import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.jsx";
import { useEchap } from "../lib/useEchap.js";
import { getOrgCoordonnees } from "../api/apiClient.js";
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
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 470 }}>
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
  /* LE RESPONSABLE DE TRAITEMENT, LU SUR LA FICHE ORGANISME (endpoint public, sans connexion).
     Le RGPD (art. 13) impose de le nommer ici ; le recopier à la main sur la page en ferait une
     information qui dérive de la fiche réelle. Tant que la lecture n'a pas répondu — ou si un
     champ manque — on garde le repli honnête plus bas, jamais une adresse inventée. */
  const [org, setOrg] = useState(null);
  useEffect(() => { getOrgCoordonnees().then((r) => setOrg(r.data)).catch(() => {}); }, []);
  const responsable = (() => {
    if (!org) return null;
    const nom = org.legal_name || org.short_name;
    const postal = [org.address, [org.zip_code, org.town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    // Il faut une IDENTITÉ et au moins un moyen de contact, sinon le repli « à compléter » reste.
    if (!nom || !(org.email || postal)) return null;
    return { nom, manager: org.manager, email: org.email, phone: org.phone, postal };
  })();
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
                    <b>Vos coordonnées, uniquement avec votre accord.</b> Ce sont vos coordonnées
                    (adresse e-mail, téléphone) qui reposent sur votre consentement : elles ne
                    partent que si vous l'avez explicitement accepté. Refuser les retire — mais
                    votre nom et votre prénom restent transmis aux partenaires de l'école ; seule
                    une personne jamais sollicitée ne figure nulle part. Refuser n'a aucune
                    conséquence sur votre formation, et vous pouvez revenir sur votre réponse à tout
                    moment depuis<b> Mon profil → Confidentialité</b>. Votre réponse est conservée
                    avec sa date.
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
          {/* Le responsable de traitement vient de la FICHE ORGANISME, pas d'un texte recopié : une
              adresse écrite à la main dériverait de la réalité, et une adresse fausse sur une page
              de droits est pire qu'une page absente. Tant qu'une identité et un contact ne sont pas
              renseignés, le repli ci-dessous le dit — et indique OÙ les renseigner. */}
          {responsable ? (
            <p className="legale-responsable">
              <b>Responsable de traitement :</b> {responsable.nom}
              {responsable.manager ? `, représenté par ${responsable.manager}` : ""}.{" "}
              Pour exercer vos droits, écrivez à{" "}
              {responsable.email
                ? <a href={`mailto:${responsable.email}`}>{responsable.email}</a>
                : "l'organisme"}
              {responsable.postal ? `, ou par courrier : ${responsable.postal}` : ""}
              {responsable.phone ? ` — tél. ${responsable.phone}` : ""}.
            </p>
          ) : (
            <p className="legale-atraiter">
              <b>À compléter :</b> les coordonnées du responsable de traitement et de contact pour
              l'exercice des droits ne sont pas encore renseignées. Ajoutez-les dans
              <b> Paramètres → Organisme</b> (raison sociale, e-mail, adresse) : elles s'afficheront
              ici automatiquement.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
