/**
 * Petites illustrations (spot art) de la maîtrise sanitaire — trait `currentColor` + aplat léger,
 * pour rendre l'onboarding plus parlant qu'une simple icône. Prennent la couleur de leur parent
 * (classes `accent-*`), donc compatibles thème clair/sombre sans retouche.
 */
const ART = {
  // Paramétrer : un thermomètre + une échelle de seuils.
  setup: (
    <>
      <path d="M27 15a5 5 0 0 1 10 0v19.5a9 9 0 1 1-10 0z" fill="currentColor" fillOpacity=".08" />
      <path d="M27 15a5 5 0 0 1 10 0v19.5a9 9 0 1 1-10 0z" />
      <path d="M32 27v10" />
      <circle cx="32" cy="45" r="4.5" fill="currentColor" stroke="none" />
      <path d="M41 19h7M41 27h5M41 35h7" />
    </>
  ),
  // Enregistrer d'un tap : un téléphone avec une grande coche.
  tap: (
    <>
      <rect x="18" y="7" width="28" height="50" rx="5" fill="currentColor" fillOpacity=".08" />
      <rect x="18" y="7" width="28" height="50" rx="5" />
      <path d="M28 9h8" />
      <path d="M25 33l5 5 10-12" />
    </>
  ),
  // Prouver la conformité : un bouclier avec une coche.
  proof: (
    <>
      <path d="M32 7l19 7v13c0 12.5-8.2 19.7-19 23-10.8-3.3-19-10.5-19-23V14z" fill="currentColor" fillOpacity=".08" />
      <path d="M32 7l19 7v13c0 12.5-8.2 19.7-19 23-10.8-3.3-19-10.5-19-23V14z" />
      <path d="M23 30l6 6 12-14" />
    </>
  ),
};

export default function HygieneArt({ name, size = 56, className = "" }) {
  const inner = ART[name];
  if (!inner) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {inner}
    </svg>
  );
}
