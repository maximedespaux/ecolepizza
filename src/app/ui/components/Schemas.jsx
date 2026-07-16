/**
 * Schémas pédagogiques en SVG inline (page Notions).
 * Pourquoi du SVG et pas une image : ça suit les tokens de couleur (thème clair/sombre),
 * ça reste net à tout zoom, c'est accessible (role/aria) et il n'y a aucun asset à gérer.
 */

const TXT = "var(--text)", MUT = "var(--muted)", DIM = "var(--dim)", BRD = "var(--border)";

// --- Matrice BCG / menu engineering (Kasavana & Smith) : popularité × marge ---
export function BcgMatrix() {
  const X0 = 54, X1 = 330, Y0 = 16, Y1 = 236, MX = (X0 + X1) / 2, MY = (Y0 + Y1) / 2;
  const quad = (x, y, w, h, color) => <rect x={x} y={y} width={w} height={h} fill={color} opacity="0.13" />;
  // Chaque case porte un exemple concret, tiré de la même carte que le schéma d'Omnès.
  const label = (x, y, emo, t, sub, color, ex) => (
    <g>
      <text x={x} y={y} textAnchor="middle" fontSize="18">{emo}</text>
      <text x={x} y={y + 16} textAnchor="middle" fontSize="12" fontWeight="800" fill={color}>{t}</text>
      <text x={x} y={y + 29} textAnchor="middle" fontSize="9.5" fill={MUT}>{sub}</text>
      <g>
        <rect x={x - 63} y={y + 36} width="126" height="17" rx="5" fill={color} opacity="0.85" />
        <text x={x} y={y + 48} textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">ex. {ex}</text>
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 344 264" style={{ width: "100%", maxWidth: 420, height: "auto" }} role="img"
         aria-label="Matrice BCG : quatre familles selon la popularité et la marge — étoiles, vaches à lait, dilemmes, poids morts">
      {/* quadrants */}
      {quad(X0, Y0, MX - X0, MY - Y0, "#3aa0e0")}
      {quad(MX, Y0, X1 - MX, MY - Y0, "#7bb661")}
      {quad(X0, MY, MX - X0, Y1 - MY, "#8a8a8a")}
      {quad(MX, MY, X1 - MX, Y1 - MY, "#e0ac48")}
      {/* grille */}
      <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="none" stroke={BRD} />
      <line x1={MX} y1={Y0} x2={MX} y2={Y1} stroke={BRD} strokeDasharray="4 4" />
      <line x1={X0} y1={MY} x2={X1} y2={MY} stroke={BRD} strokeDasharray="4 4" />
      {/* contenu des cases — mêmes pizzas que l'exemple de carte d'Omnès */}
      {label((X0 + MX) / 2, Y0 + 32, "❓", "Dilemmes", "pousser, replacer", "#3aa0e0", "Truffe 24 €")}
      {label((MX + X1) / 2, Y0 + 32, "⭐", "Étoiles", "ne pas y toucher", "#5f9e3f", "Chorizo 16,50 €")}
      {label((X0 + MX) / 2, MY + 32, "💀", "Poids morts", "retirer de la carte", "#8a8a8a", "Marinara 9 €")}
      {label((MX + X1) / 2, MY + 32, "🐴", "Vaches à lait", "coût ↓ ou prix ↑", "#b9822f", "Margherita 11,50 €")}
      {/* axes */}
      <line x1={X0} y1={Y1} x2={X1 + 6} y2={Y1} stroke={MUT} markerEnd="url(#ar)" />
      <line x1={X0} y1={Y1} x2={X0} y2={Y0 - 6} stroke={MUT} markerEnd="url(#ar)" />
      <defs><marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill={MUT} /></marker></defs>
      <text x={X1 / 2 + 20} y={Y1 + 22} textAnchor="middle" fontSize="11" fontWeight="700" fill={TXT}>Popularité →</text>
      <text x={X0 - 12} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize="10" fontWeight="700" fill={TXT}
            transform={`rotate(-90 ${X0 - 12} ${(Y0 + Y1) / 2})`}>Marge contributive (€) →</text>
      <text x={X0 + 4} y={Y1 + 22} fontSize="9" fill={DIM}>faible</text>
      <text x={X1} y={Y1 + 22} textAnchor="end" fontSize="9" fill={DIM}>forte</text>
    </svg>
  );
}

