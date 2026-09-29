/* ============================================================================
   SILHOUETTES — les EMBLÈMES DE RAYON (le registre de l'accueil).

   ⚠️ Elles ne servent PLUS aux produits. Depuis la décision de Luna du 11/08,
   une niche de produit sans photo affiche l'état « photo à venir » (voir
   Niche.tsx), jamais un dessin : quatre pictogrammes de valise ne se
   distinguaient pas et se lisaient comme un visuel manquant (juge visuel).
   Un RAYON, lui, a légitimement un emblème — ce n'est pas une image absente,
   c'est un pictogramme de sommaire, comme la lettrine d'un index.

   Le registre n'apparaît qu'à partir de DEUX rayons : avec la seule catégorie
   « Valises » d'aujourd'hui, ce fichier n'est pas rendu. Il attend le
   deuxième rayon créé au backoffice — c'est pourquoi les formes des autres
   familles (sacs, chaussures, maroquinerie) sont déjà là.
   ========================================================================== */

export type Forme = "valise" | "sac" | "escarpin" | "derby" | "pochette" | "ceinture" | "boite";

/** Rattache un rayon à son emblème. Le catalogue est généraliste : un slug
 *  inconnu tombe sur la forme neutre plutôt que sur une valise, qui mentirait. */
export function formePourCategorie(slug: string | null | undefined): Forme {
  const s = (slug ?? "").toLowerCase();
  if (s.includes("valise") || s.includes("bagage")) return "valise";
  if (s.includes("sac")) return "sac";
  if (s.includes("femme")) return "escarpin";
  if (s.includes("homme")) return "derby";
  if (s.includes("maroquinerie") || s.includes("portefeuille")) return "pochette";
  if (s.includes("ceinture")) return "ceinture";
  return "boite";
}

const TRACES: Record<Forme, React.ReactNode> = {
  valise: (
    <>
      <path
        fillRule="evenodd"
        d="M18 32h64a10 10 0 0 1 10 10v54a10 10 0 0 1-10 10H18A10 10 0 0 1 8 96V42a10 10 0 0 1 10-10Zm-12 26h88v5H6v-5Zm38-14h12v22H44V44Z"
      />
      <path d="M38 30v-6a12 12 0 0 1 24 0v6h-6v-6a6 6 0 0 0-12 0v6h-6Z" />
      <circle cx="24" cy="112" r="6" />
      <circle cx="76" cy="112" r="6" />
    </>
  ),
  sac: (
    <>
      <path fillRule="evenodd" d="M22 44h56l9 62H13l9-62Zm22 14h12v14H44V58Z" />
      <path d="M32 44v-6a18 18 0 0 1 36 0v6h-7v-6a11 11 0 0 0-22 0v6h-7Z" />
    </>
  ),
  escarpin: (
    <>
      <path
        fillRule="evenodd"
        d="M10 96c-3 0-5-2-5-5V76c0-11 6-21 16-26l44-22c8-4 18 2 18 11v8c0 29-24 49-53 49Zm12-16h4c19 0 34-14 36-32l-31 15c-7 4-9 10-9 17Z"
      />
      <path d="M20 98h16l-3 22h-10z" />
    </>
  ),
  derby: (
    <>
      <path
        fillRule="evenodd"
        d="M14 96V74c0-12 6-22 17-27l17-8c4-2 9 0 11 4l6 14c2 4 5 7 9 8l14 5c6 2 10 8 10 14v12zM28 84h14v-8H28z"
      />
      <path d="M8 98h84a6 6 0 0 1 6 6v4a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4v-4a6 6 0 0 1 6-6z" />
    </>
  ),
  pochette: (
    <>
      <path
        fillRule="evenodd"
        d="M10 48h80a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8V56a8 8 0 0 1 8-8Zm50 20h38v20H60a10 10 0 0 1 0-20Z"
      />
      <circle cx="70" cy="78" r="4.5" />
    </>
  ),
  ceinture: (
    <>
      <path
        fillRule="evenodd"
        d="M4 52h54v16H4Zm11 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm13 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm13 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
      />
      <path
        fillRule="evenodd"
        d="M58 42h20a16 16 0 0 1 16 16v4a16 16 0 0 1-16 16H58Zm9 10v16h11a8 8 0 0 0 8-8 8 8 0 0 0-8-8Z"
      />
    </>
  ),
  boite: (
    <>
      <path
        fillRule="evenodd"
        d="M14 44h72a6 6 0 0 1 6 6v52a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V50a6 6 0 0 1 6-6Zm7 12v40h58V56Z"
      />
      <path d="M42 44V32h16v12h-8Z" />
    </>
  ),
};

export function Silhouette({ forme, className }: { forme: Forme; className?: string }) {
  return (
    <svg viewBox="0 0 100 120" fill="currentColor" aria-hidden="true" className={className ?? "silhouette"}>
      {TRACES[forme]}
    </svg>
  );
}
