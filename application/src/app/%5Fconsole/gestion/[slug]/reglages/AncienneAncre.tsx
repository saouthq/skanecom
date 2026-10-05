"use client";

import { useEffect } from "react";
import { lienReglages } from "@/lib/gestion/reglages-ecrans";

/** Les réglages tenaient sur une page : « reglages#t-zones » menait à la
 *  section. L'ancre n'atteint pas le serveur ; ici, elle mène à la page du
 *  thème (Livraison), à la hauteur de la section. */
export function AncienneAncre({ slug }: { slug: string }) {
  useEffect(() => {
    const ancre = /^#t-([a-z_]+)$/.exec(location.hash)?.[1];
    if (!ancre) return;
    const cible = lienReglages(slug, ancre);
    if (cible !== `/gestion/${slug}/reglages`) location.replace(cible);
  }, [slug]);
  return null;
}
