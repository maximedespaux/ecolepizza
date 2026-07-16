/**
 * Visuels « vivants » des 3 builders : on VOIT ce qu'on fabrique pendant qu'on le règle.
 * Pourquoi : les panneaux de résultat ne montraient que des chiffres — or on forme des
 * pizzaïolos, le geste est visuel.
 *
 * Le pâton s'affaisse quand on hydrate, s'alvéole quand on monte le W, et prend l'aspect de
 * ce qu'on y met : farine complète (pâte foncée + piquée), son ajouté (pâte claire, mouchetée),
 * maïs/sarrasin/châtaigne… (chacune sa couleur), graines torréfiées, charbon végétal (pâte
 * noire). La pizza, elle, se garnit en direct. Tout est déduit des données déjà saisies pour
 * les calculs — le stagiaire ne remplit rien de plus.
 *
 * SVG inline : suit les tokens de thème, net à tout zoom, aucun asset à charger.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* Aléatoire DÉTERMINISTE : semé par la clé de l'ingrédient, sinon les morceaux sauteraient
   sur la pizza à chaque rendu (à chaque frappe au clavier). Même clé = même disposition. */
const hash = (s) => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

/* ---------------------------------------------------------------- Le pâton (vue de profil) */

const PATE_CLAIRE = [232, 213, 172];   // farine blanche (Tipo 00)
const PATE_COMPLETE = [176, 143, 92];  // farine intégrale — plus le taux de son monte, plus ça fonce
const CHARBON = [46, 44, 52];          // charbon végétal : 1-2 % suffisent à faire une pâte noire
const mixRGB = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t, 0, 1)));
const rgbStr = (c) => `rgb(${c.join(",")})`;
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/**
 * Couleur réelle d'une farine selon son taux de son (champ `water` des TIPOS, 0 → 8).
 * Exporté pour que le sélecteur de type affiche la MÊME couleur que le pâton : la pastille
 * de la carte annonce la pâte qu'on aura, et on voit que plus le type monte, plus ça fonce.
 */
export const flourColor = (water) => rgbStr(mixRGB(PATE_CLAIRE, PATE_COMPLETE, num(water) / 8));

/* Part de son de chaque farine de blé en substitution (T80 → T150) : elle pique la pâte. */
const SON_SUB = { ble1: 0.35, ble2: 0.7, bleint: 1 };
/* Couleur propre des autres farines de substitution — chacune teinte la pâte au prorata de sa part. */
const FLOUR_TINT = {
  soja: [230, 214, 152],       // jaune pâle
  chataigne: [196, 158, 114],  // brun châtaigne
  seigle: [180, 168, 152],     // gris-brun
  sarrasin: [172, 162, 152],   // gris (le sarrasin pique aussi de noir)
  mais: [238, 202, 92],        // jaune maïs franc
  epeautre: [212, 188, 138],   // brun clair
};
/* Le sarrasin garde des éclats de coque noire, très reconnaissables. */
const SON_SUB_EXTRA = { sarrasin: 0.5 };
/* Graines torréfiées : sésame, lin, pavot, tournesol. */
const SEED_C = ["#E9DDC2", "#8B6A3D", "#4A443C", "#C8A85E"];

const pctOf = (list, key) => num(((list || []).find((x) => x.key === key) || {}).pct);

/**
 * Aspect de la pâte déduit des réglages — c'est ce que le stagiaire doit VOIR.
 * Couvre : le type de farine, les substitutions (son + couleur propre), et les adjonctions
 * qui se voient vraiment (son, graines torréfiées, charbon végétal). La pâte fermentée et le
 * Naturkraft ne changent pas l'aspect : ils n'apparaissent donc pas ici.
 * @param tipoWater    champ `water` du tipo choisi (0-8), image du taux de son du manuel
 * @param subs         substitutions : [{ key, pct }]
 * @param adjonctions  adjonctions : [{ key, pct }]
 */
