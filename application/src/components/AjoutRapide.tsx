"use client";

import { useState } from "react";
import { Coche, Panier } from "./Icones";
import { ajouteAuPanier, ouvrePanier } from "@/lib/panier";
import { prixApplique, usePrixPro } from "@/lib/prix-pro";
import { t } from "@/lib/i18n";
import type { LignePanier } from "@/lib/panier-contrat";

/* L'ajout direct depuis une carte (gabarit technique) — seulement quand le
   produit n'a qu'UNE déclinaison, en stock : il n'y a rien à choisir, on ne
   fait pas ouvrir la fiche pour rien. Sinon la carte propose « Choisir ».
   Une déclinaison vendue par lot (des vis par dix) s'ajoute par son minimum,
   et le bouton le dit : « Ajouter ×10 ». */
export function AjoutRapide({ ligne, stock, nom, produitId }: {
  ligne: Omit<LignePanier, "ajouteLe">;
  stock: number;
  nom: string;
  /** Pour le prix pro d'un pro connecté (module comptes_pro). */
  produitId: string;
}) {
  const [ajoute, setAjoute] = useState(false);
  const pro = usePrixPro([produitId]);
  return (
    <button
      type="button"
      className="btn btn-primaire btn-bloc te-carte-ajout"
      data-ajoute={ajoute ? "" : undefined}
      aria-label={`${ligne.quantite > 1 ? t.produit.ajouterLot(ligne.quantite) : t.produit.ajouterAuPanier} — ${nom}`}
      onClick={() => {
        ajouteAuPanier({ ...ligne, prixMillimesAjout: prixApplique(pro, { id: ligne.varianteId, prix_millimes: ligne.prixMillimesAjout }) }, stock);
        setAjoute(true);
        ouvrePanier();
      }}
    >
      {ajoute ? <Coche taille={18} /> : <Panier taille={18} />}
      {ajoute ? t.panier.ajoute : ligne.quantite > 1 ? `${t.produit.ajouter} ×${ligne.quantite}` : t.produit.ajouter}
    </button>
  );
}