// --- Omnès : sur une VRAIE carte. On montre 8 pizzas rangées dans les 3 tranches de prix,
// pour qu'on comprenne tout de suite qu'Omnès parle des produits de la carte, pas d'abstractions.
// Noms courts : la pastille est étroite, au-delà de ~10 caractères le prix vient chevaucher le nom.
// Carte calée sur la règle : 9 € → 24 €, soit une ouverture de 2,67 (dans la fourchette 2,5-3),
// et 2 / 4 / 2 pizzas dans les trois tranches de 5 € → dispersion 25 / 50 / 25.
const CARTE_EX = [
  { n: "Marinara", p: 9.0, z: 0 }, { n: "Margherita", p: 11.5, z: 0 },
  { n: "Reine", p: 14.5, z: 1 }, { n: "Végé", p: 15.5, z: 1 },
  { n: "Chorizo", p: 16.5, z: 1 }, { n: "Napoli", p: 18.0, z: 1 },
  { n: "Burrata", p: 20.5, z: 2 }, { n: "Truffe", p: 24.0, z: 2 },
];
export function OmnesGamme() {
  const X0 = 16, X1 = 328, w = X1 - X0, t = w / 3;
  const YB = 34, PH = 19, GAP = 3; // haut des bandes, hauteur d'une pastille
  const zones = [
    { c: "#3aa0e0", name: "Tranche basse", range: "9 → 14 €" },
    { c: "#7bb661", name: "Tranche médiane", range: "14 → 19 €" },
    { c: "#dc3e37", name: "Tranche haute", range: "19 → 24 €" },
  ];
  const BH = 4 * (PH + GAP) + 10; // hauteur de bande = 4 pastilles max
  return (
    <svg viewBox="0 0 344 224" style={{ width: "100%", maxWidth: 440, height: "auto" }} role="img"
         aria-label="Exemple : une carte de 8 pizzas de 9 à 18 euros, réparties en trois tranches de prix — 2 pizzas en bas, 4 au milieu, 2 en haut">
      <text x={X0} y={13} fontSize="10.5" fontWeight="800" fill={TXT}>EXEMPLE — une carte de 8 pizzas</text>
      <text x={X0} y={25} fontSize="9" fill={MUT}>chaque pastille = une pizza de ta carte, rangée selon son prix</text>

      {zones.map((z, i) => {
        const x = X0 + i * t;
        const items = CARTE_EX.filter((p) => p.z === i);
        const pct = Math.round((items.length / CARTE_EX.length) * 100);
        return (
          <g key={i}>
            <rect x={x + 2} y={YB} width={t - 4} height={BH} rx="8" fill={z.c} opacity="0.10" stroke={z.c} strokeOpacity="0.45" />
            {items.map((p, j) => (
              <g key={p.n}>
                <rect x={x + 6} y={YB + 6 + j * (PH + GAP)} width={t - 12} height={PH} rx="5" fill={z.c} opacity="0.85" />
                <text x={x + 11} y={YB + 19 + j * (PH + GAP)} fontSize="7.5" fontWeight="700" fill="#fff">{p.n}</text>
                <text x={x + t - 11} y={YB + 19 + j * (PH + GAP)} textAnchor="end" fontSize="7.5" fontWeight="800" fill="#fff">{p.p.toFixed(2).replace(".", ",")} €</text>
              </g>
            ))}
            {/* bilan de la tranche */}
            <text x={x + t / 2} y={YB + BH + 15} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={z.c}>{items.length} pizzas · {pct} %</text>
            <text x={x + t / 2} y={YB + BH + 27} textAnchor="middle" fontSize="9" fill={MUT}>{z.name}</text>
            <text x={x + t / 2} y={YB + BH + 38} textAnchor="middle" fontSize="8.5" fill={DIM}>{z.range}</text>
          </g>
        );
      })}

      {/* verdict */}
      <rect x={X0} y="186" width={w} height="30" rx="8" fill="var(--surface)" stroke={BRD} />
      <text x={X0 + 10} y="199" fontSize="9.5" fill={MUT}>Dispersion 25 / 50 / 25</text>
      <text x={X0 + 10} y="211" fontSize="9.5" fontWeight="800" fill="#5f9e3f">✓ conforme</text>
      <text x={X1 - 10} y="199" textAnchor="end" fontSize="9.5" fill={MUT}>Ouverture : 24 ÷ 9 = 2,67</text>
      <text x={X1 - 10} y="211" textAnchor="end" fontSize="9.5" fontWeight="800" fill="#5f9e3f">✓ dans 2,5 – 3</text>
    </svg>
  );
}

