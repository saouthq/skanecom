import Link from "next/link";

/** Les écrans du module promotions : les codes à taper, les prix barrés d'un rayon, les lots. */
export function OngletsPromotions({ slug, courant }: { slug: string; courant: "codes" | "prix-barres" | "lots" }) {
  const base = `/gestion/${slug}/promotions`;
  return (
    <nav className="onglets" aria-label="Promotions">
      <Link href={base} aria-current={courant === "codes" ? "page" : undefined}>Codes promo</Link>
      <Link href={`${base}/prix-barres`} aria-current={courant === "prix-barres" ? "page" : undefined}>Prix barrés</Link>
      <Link href={`${base}/lots`} aria-current={courant === "lots" ? "page" : undefined}>Lots</Link>
    </nav>
  );
}
