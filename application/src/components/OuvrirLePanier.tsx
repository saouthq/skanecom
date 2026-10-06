"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ouvrePanier } from "@/lib/panier";
import { t } from "@/lib/i18n";

/* ============================================================================
   L'ADRESSE /panier — le panier vit dans un tiroir de l'en-tête ; qui tape
   l'adresse (ou y revient par l'historique) le voit s'ouvrir, et la page
   derrière le propose encore une fois fermé.
   ========================================================================== */

export function OuvrirLePanier() {
  // Après le montage de l'en-tête : son tiroir écoute alors l'ouverture.
  useEffect(() => {
    const id = window.setTimeout(ouvrePanier, 0);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="panier-page-gestes">
      <button type="button" className="btn btn-primaire" onClick={ouvrePanier}>{t.panier.ouvrirLePanier}</button>
      <Link className="btn btn-second" href="/catalogue">{t.panier.continuer}</Link>
    </div>
  );
}