// --- Coût matière : la cible 25-30 % (et non un seuil unique à 30 %) ---
export function CoutGauge() {
  const X0 = 20, X1 = 324, Y = 52, H = 26, w = X1 - X0;
  const at = (pct) => X0 + (w * pct) / 50; // échelle 0 → 50 %
  return (
    <svg viewBox="0 0 344 132" style={{ width: "100%", maxWidth: 430, height: "auto" }} role="img"
         aria-label="Jauge du coût matière : la cible est 25 à 30 % du prix de vente hors taxes ; de 30 à 35 % vigilance, au-delà la marge est mangée">
      <rect x={X0} y={Y} width={at(25) - X0} height={H} rx="6" fill="#7bb661" opacity="0.40" />
      <rect x={at(25)} y={Y} width={at(30) - at(25)} height={H} fill="#5f9e3f" />
      <rect x={at(30)} y={Y} width={at(35) - at(30)} height={H} fill="#e0ac48" opacity="0.9" />
      <rect x={at(35)} y={Y} width={X1 - at(35)} height={H} rx="6" fill="#dc3e37" opacity="0.9" />
      {/* accolade sur la cible */}
      <path d={`M${at(25)} ${Y - 9} L${at(25)} ${Y - 15} L${at(30)} ${Y - 15} L${at(30)} ${Y - 9}`} fill="none" stroke="#5f9e3f" strokeWidth="1.5" />
      <text x={(at(25) + at(30)) / 2} y={Y - 20} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#5f9e3f">CIBLE 25 – 30 %</text>
      {/* libellés de bandes — la bande 30-35 % est trop étroite pour un libellé : elle se lit
          à la couleur (orange) et aux graduations, et « vigilance » est rappelé sous la jauge. */}
      <text x={(X0 + at(25)) / 2} y={Y + 17} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#2f5d3a">confortable</text>
      <text x={(at(35) + X1) / 2} y={Y + 17} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff">ça mange la marge</text>
      <text x={at(32.5)} y={Y + H + 27} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#8a6614">↑ vigilance</text>
      {/* graduations */}
      {[0, 25, 30, 35, 50].map((p) => (
        <g key={p}>
          <line x1={at(p)} y1={Y + H} x2={at(p)} y2={Y + H + 5} stroke={MUT} />
          <text x={at(p)} y={Y + H + 16} textAnchor="middle" fontSize="8.5" fill={DIM}>{p} %</text>
        </g>
      ))}
      {/* Texte court : au-delà de ~70 caractères, il déborde du viewBox et se fait rogner.
          Le détail (commissions en livraison) est dans la note de la fiche. */}
      <text x={(X0 + X1) / 2} y={Y + H + 44} textAnchor="middle" fontSize="9" fill={MUT}>
        Coût matière ÷ prix de vente HT — la cible bouge selon le service.
      </text>
    </svg>
  );
}

// --- Ticket moyen : théorique vs réel (±20 %) ---
export function TicketMoyen() {
  const CX = 172;
  return (
    <svg viewBox="0 0 344 150" style={{ width: "100%", maxWidth: 430, height: "auto" }} role="img"
         aria-label="Ticket moyen théorique comparé au ticket moyen réel, avec une tolérance de plus ou moins 20 %">
      <g>
        <rect x="18" y="26" width="130" height="52" rx="10" fill="#3aa0e0" opacity="0.14" stroke="#3aa0e0" />
        <text x="83" y="44" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#3aa0e0">TICKET THÉORIQUE</text>
        <text x="83" y="62" textAnchor="middle" fontSize="10" fill={MUT}>(Σ prix ÷ n) × 2</text>
        <rect x="196" y="26" width="130" height="52" rx="10" fill="#7bb661" opacity="0.14" stroke="#7bb661" />
        <text x="261" y="44" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#5f9e3f">TICKET RÉEL</text>
        <text x="261" y="62" textAnchor="middle" fontSize="10" fill={MUT}>CA ÷ nb tickets</text>
        <text x={CX} y="58" textAnchor="middle" fontSize="16" fontWeight="800" fill={TXT}>vs</text>
      </g>
      <rect x="18" y="92" width="308" height="24" rx="7" fill="var(--surface2)" stroke={BRD} />
      <text x={CX} y="108" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={TXT}>Écart toléré : ±20 %</text>
      <text x="18" y="136" fontSize="9.5" fill={MUT}>théorique &gt; réel → perçu trop cher</text>
      <text x="326" y="136" textAnchor="end" fontSize="9.5" fill={MUT}>théorique &lt; réel → marge de manœuvre</text>
    </svg>
  );
}

