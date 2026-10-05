"use client";

import { useEffect, useRef, useState } from "react";

/* ============================================================================
   LE RAPPEL DES COLONNES — sur un long tableau de comparaison (les
   Formules), quand son en-tête est sorti de l'écran, une bande fine en haut
   redit le nom de chaque colonne, à sa place. L'en-tête lui-même (noms,
   prix, descriptions à modifier) est trop haut pour rester collé.

   · Les colonnes lues sont les <th> de l'en-tête qui portent [data-rappel]
     (le nom lu, ou la valeur du champ .fo-nom s'il se modifie) ; une
     colonne masquée (au téléphone, une formule à la fois) ne compte pas.
   · La bande suit le défilement en largeur du tableau, et se cale sous la
     barre du haut quand il y en a une (au téléphone).
   ========================================================================== */

type Colonne = { gauche: number; largeur: number; nom: string };
type Etat = { visible: boolean; haut: number; gauche: number; largeur: number; colonnes: Colonne[] };

export function RappelColonnes({ tableau }: { tableau: string }) {
  const [etat, setEtat] = useState<Etat>({ visible: false, haut: 0, gauche: 0, largeur: 0, colonnes: [] });
  const image = useRef(0);

  useEffect(() => {
    const mesure = () => {
      image.current = 0;
      const t = document.querySelector<HTMLTableElement>(tableau);
      const tete = t?.tHead;
      if (!t || !tete) return;
      const cadre = (t.closest(".defile") ?? t).getBoundingClientRect();
      const barre = document.querySelector<HTMLElement>(".app-haut");
      const haut = barre && getComputedStyle(barre).position !== "static" ? Math.max(0, barre.getBoundingClientRect().bottom) : 0;
      const rt = t.getBoundingClientRect();
      const visible = tete.getBoundingClientRect().bottom < haut && rt.bottom > haut + 96;
      const colonnes = [...tete.querySelectorAll<HTMLElement>("th[data-rappel]")]
        .map((th) => {
          const r = th.getBoundingClientRect();
          const champ = th.querySelector<HTMLInputElement>("input.fo-nom");
          return { gauche: r.left - cadre.left, largeur: r.width, nom: (champ?.value || th.dataset.rappel || "").trim() };
        })
        .filter((c) => c.largeur > 0);
      setEtat((avant) => {
        const neuf = { visible, haut, gauche: cadre.left, largeur: cadre.width, colonnes };
        return JSON.stringify(avant) === JSON.stringify(neuf) ? avant : neuf;
      });
    };
    const demande = () => { if (!image.current) image.current = requestAnimationFrame(mesure); };
    mesure();
    window.addEventListener("scroll", demande, { passive: true, capture: true });
    window.addEventListener("resize", demande);
    document.addEventListener("input", demande);
    document.addEventListener("change", demande);
    return () => {
      cancelAnimationFrame(image.current);
      window.removeEventListener("scroll", demande, { capture: true });
      window.removeEventListener("resize", demande);
      document.removeEventListener("input", demande);
      document.removeEventListener("change", demande);
    };
  }, [tableau]);

  return (
    <div className="rappel-colonnes" aria-hidden="true" data-visible={etat.visible ? "" : undefined}
      style={{ top: etat.haut, left: etat.gauche, width: etat.largeur }}>
      {etat.colonnes.map((c, i) => (
        <span key={i} style={{ left: c.gauche, width: c.largeur }}>{c.nom}</span>
      ))}
    </div>
  );
}
