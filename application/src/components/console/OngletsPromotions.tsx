import Link from "next/link";

/** Les deux écrans du module promotions : les codes à taper, les prix barrés d'un rayon. */
export function OngletsPromotions({ slug, courant }: { slug: string; courant: "codes" | "prix-barres" }) {
  const base = `/gestion/${slug}/promotions`;
  return (
    <nav className="onglets" aria-label="Promotions">
      <Link href={base} aria-current={courant === "codes" ? "page" : undefined}>Codes promo</Link>
      <Link href={`${base}/prix-barres`} aria-current={courant === "prix-barres" ? "page" : undefined}>Prix barrés</Link>
    </nav>
  );
}