// --- Le grain de blé (caryopse) : son / amande / germe ---
export function Caryopse() {
  return (
    <svg viewBox="0 0 344 168" style={{ width: "100%", maxWidth: 400, height: "auto" }} role="img"
         aria-label="Coupe d'un grain de blé : le son (enveloppe), l'amande (endosperme) et le germe">
      {/* grain */}
      <ellipse cx="96" cy="84" rx="52" ry="70" fill="#b9822f" opacity="0.35" stroke="#b9822f" />
      <ellipse cx="96" cy="84" rx="42" ry="59" fill="#fcb900" opacity="0.30" stroke="#fcb900" />
      <ellipse cx="96" cy="132" rx="15" ry="19" fill="#7bb661" opacity="0.55" stroke="#5f9e3f" />
      <line x1="96" y1="20" x2="96" y2="148" stroke="#b9822f" opacity="0.5" strokeDasharray="3 3" />
      {/* légendes */}
      <line x1="148" y1="34" x2="176" y2="34" stroke={MUT} /><circle cx="148" cy="34" r="2.5" fill="#b9822f" />
      <text x="182" y="31" fontSize="11.5" fontWeight="800" fill="#b9822f">Le son</text>
      <text x="182" y="45" fontSize="9.5" fill={MUT}>l'enveloppe : fibres + minéraux</text>
      <text x="182" y="57" fontSize="9.5" fill={MUT}>→ donne les cendres, et boit l'eau</text>

      <line x1="138" y1="84" x2="176" y2="84" stroke={MUT} /><circle cx="138" cy="84" r="2.5" fill="#fcb900" />
      <text x="182" y="81" fontSize="11.5" fontWeight="800" fill="#d19a00">L'amande (endosperme)</text>
      <text x="182" y="95" fontSize="9.5" fill={MUT}>amidon + protéines</text>
      <text x="182" y="107" fontSize="9.5" fill={MUT}>→ la farine blanche</text>

      <line x1="112" y1="136" x2="176" y2="136" stroke={MUT} /><circle cx="112" cy="136" r="2.5" fill="#5f9e3f" />
      <text x="182" y="133" fontSize="11.5" fontWeight="800" fill="#5f9e3f">Le germe</text>
      <text x="182" y="147" fontSize="9.5" fill={MUT}>l'embryon, gras → retiré (il rancit)</text>
    </svg>
  );
}

// --- Dureté de l'eau (°f) ---
export function DureteEau() {
  const X0 = 16, X1 = 328, Y = 34, H = 24, w = X1 - X0;
  const zones = [
    { p: 0.14, c: "#9ecbe8", t: "très douce", s: "0-7" },
    { p: 0.16, c: "#6fb3dd", t: "douce", s: "7-15" },
    { p: 0.30, c: "#7bb661", t: "plutôt dure", s: "15-30" },
    { p: 0.20, c: "#e0ac48", t: "dure", s: "30-40" },
    { p: 0.20, c: "#dc3e37", t: "très dure", s: "+40" },
  ];
  let x = X0;
  return (
    <svg viewBox="0 0 344 116" style={{ width: "100%", maxWidth: 430, height: "auto" }} role="img"
         aria-label="Échelle de dureté de l'eau en degré français : de très douce à très dure, l'idéal étant 15 à 30 degrés">
      {zones.map((z, i) => { const zw = w * z.p; const el = (
        <g key={i}>
          <rect x={x} y={Y} width={zw} height={H} fill={z.c} opacity="0.9" />
          <text x={x + zw / 2} y={Y + 16} textAnchor="middle" fontSize="9" fontWeight="800" fill="#123">{z.s}</text>
          <text x={x + zw / 2} y={Y + H + 14} textAnchor="middle" fontSize="8.5" fill={MUT}>{z.t}</text>
        </g>
      ); x += zw; return el; })}
      <text x={X0} y={22} fontSize="10" fontWeight="700" fill={MUT}>DEGRÉ FRANÇAIS (°f)</text>
      <g>
        <rect x={X0 + w * 0.30} y={Y - 7} width={w * 0.30} height={H + 14} fill="none" stroke="#5f9e3f" strokeWidth="2" rx="4" />
        <text x={X0 + w * 0.45} y={Y + H + 32} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#5f9e3f">↑ idéale pour la pâte</text>
      </g>
      <text x={X0} y={110} fontSize="9" fill={MUT}>trop douce → pâte collante, bulles</text>
      <text x={X1} y={110} textAnchor="end" fontSize="9" fill={MUT}>trop dure → pâte dure, peu levée</text>
    </svg>
  );
}

// Nom → composant (utilisé par les fiches via `schema: "bcg"`).
export const SCHEMAS = { bcg: BcgMatrix, omnes: OmnesGamme, cout: CoutGauge, ticket: TicketMoyen, caryopse: Caryopse, eau: DureteEau };
