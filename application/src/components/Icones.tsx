/* ============================================================================
   ICÔNES — un seul jeu, tracé au filet (1,6 px), jamais de bibliothèque.
   Toutes prennent `currentColor` : elles héritent de la couleur du texte, donc
   d'un jeton, donc elles suivent l'habillage sans être touchées.

   RTL (charte §8) : les icônes DIRECTIONNELLES se retournent (`Fleche`), les
   objets non (recherche, panier, camion).
   ========================================================================== */

type Props = { taille?: number; className?: string };

const trait = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Fleche({ taille = 20, className }: Props) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={{ transform: "rotate(0deg)" }}
      {...trait}
    >
      {/* rtl:scale-x-[-1] est posé par la classe utilitaire côté appelant */}
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export function Coche({ taille = 16, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={2.2}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function Loupe({ taille = 20, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function Panier({ taille = 20, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function Croix({ taille = 14, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={2}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function Filtre({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}

export function Camion({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M3 7h13v10H3z" />
      <path d="M16 10h3.5L22 13v4h-6" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

export function Billets({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function Retour({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M20 12a8 8 0 1 1-3-6.2" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

export function Telephone({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4Z" />
    </svg>
  );
}
