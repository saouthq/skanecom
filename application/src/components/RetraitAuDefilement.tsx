"use client";

import { useEffect } from "react";

/** Au téléphone, le bouton WhatsApp flottant couvrait le « + » des cartes de
 *  droite : il se retire quand on descend la page (on parcourt), revient dès
 *  qu'on remonte, en haut de page et en bas (au pied). Pose
 *  `data-defile="bas"` sur la racine ; le style fait le reste (contenus.css). */
export function RetraitAuDefilement() {
  useEffect(() => {
    const racine = document.documentElement;
    let avant = scrollY;
    let attente = 0;
    const lire = () => {
      attente = 0;
      const y = scrollY;
      const enBas = y + innerHeight >= racine.scrollHeight - 160;
      if (y < 200 || enBas || y < avant - 8) delete racine.dataset.defile;
      else if (y > avant + 8) racine.dataset.defile = "bas";
      if (Math.abs(y - avant) > 8) avant = y;
    };
    const surDefilement = () => { if (!attente) attente = requestAnimationFrame(lire); };
    addEventListener("scroll", surDefilement, { passive: true });
    return () => {
      removeEventListener("scroll", surDefilement);
      if (attente) cancelAnimationFrame(attente);
      delete racine.dataset.defile;
    };
  }, []);
  return null;
}