export function doughLook(tipoWater, subs, adjonctions) {
  // Le son d'une farine COMPLÈTE est broyé avec le grain : il fonce toute la pâte ET la pique.
  // Le son AJOUTÉ (adjonction, 1-3 %) est du son pur jeté dans une pâte blanche : il pique
  // beaucoup mais la pâte entre les mouchetures reste claire. D'où deux valeurs distinctes.
  const branFarine = (num(tipoWater) / 8) * 34
    + (subs || []).reduce((s, x) => s + num(x.pct) * ((SON_SUB[x.key] || 0) + (SON_SUB_EXTRA[x.key] || 0)), 0);
  const branAjoute = pctOf(adjonctions, "son") * 6;
  const bran = clamp(branFarine + branAjoute, 0, 50);                  // les mouchetures
  let c = mixRGB(PATE_CLAIRE, PATE_COMPLETE, clamp(branFarine + branAjoute * 0.3, 0, 50) / 50); // la couleur
  for (const x of subs || []) if (FLOUR_TINT[x.key]) c = mixRGB(c, FLOUR_TINT[x.key], num(x.pct) / 100);
  // Charbon : la racine fait qu'1 % noircit déjà nettement, comme en vrai.
  const ch = pctOf(adjonctions, "charbon");
  if (ch > 0) c = mixRGB(c, CHARBON, Math.sqrt(clamp(ch / 2, 0, 1)));

  return { color: rgbStr(c), bran, seeds: pctOf(adjonctions, "graines"), rgb: c };
}

/**
 * @param hydra  hydratation TOTALE en % (coulage + bassinage) — pilote l'affaissement
 * @param w      force de la farine — pilote l'alvéolage
 * @param look   sortie de doughLook() : couleur de la pâte, son visible, graines
 * @param patonG poids du pâton (g) — pilote la taille apparente
 */
export function Paton({ hydra = 60, w = 260, look, patonG = 280, nb = 1 }) {
  const lk = look || { color: rgbStr(PATE_CLAIRE), bran: 0, seeds: 0, rgb: PATE_CLAIRE };
  const hy = clamp(num(hydra), 50, 85), wf = clamp(num(w), 150, 500), br = clamp(num(lk.bran), 0, 50);
  const t = (hy - 55) / 25;                       // 0 = ferme, 1 = très hydraté → il s'étale
  const sz = clamp(Math.sqrt(num(patonG) / 280), 0.72, 1.28);
  const rx = Math.round((46 + t * 24) * sz), ry = Math.round((40 - t * 18) * sz);
  const cy = 118 - ry;
  const pate = lk.color;
  // Reflet : une pâte foncée (charbon, intégrale) s'éclaire, une pâte claire garde son ton.
  const sombre = lum(lk.rgb) < 0.45;
  const clair = rgbStr(mixRGB(lk.rgb, sombre ? [255, 255, 255] : [250, 240, 215], sombre ? 0.16 : 0.5));
  // Le son doit rester lisible : plus foncé que la pâte, sauf sur une pâte déjà noire.
  const sonC = sombre ? "rgba(255,255,255,.32)" : "rgba(90,62,26,.75)";

  const nAlv = Math.round(4 + ((wf - 200) / 250) * 9);
  const rAlv = 1.6 + ((wf - 200) / 250) * 3.4;
  const alv = Array.from({ length: clamp(nAlv, 3, 14) }, (_, i) => {
    const a = i * 2.399, rr = Math.sqrt((i + 0.5) / nAlv) * 0.7;
    return { x: 120 + Math.cos(a) * rr * rx, y: cy + Math.sin(a) * rr * ry, r: clamp(rAlv * (0.55 + rr * 0.8), 1, 6) };
  });
  const r2 = rng(hash(`son${Math.round(br)}`));
  const son = Array.from({ length: Math.round(br * 1.6) }, () => {
    const a = r2() * 6.283, rr = Math.sqrt(r2()) * 0.86;
    return { x: 120 + Math.cos(a) * rr * rx, y: cy + Math.sin(a) * rr * ry };
  });
  // Graines torréfiées (3-6 %) : de vraies graines, orientées au hasard, mélangées à la pâte.
  const r3 = rng(hash(`graines${Math.round(num(lk.seeds) * 10)}`));
  const graines = Array.from({ length: Math.round(clamp(num(lk.seeds), 0, 8) * 4.5) }, () => {
    const a = r3() * 6.283, rr = Math.sqrt(r3()) * 0.88;
    return { x: 120 + Math.cos(a) * rr * rx, y: cy + Math.sin(a) * rr * ry,
      c: SEED_C[Math.floor(r3() * SEED_C.length)], rot: Math.round(r3() * 180), l: 1.9 + r3() * 1.1 };
  });

  const desc = `Pâton de ${Math.round(num(patonG))} g, hydratation ${Math.round(hy)} %, farine W ${Math.round(wf)}`
    + (br > 3 ? `, pâte piquée de son` : "") + (graines.length ? `, avec des graines torréfiées` : "")
    + (sombre ? `, pâte foncée` : "") + ". "
    + (hy <= 60 ? "Pâte ferme, le pâton se tient." : hy <= 67 ? "Pâte souple, le pâton s'étale un peu." : "Pâte très hydratée, le pâton s'affaisse.");

  return (
    <svg viewBox="0 0 240 132" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={desc}>
      <title>Le pâton en direct</title><desc>{desc}</desc>
      <ellipse cx="120" cy="120" rx={rx + 34} ry="6" fill="rgba(0,0,0,.22)" />
      <g style={{ transition: "opacity .3s var(--ease)" }}>
        <ellipse cx="120" cy={cy} rx={rx} ry={ry} fill={pate} style={{ transition: "rx .35s var(--ease), ry .35s var(--ease), cy .35s var(--ease), fill .35s var(--ease)" }} />
        {alv.map((a, i) => <circle key={i} cx={a.x} cy={a.y} r={a.r} fill="rgba(0,0,0,.13)" style={{ transition: "all .35s var(--ease)" }} />)}
        {son.map((s, i) => <circle key={`s${i}`} cx={s.x} cy={s.y} r="1" fill={sonC} />)}
        <ellipse cx={120 - rx * 0.3} cy={cy - ry * 0.45} rx={rx * 0.34} ry={ry * 0.26} fill={clair} opacity="0.75"
          style={{ transition: "all .35s var(--ease)" }} />
        {/* Les graines passent APRÈS le reflet : elles sont en surface, elles doivent se voir dessus. */}
        {graines.map((g, i) => (
          <ellipse key={`g${i}`} cx={g.x} cy={g.y} rx={g.l} ry={g.l * 0.5} fill={g.c}
            transform={`rotate(${g.rot} ${g.x.toFixed(1)} ${g.y.toFixed(1)})`} />
        ))}
      </g>
      {nb > 1 && <text x="120" y="131" textAnchor="middle" fontSize="9" fontWeight="700" fill="rgba(255,255,255,.55)">× {nb} pâtons</text>}
    </svg>
  );
}

