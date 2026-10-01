"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/* ============================================================================
   LA NAVIGATION DES RAYONS — le lien de la section en cours est marqué.

   L'en-tête vit dans le layout (il reste en place d'une page à l'autre, la
   page introuvable l'a aussi) : c'est donc l'ADRESSE qui dit où l'on est, pas
   la page. Un sous-rayon allume son rayon de premier niveau.

   `replier` : quand les rayons ne tiennent pas tous à côté du logo (un
   portable de 1 280 px, l'en-tête en pilule), ceux qui débordent se retirent
   de la fin et ce lien les remplace (« Tout le catalogue ») — aucun rayon
   coupé au milieu d'un mot, aucun qui disparaisse sans chemin pour y aller.
   ========================================================================== */

export type LienRayon = { cle: string; href: string; nom: string };

export function NavRayons({
  liens,
  racineDe,
  libelle,
  className = "nav",
  replier,
}: {
  liens: LienRayon[];
  replier?: LienRayon;
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

  const nav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!replier || !el || typeof ResizeObserver === "undefined") return;
    const mesurer = () => {
      const rayons = [...el.querySelectorAll<HTMLElement>("[data-rayon]")];
      const plus = el.querySelector<HTMLElement>("[data-replier]");
      if (!plus) return;
      for (const a of rayons) a.hidden = false;
      plus.hidden = false;
      const style = getComputedStyle(el);
      const ecart = parseFloat(style.columnGap) || 0;
      const boite = el.getBoundingClientRect();
      const largeur = el.clientWidth;
      // Où finit un lien, depuis le début de la navigation (dans le sens de lecture).
      const fin = (a: HTMLElement) => {
        const r = a.getBoundingClientRect();
        return style.direction === "rtl" ? boite.right - r.left : r.right - boite.left;
      };
      const tous = rayons.length ? fin(rayons[rayons.length - 1]) : 0;
      if (tous <= largeur) { plus.hidden = true; el.dataset.mesure = ""; return; }
      // Ce qui ne tient pas se retire, en gardant la place du lien qui les remplace.
      const place = largeur - plus.offsetWidth - ecart;
      for (const a of rayons) a.hidden = fin(a) > place;
      el.dataset.mesure = "";
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    document.fonts?.ready.then(mesurer).catch(() => {});
    return () => ro.disconnect();
  }, [replier, liens]);

  return (
    <nav ref={nav} className={className} aria-label={libelle}>
      {liens.map((l) => (
        <Link key={l.cle} href={l.href} data-rayon="" aria-current={actif === l.cle ? "page" : undefined}>
          {l.nom}
        </Link>
      ))}
      {replier ? (
        <Link key={replier.cle} href={replier.href} data-replier="" hidden aria-current={actif === replier.cle ? "page" : undefined}>
          {replier.nom}
        </Link>
      ) : null}
    </nav>
  );
}
