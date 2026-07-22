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
import { categoryChipStyle, categoryAccent, registerTokenGroups } from "../lib/categoryColors.js";

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
const BLOC_STAGIAIRES = `{#Stagiaires}${pill('N°')}. ${pill('Personne')} — ${pill('OPCO')}<br>{/Stagiaires}`;

// Jetons résolus PAR STAGIAIRE à l'intérieur d'un bloc {#Stagiaires}…{/Stagiaires}
// (documents de groupe / entreprise). Insérés en TEXTE brut.
const GROUP_ROW_TOKENS = [
  { key: "N°", label: "N°", sample: "1" },
  { key: "Personne", label: "Civilité + Nom complet", sample: "M. Jean DUPONT" },
  { key: "Civilité", label: "Civilité", sample: "M." },
  { key: "Prénom", label: "Prénom", sample: "Jean" },
  { key: "Nom", label: "Nom", sample: "DUPONT" },
  { key: "Email", label: "E-mail", sample: "jean@exemple.fr" },
  { key: "Téléphone", label: "Téléphone", sample: "06 12 34 56 78" },
  { key: "OPCO", label: "OPCO", sample: "OCAPIAT" },
  { key: "Ville", label: "Ville", sample: "Bordeaux" },
  { key: "D_Naissance", label: "Date de naissance", sample: "12/05/1990" },
];

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
  const [openGroups, setOpenGroups] = useState({});
  const [active, setActive] = useState(null); // éditeur ayant le focus (cible palette/toolbar)
  const [sigLabel, setSigLabel] = useState(""); // libellé d'un bloc de signature personnalisé
  const [showFields, setShowFields] = useState(false); // modale « Champs documents »
  const [showCustom, setShowCustom] = useState(false); // modale « Jetons personnalisés »
  const fieldsRef = useRef(null);
  const [, force] = useState(0);

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
        setCatalog(cat.data || []);
        // Enregistre clé→catégorie AVANT d'insérer le contenu : les puces se colorent alors
        // par catégorie dès leur premier rendu (cf. TokenView / categoryColors).
        registerTokenGroups(cat.data || []);
        setOpenGroups(Object.fromEntries((cat.data || []).map((g, i) => [g.group, i === 0])));
        const d = res.data || {};
        if (body) body.commands.setContent(d.body_html || "<p></p>");
        if (header) header.commands.setContent(d.header_html || "");
        if (footer) footer.commands.setContent(d.footer_html || "");
        const bl = (d.layout && d.layout.bleed) || {};
        setBleed({ header: !!bl.header, body: !!bl.body, footer: !!bl.footer });
        setNoLetterhead(!!(d.layout && d.layout.noLetterhead));
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
  const SIG_PRESETS = ["Jury 1", "Jury 2", "Président du jury", "Formateur", "Intervenant", "Stagiaire 1", "Stagiaire 2", "Stagiaire 3", "Stagiaire 4"];
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

  // Recharge la palette (les champs proposés = ceux activés dans Champs documents).
  const reloadCatalog = () => getTokenCatalog(slug).then((cat) => setCatalog(cat.data || [])).catch(() => {});

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
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="tpl-editor">
      <div className="tpl-editor-sticky">
        <div className="tpl-editor-head">
          <button className="btn ghost sm" onClick={() => navigate("/modeles")}>← Modèles</button>
          <h2 style={{ margin: 0, fontSize: 17 }}>Éditeur — <span className="mono">{slug}</span></h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setShowFields(true)} title="Gérer les champs disponibles du dossier">Champs documents</button>
            <button className="btn sm ghost" onClick={() => setShowCustom(true)} title="Créer des jetons calculés (dates, combinaisons…)">Jetons perso</button>
            <button className={"btn sm ghost" + (showPreview ? " on" : "")} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Édition" : "Aperçu"}
            </button>
            <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </div>

        <StatusMessage status={status} />

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
                Bloc de signature nommé, signé séparément par chaque personne.
              </p>
              {SIG_PRESETS.map((s) => (
                <button key={s} className="tok-chip" title={`Bloc de signature « ${s} » — cliquer ou glisser`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: sigKey(s), label: s }))}
                  onClick={() => insertSignature(s)}><Icon name="pencil" size={13} /> {s}</button>
              ))}
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
          <div className="field" style={{ margin: "0 0 10px" }}>
            <input className="inp" value={rechJeton} onChange={(e) => setRechJeton(e.target.value)}
              placeholder="🔍 Rechercher un champ…" />
          </div>

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
                  {g.tokens.map((t) => (
                    <button key={t.key} className="tok-chip" style={categoryChipStyle(t.origin || g.group)}
                      title={g.group === "Ligne de facture"
                        ? `{${t.key}} — à placer DANS le tableau des articles`
                        : `{${t.key}} — ex. ${t.sample || ""}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-token", JSON.stringify({ key: t.key, label: t.label }))}
                      onClick={() => insertToken(t)}>
                      {t.label}
                    </button>
                  ))}
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
                      <p className="sub" style={{ margin: "0 0 6px", fontSize: 11 }}>
                        <b>Bloc par stagiaire</b> : jetons à placer <b>entre</b> les marqueurs.
                      </p>
                      <button className="tok-chip" style={categoryChipStyle(g.group)} title="Insère un bloc {#Stagiaires} … {/Stagiaires} avec un exemple"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/x-rawtoken", BLOC_STAGIAIRES)}
                        onClick={() => insertRaw(BLOC_STAGIAIRES)}>
                        <Icon name="plus" size={13} /> Bloc « par stagiaire »
                      </button>
                      <div style={{ height: 6 }} />
                      {GROUP_ROW_TOKENS.map((t) => (
                        <button key={t.key} className="tok-chip" style={categoryChipStyle(g.group)} title={`{${t.key}} — à placer dans un bloc {#Stagiaires}…{/Stagiaires}`}
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
        <div className="overlay" onClick={() => { setShowFields(false); reloadCatalog(); }}>
          <div className="modal" style={{ maxWidth: 720, width: "92%" }} onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}

export default TemplateEditor;
