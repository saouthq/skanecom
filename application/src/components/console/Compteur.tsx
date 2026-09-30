"use client";

import { useEffect, useRef } from "react";
import { formateMontant } from "@/lib/prix";
import { pourcent } from "@/lib/gestion/tableau";

/* Un chiffre du tableau de bord qui monte jusqu'à sa valeur à l'ouverture
   (900 ms, qui ralentit à l'arrivée). Le serveur rend la valeur finale : sans
   JavaScript ou avec « réduire les animations », elle est là d'emblée. */

type Format = "entier" | "montant" | "pourcent";

function texte(v: number, format: Format): string {
  if (format === "montant") return formateMontant(Math.round(v / 1000) * 1000);
  if (format === "pourcent") return pourcent(v);
  return String(Math.round(v));
}

export function Compteur({ valeur, format = "entier" }: { valeur: number; format?: Format }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || valeur === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const debut = performance.now();
    let image = 0;
    const pas = (t: number) => {
      const x = Math.min(1, (t - debut) / 900);
      el.textContent = x < 1 ? texte(valeur * (1 - Math.pow(1 - x, 3)), format) : texte(valeur, format);
      if (x < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => {
      cancelAnimationFrame(image);
      el.textContent = texte(valeur, format);
    };
  }, [valeur, format]);
  return <span ref={ref} data-compteur="">{texte(valeur, format)}</span>;
}
