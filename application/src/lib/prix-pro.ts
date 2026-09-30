"use client";

import { useEffect, useSyncExternalStore } from "react";
import { supabaseNavigateur } from "./supabase-navigateur";

/* ============================================================================
   LES PRIX PRO DANS LA VITRINE (module comptes_pro) — la page servie est la
   même pour tous (le cache n'a jamais de prix pro) ; une fois hydratée, si
   l'acheteur est connecté, elle demande à la base les prix pro des produits
   affichés (public.mes_prix_pro). La base ne répond qu'à un pro validé de
   cette boutique ; les autres reçoivent un objet vide, et rien ne change.

   Un seul magasin pour la page : la fiche, chaque carte d'une grille, l'ajout
   direct s'y inscrivent avec leurs produits ; les inscriptions d'un même
   instant partent en un seul appel (60 produits au plus par appel). La
   boutique et le module se lisent sur <html data-pro> (posé par le layout
   quand le module est actif) : aucun composant n'a à les recevoir.
   ========================================================================== */

/** { variante_id: prix pro en millimes } — vide tant qu'il n'y a rien à dire. */
export type PrixPro = Record<string, number>;

const VIDE: PrixPro = {};
let prix: PrixPro = VIDE;
const abonnes = new Set<() => void>();
const inscrits = new Set<string>();
const lus = new Set<string>();
let connecte = false;
let ecoute = false;
let minuterie: ReturnType<typeof setTimeout> | undefined;

const boutique = () => (typeof document === "undefined" ? "" : (document.documentElement.dataset.pro ?? ""));

function publie(suivant: PrixPro) {
  prix = suivant;
  for (const f of abonnes) f();
}

async function lit() {
  minuterie = undefined;
  const id = boutique();
  const produits = [...inscrits].filter((p) => !lus.has(p));
  if (!id || !connecte || produits.length === 0) return;
  for (const p of produits) lus.add(p);
  const sb = supabaseNavigateur();
  for (let i = 0; i < produits.length; i += 60) {
    const { data, error } = await sb.rpc("mes_prix_pro", { p_boutique_id: id, p_produits: produits.slice(i, i + 60) });
    if (!connecte) return;
    if (!error && data && typeof data === "object" && Object.keys(data).length) publie({ ...prix, ...(data as PrixPro) });
  }
}

function planifie() {
  if (connecte && minuterie === undefined) minuterie = setTimeout(() => void lit(), 20);
}

function ecouteSession() {
  if (ecoute) return;
  ecoute = true;
  supabaseNavigateur().auth.onAuthStateChange((_evenement, session) => {
    const avant = connecte;
    connecte = Boolean(session);
    if (!connecte) {
      lus.clear();
      if (prix !== VIDE) publie(VIDE);
    } else if (!avant) {
      lus.clear();
      planifie();
    }
  });
}

function inscrit(produits: string[]) {
  if (!boutique()) return;
  ecouteSession();
  for (const p of produits) if (p) inscrits.add(p);
  planifie();
}

function abonne(rappel: () => void) {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

/** Les prix pro connus pour la page (ceux des produits demandés par ce
 *  composant compris, dès qu'ils arrivent). Vide pour tous les autres. */
export function usePrixPro(produits: string[]): PrixPro {
  const cle = produits.join(",");
  useEffect(() => {
    inscrit(cle.split(","));
  }, [cle]);
  return useSyncExternalStore(abonne, () => prix, () => VIDE);
}

/** Le prix appliqué d'une déclinaison : le prix pro s'il y en a un, plus bas. */
export function prixApplique(pro: PrixPro, variante: { id: string; prix_millimes: number }): number {
  const p = pro[variante.id];
  return p !== undefined && p < variante.prix_millimes ? p : variante.prix_millimes;
}
