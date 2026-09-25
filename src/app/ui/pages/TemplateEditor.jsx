import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildExtensions } from "../lib/editorConfig.js";
import RichToolbar from "../components/RichToolbar.jsx";
import { getTokenCatalog, getTemplateBody, saveTemplateBody, templatePreviewPdfUrl, templatePageMetrics } from "../api/apiClient.js";
import StatusMessage from "../components/StatusMessage.jsx";
import FieldSettingsPanel from "../components/FieldSettingsPanel.jsx";
import CustomTokenManager from "../components/CustomTokenManager.jsx";
import { categoryChipStyle, categoryAccent, registerTokenGroups, registerAnciensLibelles, jetonsInconnus } from "../lib/categoryColors.js";
import { aUnCadreStagiaire } from "../lib/signatures.js";

const EMPTY = /^\s*(<p>(\s|<br\/?>)*<\/p>\s*)?$/i; // corps « vide »
const clean = (html) => (EMPTY.test(html || "") ? "" : html);

/**
 * Tableau des articles d'une facture, prêt à l'emploi.
 *
 * LES MARQUEURS SONT DANS DES CELLULES, et ce n'est pas un détail. L'éditeur est un
 * ProseMirror : sa grammaire interdit du texte directement dans un `<tbody>`. Un gabarit écrit
 * « <tbody>{#Articles}<tr>… » voit ses marqueurs REMONTÉS hors du tableau à l'insertion — ils
 * atterrissent dans un paragraphe au-dessus, et la ligne ne se répète jamais. Constaté dans
 * l'éditeur réel, pas déduit.
 *
 * `{#Articles}` ouvre donc la première cellule et `{/Articles}` ferme la dernière : le
 * rendu répète la LIGNE qui les contient (cf. expandListBlocks).
 *
 * L'en-tête est une ligne à part, hors des marqueurs — sinon elle se répéterait à chaque
 * article. C'est l'erreur classique de ce genre de gabarit, et la raison pour laquelle on
 * l'insère déjà monté plutôt que de laisser l'écrire à la main.
 */
// Puce de jeton, telle que l'éditeur la sérialise (cf. TokenNode) : au rendu, le moteur la
// remplace par la valeur — dans un bloc {#Articles}/{#Stagiaires}, ligne par ligne. On insère
// donc des PUCES nommées, jamais du {Clé} brut (qui s'affiche « {Clé} » dans l'éditeur et, hors
// bloc, resterait tel quel au rendu).
const pill = (key, label) => `<span data-token="${key}" data-label="${label || key}">${label || key}</span>`;

const BLOC_ARTICLES = '<table><tbody><tr>'
  + '<th>Désignation</th><th>Qté</th><th>P.U. HT</th><th>Montant HT</th><th>TVA</th><th>Total TTC</th>'
  + '</tr><tr>'
  + `<td>{#Articles}${pill('Désignation')}</td><td>${pill('Quantité', 'Qté')}</td><td>${pill('Prix unitaire HT', 'P.U. HT')}</td>`
  + `<td>${pill('Montant HT')}</td><td>${pill('Taux TVA', 'TVA')}</td><td>${pill('Montant TTC', 'Total TTC')}{/Articles}</td>`
  + '</tr></tbody></table>';

// Bloc « par stagiaire » prêt à l'emploi : les jetons par stagiaire sont des PUCES, remplies
// ligne par ligne par le moteur (expandGroupBlocks). Les marqueurs {#Stagiaires}/{/Stagiaires}
// restent en texte : ils délimitent le bloc.
const BLOC_STAGIAIRES = `{#Stagiaires}${pill('N°')}. ${pill('Personne')}, ${pill('OPCO')}<br>{/Stagiaires}`;

// Jetons résolus PAR STAGIAIRE à l'intérieur d'un bloc {#Stagiaires}…{/Stagiaires}
// (documents de groupe / entreprise). Insérés en TEXTE brut.
/* LA MÊME IDENTITÉ D'EXEMPLE que la palette (M. Jean DUPONT, BORDEAUX en capitales, AKTO), et TOUT ce
   que la ligne sait remplir (stagiaireRowTokens, src/api/lib/tokens.js) : l'adresse, le code postal et
   le lieu de naissance s'y remplissaient sans pouvoir s'insérer (relevé le 2026-09-26). */
const GROUP_ROW_TOKENS = [
  { key: "N°", label: "N°", sample: "1" },
  { key: "Personne", label: "Nom complet", sample: "M. Jean DUPONT" },
  { key: "Civilité", label: "Civilité", sample: "M." },
  { key: "Prénom", label: "Prénom", sample: "Jean" },
  { key: "Nom", label: "Nom", sample: "DUPONT" },
  { key: "Email", label: "E-mail", sample: "jean.dupont@email.fr" },
  { key: "Téléphone", label: "Téléphone", sample: "06 12 34 56 78" },
  { key: "OPCO", label: "OPCO", sample: "AKTO" },
  { key: "Adresse", label: "Adresse complète", sample: "12 rue des Fours, 33000 BORDEAUX" },
  { key: "CP", label: "Code postal", sample: "33000" },
  { key: "Ville", label: "Ville", sample: "BORDEAUX" },
  { key: "D_Naissance", label: "Date de naissance", sample: "15/04/1990" },
  { key: "Lieu naissance", label: "Lieu de naissance", sample: "TOULOUSE" },
];