/* --------------------------------------------------------------- La pizza (vue de dessus) */

const BASE_VIS = {
  tomate: "#C1382A", creme: "#F0E7D2", creme_chorizo: "#E09A6F", ratatouille: "#AE5236",
  blanche: "#EFE5CB", pesto: "#6C8C3C", bbq: "#7C4023", autre: "#DCCBA6",
};

/* Rendu d'un ingrédient : couleur, taille d'un morceau, nombre de morceaux, forme.
   `q` = quantité de référence (g) — au-delà, on pose proportionnellement plus de morceaux. */
const VIS = {
  // Charcuterie
  chorizo: { c: "#A32C25", r: 7.5, n: 7, q: 40, s: "disc" },
  jambon: { c: "#E7A29B", r: 9, n: 5, q: 40, s: "blob" },
  jambon_cru: { c: "#CE6E68", r: 10, n: 4, q: 35, s: "blob" },
  lardons: { c: "#C77361", r: 3.6, n: 13, q: 40, s: "dice" },
  pepperoni: { c: "#96271F", r: 7.5, n: 8, q: 40, s: "disc" },
  poulet: { c: "#DDBE87", r: 5, n: 9, q: 50, s: "blob" },
  // Légumes
  champignon: { c: "#C2A578", r: 5.5, n: 9, q: 40, s: "blob" },
  poivron: { c: "#3E8C38", r: 4.5, n: 9, q: 40, s: "strip" },
  oignon: { c: "#F1E7D3", r: 6.5, n: 6, q: 25, s: "ring" },
  oignon_rouge: { c: "#AE74A8", r: 6.5, n: 6, q: 25, s: "ring" },
  roquette: { c: "#4B8A3C", r: 7, n: 7, q: 15, s: "leaf" },
  tomate_cerise: { c: "#CF3A2C", r: 6.5, n: 6, q: 50, s: "disc" },
  aubergine: { c: "#5B3768", r: 6.5, n: 6, q: 50, s: "disc" },
  pomme_de_terre: { c: "#E9D6A2", r: 6, n: 8, q: 60, s: "disc" },
  olives: { c: "#38382C", r: 4, n: 9, q: 20, s: "ring" },
  mais: { c: "#EDC13D", r: 2.6, n: 15, q: 30, s: "dice" },
  basilic: { c: "#3C7831", r: 7, n: 5, q: 5, s: "leaf" },
  origan: { c: "#6B7C48", r: 1.5, n: 22, q: 2, s: "dice" },
  // Mer
  anchois: { c: "#8A7861", r: 3.6, n: 6, q: 25, s: "strip" },
  thon: { c: "#D7BD9E", r: 4.6, n: 9, q: 50, s: "blob" },
  saumon: { c: "#EC9770", r: 8.5, n: 4, q: 40, s: "blob" },
  // Douceurs / autres
  miel: { c: "#DFA129", r: 2.2, n: 13, q: 15, s: "dice" },
  figue: { c: "#78395F", r: 6.5, n: 5, q: 40, s: "disc" },
  noix: { c: "#A87B52", r: 4.6, n: 7, q: 20, s: "blob" },
  oeuf: { c: "#F3C341", r: 11, n: 1, q: 55, s: "disc" },
  // Fromages
  mozzarella: { c: "#F7F2E2", r: 9.5, n: 7, q: 80, s: "blob" },
  mozza_bufala: { c: "#FBF8EE", r: 10.5, n: 6, q: 80, s: "blob" },
  stracciatella: { c: "#FAF6EA", r: 8, n: 8, q: 60, s: "blob" },
  burrata: { c: "#FBF8EE", r: 15, n: 1, q: 70, s: "blob" },
  ricotta: { c: "#F8F4E8", r: 7.5, n: 7, q: 50, s: "blob" },
  chevre: { c: "#F2EDDC", r: 7, n: 6, q: 50, s: "disc" },
  gorgonzola: { c: "#E4E2C9", r: 7.5, n: 6, q: 50, s: "blob" },
  parmesan: { c: "#EBD9A0", r: 2.4, n: 18, q: 20, s: "dice" },
  reblochon: { c: "#EEDFB4", r: 8, n: 6, q: 60, s: "blob" },
  feta: { c: "#F6F3EA", r: 5, n: 9, q: 50, s: "dice" },
  scamorza: { c: "#E7CE9A", r: 9, n: 6, q: 70, s: "blob" },
};
/* Repli par catégorie pour les produits du catalogue réel (Metro/mercuriale), hors liste curée. */
const VIS_CAT = {
  Charcuterie: { c: "#C97B6E", r: 7, n: 6, q: 40, s: "blob" },
  Légumes: { c: "#6D9A4A", r: 6, n: 7, q: 40, s: "blob" },
  Aromates: { c: "#4B8A3C", r: 5, n: 8, q: 5, s: "leaf" },
  Mer: { c: "#CDB295", r: 5, n: 7, q: 40, s: "blob" },
  Douceurs: { c: "#C08A46", r: 5, n: 7, q: 20, s: "blob" },
  Fromage: { c: "#F4EEDC", r: 8, n: 7, q: 70, s: "blob" },
};
const DEFAUT = { c: "#D3BE93", r: 6, n: 6, q: 40, s: "blob" };
const visOf = (it) => VIS[it.key] || VIS_CAT[it.cat] || (it.dairy ? VIS_CAT.Fromage : null) || DEFAUT;

