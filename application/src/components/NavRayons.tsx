"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ============================================================================
   LA NAVIGATION DES RAYONS — le lien de la section en cours est marqué.

   L'en-tête vit dans le layout (il reste en place d'une page à l'autre, la
   page introuvable l'a aussi) : c'est donc l'ADRESSE qui dit où l'on est, pas
   la page. Un sous-rayon allume son rayon de premier niveau.
   ========================================================================== */

export type LienRayon = { cle: string; href: string; nom: string };

export function NavRayons({
  liens,
  racineDe,
  libelle,
  className = "nav",
}: {
  liens: LienRayon[];
  /** slug d'un rayon (tous niveaux) → slug de son rayon de premier niveau. */
  racineDe: Record<string, string>;
  libelle: string;
  className?: string;
}) {
  // Le préfixe interne /_b/<boutique> n'est jamais montré, mais on ne compte
  // pas sur le cadre pour l'avoir retiré.
  const chemin = (usePathname() ?? "/").replace(/^\/_b\/[^/]+/, "") || "/";
  const rayon = /^\/categorie\/([^/]+)/.exec(chemin)?.[1];
  const actif =
    chemin === "/catalogue" || chemin.startsWith("/catalogue/")
      ? "catalogue"
      : rayon
        ? racineDe[decodeURIComponent(rayon)]
        : undefined;

  return (
    <nav className={className} aria-label={libelle}>
      {liens.map((l) => (
        <Link key={l.cle} href={l.href} aria-current={actif === l.cle ? "page" : undefined}>
          {l.nom}
        </Link>
      ))}
    </nav>
  );
}
