"use client";

import { useEffect, useState } from "react";
import { supabaseNavigateur } from "./supabase-navigateur";

/* ============================================================================
   LES PRIX PRO DANS LA VITRINE (module comptes_pro) — la page servie est la
   même pour tous (le cache n'a jamais de prix pro) ; une fois hydratée, si
   l'acheteur est connecté, elle demande à la base les prix pro des produits
   affichés (public.mes_prix_pro). La base ne répond qu'à un pro validé de
   cette boutique ; les autres reçoivent un objet vide, et rien ne change.
   ========================================================================== */

/** { variante_id: prix pro en millimes } — vide tant qu'il n'y a rien à dire. */
export type PrixPro = Record<string, number>;

const VIDE: PrixPro = {};

export function usePrixPro(boutiqueId: string, produits: string[], actif: boolean): PrixPro {
  const [prix, setPrix] = useState<PrixPro>(VIDE);
  const cle = produits.join(",");

  useEffect(() => {
    if (!actif || !cle) return;
    let vivant = true;
    const sb = supabaseNavigateur();
    const lit = () =>
      sb.rpc("mes_prix_pro", { p_boutique_id: boutiqueId, p_produits: cle.split(",") }).then(({ data, error }) => {
        if (vivant) setPrix(!error && data && typeof data === "object" ? (data as PrixPro) : VIDE);
      });
    // À l'ouverture de la page, puis à chaque connexion ou déconnexion.
    const { data } = sb.auth.onAuthStateChange((_evenement, session) => {
      if (session) void lit();
      else if (vivant) setPrix(VIDE);
    });
    return () => {
      vivant = false;
      data.subscription.unsubscribe();
    };
  }, [boutiqueId, cle, actif]);

  return prix;
}