function Morceau({ s, x, y, r, c, rot }) {
  if (s === "ring") return <g><circle cx={x} cy={y} r={r} fill={c} /><circle cx={x} cy={y} r={r * 0.4} fill="rgba(0,0,0,.32)" /></g>;
  if (s === "leaf") return <g transform={`translate(${x} ${y}) rotate(${rot})`}><ellipse rx={r} ry={r * 0.5} fill={c} /><line x1={-r * 0.8} y1="0" x2={r * 0.8} y2="0" stroke="rgba(0,0,0,.2)" strokeWidth="0.7" /></g>;
  if (s === "dice") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r * 0.35} fill={c} transform={`rotate(${rot} ${x} ${y})`} />;
  if (s === "strip") return <rect x={x - r * 1.9} y={y - r * 0.36} width={r * 3.8} height={r * 0.72} rx={r * 0.36} fill={c} transform={`rotate(${rot} ${x} ${y})`} />;
  if (s === "blob") return <ellipse cx={x} cy={y} rx={r} ry={r * 0.78} fill={c} transform={`rotate(${rot} ${x} ${y})`} />;
  return <circle cx={x} cy={y} r={r} fill={c} />;
}

/**
 * @param base    clé de base (tomate/crème/…) — colore le disque
 * @param items   sortie de garnitureItems() : { key, label, qty, cat, fragile }
 * @param cooked  true = sortie du four (croûte dorée + taches de léopard)
 */
