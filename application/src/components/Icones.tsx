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

export function Coeur({ taille = 20, className, plein = false }: Props & { plein?: boolean }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} fill={plein ? "currentColor" : "none"}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
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

/** Une étiquette de prix : le code promo. */
export function Etiquette({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" />
      <circle cx="7.5" cy="7.5" r="1.25" />
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

export function Menu({ taille = 22, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  );
}

export function Chevron({ taille = 16, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.8}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Magasin({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M4 10v10h16V10" />
      <path d="M3 10 5 4h14l2 6c0 1.4-1.1 2.5-2.5 2.5S16 11.4 16 10c0 1.4-1.8 2.5-4 2.5S8 11.4 8 10c0 1.4-1.1 2.5-2.5 2.5S3 11.4 3 10Z" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function Bulle({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Z" />
      <path d="M9 10h6M9 13.5h4" />
    </svg>
  );
}

export function Personne({ taille = 20, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function Grille({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </svg>
  );
}

export function Bouclier({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait} strokeWidth={1.7}>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** Un lot : trois boîtes empilées (vendu par dix, par cent). */
export function Lot({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <rect x="3" y="12.5" width="8" height="7.5" rx="1" />
      <rect x="13" y="12.5" width="8" height="7.5" rx="1" />
      <rect x="8" y="4" width="8" height="7.5" rx="1" />
    </svg>
  );
}

/** Partager : trois points reliés. */
export function Partager({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="m8.3 13.3 7.4 4.4M15.7 6.3l-7.4 4.4" />
    </svg>
  );
}

/** Un maillon : « Copier le lien ». */
export function Lien({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4L11.3 6.2" />
      <path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4L5 12.7a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" />
    </svg>
  );
}

/** Une cloche : « Prévenez-moi de son retour ». */
export function Cloche({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** Une enveloppe : le code reçu par e-mail. */
export function Enveloppe({ taille = 18, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </svg>
  );
}

/* --- Les réseaux (feuille de route B) : au trait comme le reste, pour
   Instagram, Facebook et TikTok ; le logo de WhatsApp plein, parce que c'est
   lui qu'on cherche des yeux sur le bouton flottant (dessin de Simple Icons,
   domaine public CC0). --- */

export function Instagram({ taille = 20, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Facebook({ taille = 20, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <path d="M15.5 3.5h-2.2a3.8 3.8 0 0 0-3.8 3.8V10H7v3.5h2.5v7h3.6v-7h2.6l.6-3.5h-3.2V7.7c0-.6.4-1 1-1h1.4Z" />
    </svg>
  );
}

export function TikTok({ taille = 20, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} {...trait}>
      <path d="M13.8 3.5v11.3a3.4 3.4 0 1 1-3.4-3.4" />
      <path d="M13.8 3.5c.4 2.7 2.3 4.5 5 4.7" />
    </svg>
  );
}

export function LogoWhatsApp({ taille = 26, className }: Props) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}