/* L'info-bulle d'un jeton « par stagiaire ». Elle dit OÙ il fonctionne — c'est la seule chose qui
   le distingue du jeton du groupe Stagiaire de même nom : entre les marqueurs, chaque stagiaire de
   la liste tour à tour ; ailleurs, le stagiaire du dossier, qu'un document d'entreprise n'a pas. */
function descParStagiaire(t) {
  const quoi = t.key === "N°" ? "Le numéro d'ordre (1, 2, 3…)" : `« ${t.label} »`;
  return `${quoi} de chaque stagiaire, tour à tour. À placer entre {#Stagiaires} et {/Stagiaires} : `
    + "en dehors, Prénom, Nom… désignent le stagiaire du dossier — et un document d'entreprise n'en a pas.";
}

/* LE CADRE DE L'ENTREPRISE a une clé FIXE, et non dérivée de son libellé : `representant`, la
   case que remplissent l'espace du représentant (« signer avec mon cachet ») et le lien de
   signature envoyé à l'entreprise. Dérivé du libellé comme les autres blocs nommés, « Cachet de
   l'entreprise » aurait donné `sig:cachetdelentreprise` — un cadre que personne ne remplit. */
const SIG_ENTREPRISE = { key: "sig:representant", label: "Cachet de l'entreprise" };
/* Le cadre de l'organisme : le jeton intégré « Signature organisme ». Il n'était proposé que dans
   le groupe Organisme — et seulement si le champ était activé dans Champs documents : le seul
   signataire sans bloc dans « Signatures ». */
const SIG_ORGANISME = { key: "Signature organisme", label: "Signature de l'organisme" };
/* LE CADRE DU STAGIAIRE : le jeton intégré « Signature stagiaire », rempli quand il signe depuis son
   espace. Relevé le 2026-09-25 : depuis que les blocs nommés « Stagiaire 1…4 » ne s'offrent plus que
   sur un modèle « Externe » (commit 483a06e7), la signature du stagiaire n'était plus qu'une puce du
   groupe « Signature », replié — et le modèle « Contrat », que le stagiaire signe, n'avait AUCUN cadre
   pour elle : le contrat signé sortait sans sa signature visible. */
const SIG_STAGIAIRE = { key: "Signature stagiaire", label: "Signature du stagiaire" };
/* Le cadre de l'intervenant — du signataire EXTERNE : clé FIXE, celle que remplissent l'espace de
   l'intervenant et le lien « externe » (cf. CRENEAU_INTERVENANT, documentSession.controller). Il
   remplace le bloc nommé « Intervenant » d'autrefois, proposé sur tous les modèles alors que
   personne ne signe un modèle où « Externe » n'est pas coché. */
const SIG_INTERVENANT = { key: "sig:intervenant", label: "Signature de l'intervenant" };

/* Le registre des puces (couleur, libellé, jeton connu ou non — lib/categoryColors.js), rempli depuis
   la réponse de la palette. Les jetons CONNUS mais non proposés (un modèle ancien en porte) y entrent
   aussi : reconnus, pas « inconnus » ; et les libellés RETIRÉS, que l'éditeur remplace à l'affichage. */
function enregistrerCatalogue(cat) {
  registerTokenGroups([...(cat.data || []), ...(cat.connus || [])]);
  registerAnciensLibelles(cat.anciens || {});
}

// Bascule « bord à bord » (sans marge) d'une zone.
function BleedToggle({ on, onChange }) {
  return (
    <label className="bleed-tog" title="Sans marge : le contenu occupe toute la largeur / le bord de la page">
      <input type="checkbox" checked={on} onChange={onChange} /> bord à bord
    </label>
  );
}

function TemplateEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState(null);
  /* UN MODÈLE PROPOSÉ, PAS ENCORE ENREGISTRÉ (le « Droit à l'image », sur une page blanche) : le
     serveur le dit, l'écran le montre jusqu'au premier enregistrement. Sans ce mot, on croirait le
     modèle déjà en service alors que la liste des modèles dit toujours « à créer ». */
  const [propose, setPropose] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfErr, setPdfErr] = useState(null);
  const [bleed, setBleed] = useState({ header: false, body: false, footer: false }); // « bord à bord » par zone
  const toggleBleed = (k) => setBleed((p) => ({ ...p, [k]: !p[k] }));
  // Papier à en-tête automatique : ON par défaut. Un modèle qui met déjà l'identité dans son
  // corps (facture…) peut le couper pour ne pas avoir le nom de l'organisme en double, tout en haut.
  const [noLetterhead, setNoLetterhead] = useState(false);
  const [modeleEntreprise, setModeleEntreprise] = useState(false); // company_level : document de GROUPE (signé par le représentant)
  const [entrepriseSigne, setEntrepriseSigne] = useState(false); // « Entreprise » signataire : le représentant signe AUSSI un document de stagiaire
  const [signeParExterne, setSigneParExterne] = useState(false); // « Externe » coché : cadre « Signature de l'intervenant »
  const [signeParStagiaire, setSigneParStagiaire] = useState(false); // « Stagiaire » coché : son cadre doit figurer au modèle
  const [openGroups, setOpenGroups] = useState({});
  const [active, setActive] = useState(null); // éditeur ayant le focus (cible palette/toolbar)
  const [sigLabel, setSigLabel] = useState(""); // libellé d'un bloc de signature personnalisé
  const [showFields, setShowFields] = useState(false); // modale « Champs documents »
  const [showCustom, setShowCustom] = useState(false); // modale « Jetons personnalisés »
  const fieldsRef = useRef(null);
  const [, force] = useState(0);

  // Info-bulle GÉNÉREUSE au survol d'une puce : le libellé reste court, l'explication complète
  // (à quoi sert le jeton, un exemple, sa clé) s'affiche en grand. Positionnée en `fixed` pour
  // ne pas être rognée par le défilement de la palette.
  const [tip, setTip] = useState(null); // { text, x, y }
  const texteTip = (t, group) => {
    const l = [t.desc || t.label];
    if (group === "Ligne de facture") l.push("À placer DANS le tableau des articles.");
    else if (group === "Ligne de règlement") l.push("À placer DANS le bloc des règlements.");
    if (t.sample) l.push("Exemple : " + t.sample);
    l.push("Jeton : {" + t.key + "}");
    return l.join("\n");
  };
  const montrerTip = (e, t, group) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text: texteTip(t, group), x: r.left + r.width / 2, y: r.top });
  };
  const cacherTip = () => setTip(null);

  const opts = (cls) => ({
    extensions: buildExtensions(),
    content: "",
    editorProps: { attributes: { class: cls } },
    onFocus: ({ editor }) => setActive(editor),
    onSelectionUpdate: () => force((n) => n + 1), // rafraîchit l'état actif de la barre
    onUpdate: () => force((n) => n + 1),          // recalcule le repère de fin de page
  });
  const header = useEditor(opts("doc-canvas hf"));
  const body = useEditor(opts("doc-canvas"));
  const footer = useEditor(opts("doc-canvas hf"));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, res] = await Promise.all([getTokenCatalog(slug), getTemplateBody(slug)]);
        if (!alive) return;
        const d = res.data || {};
        const entrepriseSigneD = !!d.company_level || (Array.isArray(d.signers) && d.signers.includes("ENTREPRISE"));
        setCatalog(cat.data || []);
        // Enregistre clé→catégorie AVANT d'insérer le contenu : les puces se colorent alors
        // par catégorie dès leur premier rendu (cf. TokenView / categoryColors).
        enregistrerCatalogue(cat);
        // Premier groupe ouvert par défaut — ET « Entreprise » quand le représentant signe : le
        // cadre « Cachet de l'entreprise » y vit désormais, autant qu'il se voie sans déplier.
        setOpenGroups(Object.fromEntries((cat.data || []).map((g, i) => [g.group, i === 0 || (entrepriseSigneD && g.group === "Entreprise")])));
        setPropose(d.propose || null);
        if (body) body.commands.setContent(d.body_html || "<p></p>");
        if (header) header.commands.setContent(d.header_html || "");
        if (footer) footer.commands.setContent(d.footer_html || "");
        const bl = (d.layout && d.layout.bleed) || {};
        setBleed({ header: !!bl.header, body: !!bl.body, footer: !!bl.footer });
        setNoLetterhead(!!(d.layout && d.layout.noLetterhead));
        setModeleEntreprise(!!d.company_level);
        setEntrepriseSigne(Array.isArray(d.signers) && d.signers.includes("ENTREPRISE"));
        setSigneParExterne(Array.isArray(d.signers) && d.signers.includes("EXTERNAL"));
        setSigneParStagiaire(Array.isArray(d.signers) && d.signers.includes("STAGIAIRE"));
      } catch (e) { if (alive) setStatus({ type: "error", message: e.message }); }
    })();
    return () => { alive = false; };
  }, [slug, body, header, footer]);

  // Aperçu PDF fidèle : on rend le modèle en cours d'édition côté serveur (mêmes
  // en-tête/pied répétés sur chaque page que le document final) et on l'affiche en iframe.
  useEffect(() => {
    if (!showPreview) return undefined;
    let alive = true; let created = null;
    setPdfLoading(true); setPdfErr(null);
    templatePreviewPdfUrl(slug, {
      body_html: body?.getHTML() || "<p></p>",
      header_html: clean(header?.getHTML()),
      footer_html: clean(footer?.getHTML()),
      layout: { bleed, noLetterhead },
    })
      .then((url) => { if (!alive) { URL.revokeObjectURL(url); return; } created = url; setPdfUrl(url); })
      .catch((e) => { if (alive) setPdfErr(e.message); })
      .finally(() => { if (alive) setPdfLoading(false); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, bleed, noLetterhead]);

  const target = active || body;

  // Repère de fin de page : la zone utile du corps (mm) est calculée par le SERVEUR,
  // exactement comme le rendu PDF (hauteur des bandeaux, bord à bord…). On la (re)demande
  // — débouncée — à chaque changement d'en-tête/pied/bord à bord.
  const PX_PER_MM = 660 / 174;   // colonne page ≈ 174 mm sur ~660 px
  const BODY_RATIO = 0.94;       // ligne éditeur légèrement plus serrée que le PDF
  const [pageMm, setPageMm] = useState(237); // zone utile par défaut (mm)
  const hHTML = clean(header?.getHTML());
  const fHTML = clean(footer?.getHTML());
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      templatePageMetrics(slug, { header_html: hHTML, footer_html: fHTML, layout: { bleed } })
        .then((r) => { if (alive && r?.data?.contentMm) setPageMm(r.data.contentMm); })
        .catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [slug, hHTML, fHTML, bleed]);
  const pageContentPx = Math.round(pageMm * PX_PER_MM * BODY_RATIO);

  // Repères de fin de page superposés au corps : une ligne à chaque hauteur de page, mais
  // RÉINITIALISÉE à chaque saut de page manuel (qui démarre une nouvelle page).
  const bodyZoneRef = useRef(null);
  const pbInnerRef = useRef(null);
  const [pbView, setPbView] = useState({ top: 0, left: 0, width: 0, height: 0, lines: [] });
  useEffect(() => {
    if (showPreview || !body) return undefined;
    const syncScroll = () => {
      const el = body.view?.dom;
      if (el && pbInnerRef.current) pbInnerRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
    };
    const compute = () => {
      const el = body.view?.dom;
      const bz = bodyZoneRef.current;
      if (!el || !bz) return;
      const bzRect = bz.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const lines = [];
      if (pageContentPx >= 40) {
        // Un saut de page manuel occupe lui-même une ligne : la nouvelle page reprend
        // APRÈS le saut (bord bas), pas à son sommet.
        const breaks = Array.from(el.querySelectorAll(".doc-pagebreak"))
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { top: r.top - elRect.top + el.scrollTop, bottom: r.bottom - elRect.top + el.scrollTop };
          })
          .sort((a, b) => a.top - b.top);
        const H = el.scrollHeight;
        let start = 0, bi = 0, guard = 0;
        while (start < H && guard++ < 100) {
          while (bi < breaks.length && breaks[bi].top <= start + 1) bi++;
          const nb = bi < breaks.length ? breaks[bi] : null;
          const autoEnd = start + pageContentPx;
          if (nb && nb.top < autoEnd) { start = nb.bottom; bi++; } // saut manuel : nouvelle page après le saut
          else { lines.push(Math.round(autoEnd)); start = autoEnd; } // fin de page automatique
        }
      }
      setPbView({ top: elRect.top - bzRect.top, left: elRect.left - bzRect.left, width: el.clientWidth, height: el.clientHeight, lines });
      syncScroll();
    };
    let ro = null; let scrollEl = null;
    const setup = () => {
      compute();
      const el = body.view?.dom;
      if (el && !scrollEl) { // vue montée : on attache l'observateur et le défilement
        scrollEl = el;
        ro = new ResizeObserver(compute);
        ro.observe(el);
        el.addEventListener("scroll", syncScroll, { passive: true });
      }
    };
    setup();
    const t1 = setTimeout(setup, 350);   // la vue peut ne pas être montée au 1er passage
    const t2 = setTimeout(setup, 1000);
    const onUp = () => compute();
    body.on("update", onUp);
    return () => {
      clearTimeout(t1); clearTimeout(t2); body.off("update", onUp);
      if (ro) ro.disconnect();
      if (scrollEl) scrollEl.removeEventListener("scroll", syncScroll);
    };
  }, [showPreview, body, pageContentPx]);

  // Recherche dans la palette : filtre les jetons, garde les groupes qui en contiennent, et
  // les ouvre tous — chercher puis devoir déplier n'aurait aucun sens.
  const [rechJeton, setRechJeton] = useState("");
  const catalogFiltre = useMemo(() => {
    const q = rechJeton.trim().toLowerCase();
    if (!q) return catalog;
    const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (catalog || [])
      .map((g) => ({ ...g, tokens: g.tokens.filter((t) => norm(t.label).includes(norm(q)) || norm(t.key).includes(norm(q))) }))
      .filter((g) => g.tokens.length);
  }, [catalog, rechJeton]);

  // Les puces dont la clé n'est ni proposée ni reconnue — recalculé à chaque rendu, comme l'avertissement
  // du cadre de signature (l'éditeur se re-rend à chaque frappe, cf. `force`).
  const inconnus = catalog.length ? jetonsInconnus([header?.getHTML(), body?.getHTML(), footer?.getHTML()].join("")) : [];

  function insertToken(t) {
    target?.chain().focus().insertToken({ token: t.key, label: t.label }).run();
  }
  // Insertion de TEXTE brut (jetons de bloc « par stagiaire » : {#Stagiaires}…{/Stagiaires}
  // et jetons internes {Personne}, {OPCO}… résolus par stagiaire à la génération).
  function insertRaw(str) {
    target?.chain().focus().insertContent(str).run();
  }
  // Bloc de signature nommé : jeton « sig:<clé> » signé indépendamment par la personne attribuée.
  const sigKey = (label) => "sig:" + String(label || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 40);
  function insertSignature(label) {
    const lbl = String(label || "").trim();
    if (!lbl) return;
    target?.chain().focus().insertToken({ token: sigKey(lbl), label: lbl }).run();
  }
  const SIG_PRESETS = ["Jury 1", "Jury 2", "Président du jury", "Formateur", "Stagiaire 1", "Stagiaire 2", "Stagiaire 3", "Stagiaire 4"];
  function onDrop(ed) {
    return (e) => {
      const rawText = e.dataTransfer.getData("application/x-rawtoken"); // jeton texte (bloc / par stagiaire)
      const raw = e.dataTransfer.getData("application/x-token");        // jeton « puce »
      if (!ed || (!raw && !rawText)) return;
      e.preventDefault();
      const pos = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const at = pos ? pos.pos : ed.state.selection.to;
      if (rawText) { ed.chain().focus().insertContentAt(at, rawText).run(); return; }
      const t = JSON.parse(raw);
      ed.chain().focus().insertTokenAt(at, { token: t.key, label: t.label }).run();
    };
  }
  // Catalogue enrichi pour le gestionnaire de JETONS PERSO : on ajoute les jetons
  // « par stagiaire » comme références insérables dans un modèle de jeton personnalisé
  // (ils prennent leur sens dans un bloc {#Stagiaires}…{/Stagiaires}).
  const customCatalog = useMemo(() => {
    const rowToks = GROUP_ROW_TOKENS.map((t) => ({ key: t.key, label: t.label, sample: t.sample || "" }));
    const cat = (catalog || []).map((g) => (g.group === "Groupe entreprise" ? { ...g, tokens: [...g.tokens, ...rowToks] } : g));
    if (!cat.some((g) => g.group === "Groupe entreprise")) cat.push({ group: "Groupe entreprise", tokens: rowToks });
    return cat;
  }, [catalog]);

  // Recharge la palette (les champs proposés = ceux activés dans Champs documents). Le registre
  // suit : un champ qu'on vient d'activer ne doit pas s'insérer en puce « inconnue ».
  const reloadCatalog = () => getTokenCatalog(slug).then((cat) => { enregistrerCatalogue(cat); setCatalog(cat.data || []); }).catch(() => {});

  async function save() {
    if (!body) return;
    setSaving(true); setStatus(null);
    try {
      await saveTemplateBody(slug, {
        body_html: body.getHTML(),
        header_html: clean(header?.getHTML()),
        footer_html: clean(footer?.getHTML()),
        layout: { bleed, noLetterhead },
      });
      setStatus({ type: "success", message: "Modèle enregistré." });
      setPropose(null);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="tpl-editor">
      <div className="tpl-editor-sticky">
        <div className="tpl-editor-head">
          <button className="btn ghost sm" onClick={() => navigate("/modeles")}>← Modèles</button>
          <h2 style={{ margin: 0, fontSize: 17 }}>Éditeur, <span className="mono">{slug}</span></h2>
          <div className="tpl-editor-actions">
            <button className="btn sm ghost" onClick={() => setShowFields(true)} title="Gérer les champs disponibles du dossier">Champs documents</button>
            <button className="btn sm ghost" onClick={() => setShowCustom(true)} title="Créer des jetons calculés (dates, combinaisons…)">Jetons perso</button>
            <button className={"btn sm ghost" + (showPreview ? " on" : "")} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Édition" : "Aperçu"}
            </button>
            <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </div>

        <StatusMessage status={status} />
        {/* DES PUCES QUI NE DÉSIGNENT PLUS RIEN s'imprimeraient VIDES, sans une erreur : c'était le cas de
            l'acompte dans le devis, la convention et le contrat de production (2026-09-26). */}
        {inconnus.length > 0 && (
          <p className="tpl-propose attention" role="note">
            <Icon name="alert-triangle" size={15} aria-hidden="true" />
            <span><b>{inconnus.length > 1 ? `${inconnus.length} jetons de ce modèle n'existent plus` : "Un jeton de ce modèle n'existe plus"}</b> :{" "}
              {inconnus.map((j) => `« ${j.libelle || j.cle} » ({${j.cle}})`).join(", ")}.
              {" "}{inconnus.length > 1 ? "Ils s'impriment" : "Il s'imprime"} <b>vide</b>. Supprimez la puce barrée et insérez le bon champ depuis la palette, puis enregistrez.</span>
          </p>
        )}
        {/* LE STAGIAIRE SIGNE CE MODÈLE, MAIS RIEN NE PORTE SA SIGNATURE : elle ne s'imprimerait nulle part
            sur le document signé. C'était le cas du « Contrat » de production le 2026-09-25 — rien ne le
            disait, ni ici ni à la signature. */}
        {signeParStagiaire && !modeleEntreprise
          && !aUnCadreStagiaire([header?.getHTML(), body?.getHTML(), footer?.getHTML()].join("")) && (
          <p className="tpl-propose attention" role="note">
            <Icon name="pencil" size={15} aria-hidden="true" />
            <span><b>Le stagiaire signe ce modèle, mais aucun cadre ne porte sa signature</b> : elle n'apparaîtra pas
              sur le document signé. Placez « {SIG_STAGIAIRE.label} » (bloc Signatures), puis enregistrez.</span>
          </p>
        )}
        {propose && (
          <p className="tpl-propose" role="note">
            <Icon name="file-text" size={15} aria-hidden="true" />
            <span><b>Modèle proposé, pas encore enregistré.</b> {propose}</span>
          </p>
        )}

        {!showPreview && <RichToolbar editor={target} />}
      </div>

      <div className="tpl-editor-body">
        {showPreview ? (
          <div className="tpl-doc pdf-preview">
            {pdfLoading && <p className="hint" style={{ padding: 24 }}>Génération de l'aperçu PDF…</p>}
            {pdfErr && <p className="hint" style={{ padding: 24, color: "var(--amber, #b8860b)" }}>{pdfErr}</p>}
            {pdfUrl && !pdfErr && (
              <iframe title="Aperçu PDF" src={pdfUrl}
                style={{ width: "100%", height: "80vh", border: "none", borderRadius: 8, background: "#525659" }} />
            )}
          </div>
        ) : (
          <div className="tpl-doc">
            <div className="hf-zone">
              <div className="hf-label">En-tête <span>· {noLetterhead ? "aucun en-tête automatique" : "laissé vide = papier à en-tête automatique"}</span>
                <label className="bleed-tog" title="Ajoute automatiquement l'identité de l'organisme en haut quand l'en-tête est vide. À décocher si le corps porte déjà l'identité (facture…).">
                  <input type="checkbox" checked={!noLetterhead} onChange={() => setNoLetterhead((v) => !v)} /> papier à en-tête auto
                </label>
                <BleedToggle on={bleed.header} onChange={() => toggleBleed("header")} />
              </div>
              <div onDrop={onDrop(header)} onDragOver={(e) => e.preventDefault()}><EditorContent editor={header} /></div>
            </div>
            <div className="body-zone" ref={bodyZoneRef} onDrop={onDrop(body)} onDragOver={(e) => e.preventDefault()}>
              <div className="hf-label">Contenu <span>· le trait indique la fin de page</span>
                <BleedToggle on={bleed.body} onChange={() => toggleBleed("body")} /></div>
              <div className="pb-guides" style={{ top: pbView.top, left: pbView.left, width: pbView.width, height: pbView.height }}>
                <div className="pb-guides-inner" ref={pbInnerRef}>
                  {pbView.lines.map((y, i) => <div key={i} className="pb-line" style={{ top: y }} />)}
                </div>
              </div>
              <EditorContent editor={body} />
            </div>
            <div className="hf-zone">
              <div className="hf-label">Pied de page<BleedToggle on={bleed.footer} onChange={() => toggleBleed("footer")} /></div>
              <div onDrop={onDrop(footer)} onDragOver={(e) => e.preventDefault()}><EditorContent editor={footer} /></div>
            </div>
          </div>
        )}

        <aside className="tpl-palette">
          <div className="tpl-palette-hd">Champs disponibles</div>
          <p className="sub" style={{ margin: "0 10px 8px", fontSize: 11 }}>
            Cliquez ou glissez un champ dans le document.
          </p>
          {catalog.length === 0 && (
            <p className="sub" style={{ margin: "0 10px 10px", fontSize: 11 }}>
              Aucun champ activé. Ouvrez <button className="btn sm ghost" style={{ padding: "1px 6px", fontSize: 11 }} onClick={() => setShowFields(true)}>Champs documents</button> pour en activer.
            </p>
          )}

          <div className="tok-group">
            <div className="tok-group-hd" style={{ cursor: "default" }}><span><Icon name="pencil" size={13} /> Signatures</span></div>
            <div className="tok-list" style={{ padding: "0 10px 8px" }}>
              <p className="sub" style={{ margin: "0 0 6px", fontSize: 11 }}>
                Un cadre vide, rempli quand la personne signe.
              </p>
              {/* Le cadre « Cachet de l'entreprise » NE vit plus ici : il a rejoint le groupe
                  « Entreprise » (plus bas), avec les autres champs de l'entreprise — sa signature
                  est une donnée de l'entreprise, pas un bloc nommé de plus. */}
              <button className="tok-chip" draggable
                title={"Cadre vide jusqu'à la signature de l'organisme, qui signe en dernier : juste après le stagiaire ou l'entreprise, ou à l'envoi s'il signe seul. Cliquer ou glisser."}
                onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify(SIG_ORGANISME))}
                onClick={() => target?.chain().focus().insertToken({ token: SIG_ORGANISME.key, label: SIG_ORGANISME.label }).run()}>
                <Icon name="pencil" size={13} /> {SIG_ORGANISME.label}
              </button>
              {/* Le stagiaire signe tout document de son dossier ; un document de GROUPE (🏢), non. */}
              {!modeleEntreprise && (
                <button className="tok-chip" draggable
                  title={"Cadre vide jusqu'à ce que le stagiaire signe, depuis son espace : sa signature s'y dessine. Cliquer ou glisser."}
                  onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify(SIG_STAGIAIRE))}
                  onClick={() => target?.chain().focus().insertToken({ token: SIG_STAGIAIRE.key, label: SIG_STAGIAIRE.label }).run()}>
                  <Icon name="pencil" size={13} /> {SIG_STAGIAIRE.label}
                </button>
              )}
              {signeParExterne && (
                <button className="tok-chip" draggable
                  title={"Cadre vide jusqu'à la signature de l'intervenant : depuis son espace, ou par le lien externe (tuteur, financeur…). Cliquer ou glisser."}
                  onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify(SIG_INTERVENANT))}
                  onClick={() => target?.chain().focus().insertToken({ token: SIG_INTERVENANT.key, label: SIG_INTERVENANT.label }).run()}>
                  <Icon name="pencil" size={13} /> {SIG_INTERVENANT.label}
                </button>
              )}
              {/* LES BLOCS NOMMÉS (jury, formateur, stagiaires…) ne servent qu'aux modèles
                  « Externe » : là, chacun s'attribue à une personne de la session à l'envoi, qui le
                  signe en ligne. Ailleurs — une convention, un devis — personne ne les remplit ;
                  les montrer partout ne faisait qu'encombrer. Un rôle absent de cette liste se tape
                  dans le champ ci-dessous, et cela sur TOUT modèle. */}
              {signeParExterne && (
                <>
                  <p className="sub" style={{ margin: "10px 0 6px", fontSize: 11 }}>Attribués à une personne de la session, à l'envoi :</p>
                  {SIG_PRESETS.map((s) => (
                    <button key={s} className="tok-chip" title={`Bloc de signature « ${s} », attribué à une personne de la session à l'envoi, qui le signe en ligne. Cliquer ou glisser.`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: sigKey(s), label: s }))}
                      onClick={() => insertSignature(s)}><Icon name="pencil" size={13} /> {s}</button>
                  ))}
                </>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input className="inp" value={sigLabel} onChange={(e) => setSigLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { insertSignature(sigLabel); setSigLabel(""); } }}
                  placeholder="Autre libellé…" style={{ fontSize: 12, padding: "4px 6px" }} />
                <button className="btn sm ghost" title="Cliquer ou glisser dans le document"
                  draggable={!!sigLabel.trim()}
                  onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: sigKey(sigLabel.trim()), label: sigLabel.trim() }))}
                  onClick={() => { insertSignature(sigLabel); setSigLabel(""); }} disabled={!sigLabel.trim()}>＋</button>
              </div>
            </div>
          </div>

          {/* Recherche : onze groupes et plus de quatre-vingt-dix jetons. Sans elle, trouver
              « SIRET » demande d'ouvrir les groupes un par un — et de savoir dans lequel il
              se range, ce qu'on ignore justement quand on cherche. */}
          {/* La loupe était DANS le placeholder : elle disparaissait donc à la première
              frappe, au moment précis où l'on veut encore savoir dans quoi on tape. Posée à
              côté du champ, elle reste. `gs-search` est le conteneur déjà utilisé pour les
              autres recherches de l'application. */}
          <span className="gs-search" style={{ margin: "0 0 10px", width: "100%" }}>
            <Icon name="search" size={14} aria-hidden="true" />
            <input aria-label="Rechercher un champ à insérer" value={rechJeton}
              onChange={(e) => setRechJeton(e.target.value)} placeholder="Rechercher un champ…" />
          </span>

          {catalogFiltre.map((g) => (
            <div key={g.group} className="tok-group" style={{ borderLeft: `3px solid ${categoryAccent(g.group)}` }}>
              <button className="tok-group-hd" onClick={() => setOpenGroups((p) => ({ ...p, [g.group]: !p[g.group] }))}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: categoryAccent(g.group), flex: "0 0 auto" }} />
                  {g.group}
                </span>
                <span className="chev"><Icon name="chevron-down" size={14} style={{ transform: openGroups[g.group] ? "none" : "rotate(-90deg)", transition: "transform .15s var(--ease)" }} /></span>
              </button>
              {(rechJeton.trim() || openGroups[g.group]) && (
                <div className="tok-list">
                  {/* Les signatures de l'organisme et du stagiaire sont offertes en CADRES, en haut
                      (bloc Signatures) : on ne les répète pas ici en jetons bruts. Deux entrées
                      identiques pour la même signature semaient le doute. Les jetons restent connus
                      du moteur — seules les puces en double disparaissent de la palette. */}
                  {g.tokens.filter((t) => !(g.group === "Signature" && (t.key === "Signature organisme" || t.key === "Signature stagiaire"))).map((t) => (
                    <button key={t.key} className="tok-chip" style={categoryChipStyle(t.origin || g.group)}
                      onMouseEnter={(e) => montrerTip(e, t, g.group)} onMouseLeave={cacherTip} onFocus={(e) => montrerTip(e, t, g.group)} onBlur={cacherTip}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: t.key, label: t.label }))}
                      onClick={() => insertToken(t)}>
                      {t.label}
                    </button>
                  ))}
                  {/* LA SIGNATURE DE L'ENTREPRISE, avec ses autres champs. Un cadre vide où le
                      représentant appose son cachet (depuis son espace, ou par le lien de signature).
                      Offert DÈS QUE l'entreprise signe — un document de GROUPE (company_level), mais
                      aussi un document de stagiaire co-signé (« Entreprise » signataire, cf.
                      companySignsDoc) ; ailleurs, personne ne le remplirait, le cadre resterait vide. */}
                  {g.group === "Entreprise" && (modeleEntreprise || entrepriseSigne) && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border-soft)" }}>
                      <p className="sub" style={{ margin: "0 0 6px", fontSize: 11 }}>Signature de l'entreprise</p>
                      <button className="tok-chip" style={categoryChipStyle(g.group)} draggable
                        title={"Cadre vide jusqu'à la signature : le représentant de l'entreprise y appose son cachet, depuis son espace ou par le lien de signature. Cliquer ou glisser."}
                        onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify(SIG_ENTREPRISE))}
                        onClick={() => target?.chain().focus().insertToken({ token: SIG_ENTREPRISE.key, label: SIG_ENTREPRISE.label }).run()}>
                        <Icon name="pencil" size={13} /> {SIG_ENTREPRISE.label}
                      </button>
                    </div>
                  )}
                  {/* Ligne de facture : ces jetons n'ont de sens QUE dans un bloc
                      {#Articles}…{/Articles}. Sans un moyen de créer ce bloc, les proposer était
                      un piège — on cliquait « Quantité », on obtenait une facture vide, et rien
                      ne disait pourquoi. Le bloc s'insère donc prêt à l'emploi, en tableau. */}
                  {g.group === "Ligne de facture" && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border-soft)" }}>
                      <p className="sub" style={{ margin: "0 0 6px", fontSize: 11 }}>
                        Pour un tableau simple, utilisez le champ <b>Tableau des articles</b> du groupe
                        Facture : une seule puce, le tableau est mis en forme automatiquement.
                        <br /><br />
                        Ces champs-ci servent à composer un tableau <b>sur mesure</b>. Insérez d'abord la
                        trame ci-dessous, puis placez-les dans ses cellules.
                      </p>
                      <button className="tok-chip" style={categoryChipStyle(g.group)} title="Insère une trame de tableau à personnaliser"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/x-rawtoken", BLOC_ARTICLES)}
                        onClick={() => insertRaw(BLOC_ARTICLES)}>
                        <Icon name="plus" size={13} /> Trame sur mesure
                      </button>
                    </div>
                  )}
                  {/* Groupe entreprise : jetons répétés PAR STAGIAIRE (bloc), insérés en texte brut. */}
                  {g.group === "Groupe entreprise" && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border-soft)" }}>
                      {/* CE QUE LE GROUPE VEUT DIRE, écrit là où on le lit. L'ancienne ligne (« jetons à
                          placer entre les marqueurs ») supposait qu'on sache déjà ce qu'est la liste, d'où
                          elle vient, et à quoi servent des marqueurs : trois choses que rien ne disait. */}
                      <p className="sub" style={{ margin: "0 0 6px", fontSize: 11 }}>
                        Un document d'entreprise concerne <b>plusieurs stagiaires</b> : ceux de l'entreprise
                        inscrits à la session (et, s'il y a un document par OPCO, ceux de cet OPCO). La puce
                        <b> Liste des stagiaires</b> les écrit, un nom par ligne.
                        <br /><br />
                        Pour votre propre présentation, insérez un <b>bloc « par stagiaire »</b> : ce qui est
                        placé entre <code>{"{#Stagiaires}"}</code> et <code>{"{/Stagiaires}"}</code> se répète
                        pour chacun, et les jetons ci-dessous y prennent ses valeurs.
                      </p>
                      <button className="tok-chip" style={categoryChipStyle(g.group)} title="Insère un bloc {#Stagiaires} … {/Stagiaires} avec un exemple"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/x-rawtoken", BLOC_STAGIAIRES)}
                        onClick={() => insertRaw(BLOC_STAGIAIRES)}>
                        <Icon name="plus" size={13} /> Bloc « par stagiaire »
                      </button>
                      <div style={{ height: 6 }} />
                      {GROUP_ROW_TOKENS.map((t) => (
                        <button key={t.key} className="tok-chip" style={categoryChipStyle(g.group)}
                          onMouseEnter={(e) => montrerTip(e, { ...t, desc: descParStagiaire(t) }, g.group)} onMouseLeave={cacherTip}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: t.key, label: t.label }))}
                          onClick={() => insertToken(t)}>{t.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </aside>
      </div>

      {showCustom && (
        <CustomTokenManager catalog={customCatalog} onClose={() => setShowCustom(false)} onSaved={reloadCatalog} />
      )}

      {showFields && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 720, width: "92%" }}>
            <div className="mhead">
              <h3>Champs documents</h3>
              <button className="x" onClick={() => { setShowFields(false); reloadCatalog(); }} aria-label="Fermer">×</button>
            </div>
            <div className="mbody" style={{ maxHeight: "70vh", overflow: "auto" }}>
              <p className="sub" style={{ margin: "0 0 10px" }}>
                Activez les champs du dossier utilisables dans les documents. Les champs activés deviennent insérables dans le modèle (palette de droite) et sont remplis à la génération.
              </p>
              <FieldSettingsPanel ref={fieldsRef} onStatus={setStatus} />
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => { setShowFields(false); reloadCatalog(); }}>Fermer</button>
              <button className="btn primary" onClick={async () => { await fieldsRef.current?.save(); reloadCatalog(); }}>Enregistrer les champs</button>
            </div>
          </div>
        </div>
      )}

      {tip && (
        <div style={{
          position: "fixed", left: tip.x, top: tip.y - 10, transform: "translate(-50%, -100%)",
          maxWidth: 300, whiteSpace: "pre-line", background: "#1f2430", color: "#f4f5fa",
          border: "1px solid #3a3f4b", borderRadius: 8, padding: "9px 12px",
          fontSize: 13.5, lineHeight: 1.45, fontWeight: 500, textAlign: "left",
          boxShadow: "0 8px 24px rgba(0,0,0,.32)", zIndex: 1000, pointerEvents: "none",
        }}>{tip.text}</div>
      )}
    </div>
  );
}

export default TemplateEditor;
