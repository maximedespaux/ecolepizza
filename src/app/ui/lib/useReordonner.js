import { useEffect, useId, useRef, useState } from "react";

/**
 * RÉORDONNER UNE LISTE AU DOIGT COMME À LA SOURIS — Pointer Events, plus le glisser-déposer HTML5.
 *
 * POURQUOI. Les listes réordonnables de « Formations » (les formations elles-mêmes, les jalons du
 * parcours documentaire, la section « À l'arrivée via une entreprise ») reposaient sur
 * `draggable` + `onDragStart` / `onDrop`. Cette API est faite pour la SOURIS : sur tablette et
 * téléphone, un doigt posé sur une carte fait défiler la page et aucun `dragstart` ne part —
 * Chrome sur Android n'en émet pas, Safari sur iPad seulement après un appui long. Signalé par
 * l'école le 2026-09-17 : « on ne peut pas déplacer les cartes au toucher ».
 *
 * Les Pointer Events réunissent souris, doigt et stylet sous les mêmes évènements. Deux règles,
 * pour que le doigt ne perde rien de ce qu'il faisait déjà :
 *  · au TOUCHER, on ne saisit que par la POIGNÉE (⠿), qui porte `touch-action:none`. Saisir par
 *    la carte entière empêcherait de faire défiler la liste — le geste le plus fréquent de tous ;
 *  · à la SOURIS, la carte entière reste saisissable, comme avant, sauf ses commandes (boutons,
 *    listes, champs) : cliquer sur « ✕ » ne doit pas commencer un glissé.
 * Un SEUIL de quelques pixels sépare le clic du glissé — sans lui, un simple clic ferait
 * clignoter la carte en « déplacée ».
 *
 * Près du bord d'un conteneur qui défile (la fenêtre de la formation, la rangée du parcours, la
 * page), la liste défile d'elle-même : seize jalons ne tiennent pas dans un écran, et un doigt ne
 * peut pas glisser ET faire défiler à la fois.
 *
 * Usage :
 *   const g = useReordonner((de, vers) => setListe(deplacerDans(liste, de, vers)));
 *   <div {...g.proprietes(i)} className={g.saisi === i ? "drag" : ""}>
 *     <span {...g.poignee(i)}>⠿</span>
 */

const COMMANDES = "button, a, input, select, textarea, label, [contenteditable='true']";
const SEUIL = 6;         // px avant qu'un appui devienne un glissé
const BORD = 56;         // px près d'un bord où la liste défile d'elle-même
const VITESSE_MAX = 18;  // px par image, pointeur collé au bord

/** La liste avec l'élément `de` posé à la place `vers` — la règle de l'ancien `onDrop`. */
export function deplacerDans(liste, de, vers) {
  const n = liste.length;
  // `Number.isInteger` et pas `de >= 0` : `null >= 0` vaut VRAI en JavaScript, un index absent
  // aurait déplacé la première carte.
  const valide = (i) => Number.isInteger(i) && i >= 0 && i < n;
  if (de === vers || !valide(de) || !valide(vers)) return liste;
  const suite = [...liste];
  const [pris] = suite.splice(de, 1);
  suite.splice(vers, 0, pris);
  return suite;
}

/** Vitesse de défilement près d'un bord : nulle loin des bords, jusqu'à `max` tout contre.
 *  Négative vers le début, positive vers la fin. */
export function vitesseBord(pos, debut, fin, bord = BORD, max = VITESSE_MAX) {
  if (pos < debut + bord) return -Math.ceil(max * Math.min(1, (debut + bord - pos) / bord));
  if (pos > fin - bord) return Math.ceil(max * Math.min(1, (pos - (fin - bord)) / bord));
  return 0;
}