export function PizzaDisc({ base, items = [], cooked = false, size = 240 }) {
  const C = 120, R_PATE = 88, R_SAUCE = 76, R_POSE = 64;
  const sauce = BASE_VIS[base] || null;
  const croute = cooked ? "#D8A85C" : "#E8D5AC";

  /* Les produits fragiles se posent APRÈS cuisson (roquette, burrata…) : ils passent au-dessus. */
  const ordered = [...items].filter((i) => visOf(i)).sort((a, b) => (a.fragile ? 1 : 0) - (b.fragile ? 1 : 0));

  const morceaux = [];
  ordered.forEach((it) => {
    const v = visOf(it);
    /* Le nombre de morceaux suit la quantité de façon LINÉAIRE : doubler les grammes doit
       doubler ce qu'on voit. (Une racine carrée amortissait tellement que 20 g et 120 g de
       chorizo donnaient la même pizza — le stagiaire doit voir sa main lourde.) */
    const ratio = clamp(num(it.qty) / (v.q || 40), 0.3, 2.6);
    const n = clamp(Math.round(v.n * ratio), 1, 30);
    const rnd = rng(hash(it.key || it.label));
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * (n === 1 ? 0.18 : 1) * R_POSE;
      morceaux.push({ k: `${it.key}-${i}`, s: v.s, c: v.c, r: v.r * clamp(0.85 + rnd() * 0.3, 0.8, 1.2), x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr, rot: Math.round(rnd() * 360) });
    }
  });

  const rl = rng(hash("leopard"));
  const noms = ordered.map((i) => String(i.label || "").toLowerCase()).filter(Boolean);
  const desc = sauce || noms.length
    ? `Pizza vue de dessus${sauce ? ` sur base ${base}` : ""}${noms.length ? ` garnie de ${noms.join(", ")}` : " sans garniture"}${cooked ? ", sortie du four" : ""}.`
    : "Disque de pâte nu — choisis une base et des produits pour garnir la pizza.";

  return (
    <svg viewBox="0 0 240 240" style={{ width: "100%", maxWidth: size, height: "auto", display: "block", margin: "0 auto" }} role="img" aria-label={desc}>
      <title>La pizza en direct</title><desc>{desc}</desc>
      <circle cx={C} cy={C} r={R_PATE} fill={croute} style={{ transition: "fill .35s var(--ease)" }} />
      {cooked && Array.from({ length: 16 }, (_, i) => {
        const a = rl() * 6.283, rr = R_SAUCE + 3 + rl() * 8;
        return <circle key={`l${i}`} cx={C + Math.cos(a) * rr} cy={C + Math.sin(a) * rr} r={2 + rl() * 3.4} fill="rgba(60,32,12,.55)" />;
      })}
      {sauce
        ? <circle cx={C} cy={C} r={R_SAUCE} fill={sauce} style={{ transition: "fill .35s var(--ease)" }} />
        : <circle cx={C} cy={C} r={R_SAUCE} fill="rgba(0,0,0,.07)" stroke="rgba(255,255,255,.25)" strokeDasharray="5 5" strokeWidth="1.5" />}
      {morceaux.map((m) => <Morceau key={m.k} {...m} />)}
      {/* Invite lisible seulement en grand : en vignette (dock), le disque vide parle de lui-même. */}
      {!sauce && !morceaux.length && size >= 120 && (
        <text x={C} y={C + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgba(255,255,255,.5)">Choisis une base…</text>
      )}
    </svg>
  );
}