function conteneursDefilants(depuis) {
  const out = [];
  for (let el = depuis.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const st = getComputedStyle(el);
    const x = /(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth;
    const y = /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight;
    if (x || y) out.push({ el, x, y, page: false });
  }
  const page = document.scrollingElement;
  if (page) out.push({ el: page, x: page.scrollWidth > page.clientWidth, y: page.scrollHeight > page.clientHeight, page: true });
  return out;
}

function arreter(c) {
  if (!c) return;
  cancelAnimationFrame(c.raf);
  document.documentElement.classList.remove("glisse-en-cours");
}

export function useReordonner(deplacer) {
  // Identifiant de LA liste : deux listes réordonnables à l'écran ne s'échangent pas leurs cartes.
  const liste = useId();
  const [saisi, setSaisi] = useState(null); // index de la carte qu'on déplace
  const [vise, setVise] = useState(null);   // index de la place visée
  const course = useRef(null);

  // Une fenêtre fermée en plein glissé ne laisse ni boucle d'animation ni page verrouillée.
  useEffect(() => {
    const ref = course;
    return () => arreter(ref.current);
  }, []);

  function indexSous(x, y) {
    const el = document.elementFromPoint(x, y)?.closest("[data-reordonner]");
    return el && el.getAttribute("data-reordonner") === liste ? Number(el.getAttribute("data-reordonner-index")) : null;
  }

  function boucle() {
    const c = course.current;
    if (!c || !c.actif) return;
    for (const { el, x, y, page } of c.conteneurs) {
      const r = page ? { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth } : el.getBoundingClientRect();
      if (y) el.scrollTop += vitesseBord(c.y, r.top, r.bottom);
      if (x) el.scrollLeft += vitesseBord(c.x, r.left, r.right);
    }
    // Relu à CHAQUE image, et pas seulement quand le pointeur bouge : la liste qui défile sous un
    // doigt immobile change la carte qu'il désigne.
    const i = indexSous(c.x, c.y);
    if (i !== null && i !== c.vise) { c.vise = i; setVise(i); }
    c.raf = requestAnimationFrame(boucle);
  }

  function debut(e, index) {
    arreter(course.current);
    course.current = { index, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      actif: false, vise: index, source: e.currentTarget, conteneurs: [], raf: 0 };
    // Capturé : la suite des évènements vient à nous même quand le pointeur quitte la carte.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  }

  function bouge(e) {
    const c = course.current;
    if (!c || c.id !== e.pointerId) return;
    c.x = e.clientX; c.y = e.clientY;
    if (c.actif || Math.hypot(c.x - c.x0, c.y - c.y0) < SEUIL) return;
    c.actif = true;
    c.conteneurs = conteneursDefilants(c.source);
    document.documentElement.classList.add("glisse-en-cours");
    window.getSelection?.()?.removeAllRanges();
    setSaisi(c.index); setVise(c.index);
    c.raf = requestAnimationFrame(boucle);
  }

  function fin(e, annule) {
    const c = course.current;
    if (!c || c.id !== e.pointerId) return;
    course.current = null;
    arreter(c);
    setSaisi(null); setVise(null);
    if (!annule && c.actif && c.vise !== c.index) deplacer(c.index, c.vise);
  }

  /** Sur la CARTE : la cible de dépôt, et la saisie à la souris. */
  const proprietes = (index) => ({
    "data-reordonner": liste,
    "data-reordonner-index": index,
    onPointerDown: (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(COMMANDES)) return;
      debut(e, index);
    },
    onPointerMove: bouge,
    onPointerUp: (e) => fin(e, false),
    onPointerCancel: (e) => fin(e, true),
    // Capture perdue sans relâcher (carte retirée de l'écran, alerte système) : on annule.
    onLostPointerCapture: (e) => fin(e, true),
  });

  /** Sur la POIGNÉE : la saisie à tous les pointeurs, doigt compris. */
  const poignee = (index) => ({
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation(); // la carte ne doit pas démarrer une seconde saisie
      debut(e, index);
    },
    style: { touchAction: "none" },
  });

  return { saisi, vise, proprietes, poignee };
}
