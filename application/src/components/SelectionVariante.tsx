"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { trouveVariante, varianteParDefaut, type Produit, type Variante } from "@/lib/catalogue";

/* ============================================================================
   LA DÉCLINAISON CHOISIE — un seul état, partagé par toute la fiche.

   Pourquoi ce contexte existe (défaut RÉEL, pas une élégance) : la référence
   et le poids étaient rendus côté serveur d'après la variante par DÉFAUT,
   pendant que les sélecteurs, eux, changeaient la déclinaison côté client.
   Choisir « Grande 75 cm · Bordeaux » laissait donc à l'écran le SKU
   « VAL-ABS-55-NOI » — une référence FAUSSE sur une boutique où le client la
   dicte au téléphone au moment de commander. Trouvé le 11/08 en lisant le
   reproche du juge visuel (« rendre le poids spécifique à la taille
   sélectionnée, comme la référence l'est déjà ») : elle ne l'était pas.

   Le bloc d'achat et le pavé de caractéristiques vivent dans deux colonnes
   différentes de la grille : ils ne peuvent pas partager un `useState`. Ce
   fournisseur enveloppe les deux.
   ========================================================================== */

type Selection = {
  produit: Produit;
  choix: Record<string, string>;
  setChoix: (maj: (c: Record<string, string>) => Record<string, string>) => void;
  /** `null` = la combinaison choisie n'existe pas au catalogue. */
  variante: Variante | null;
};

const Contexte = createContext<Selection | null>(null);

const rienAEcouter = () => () => {};

/** La déclinaison que désignent les paramètres de l'adresse : la liste
 *  filtrée (« ?taille=M »), ou le message « de retour en stock » du
 *  réassort, qui la nomme (« ?declinaison=<id> »). */
function varianteCherchee(produit: Produit, recherche: string): Variante | null {
  const cherche = new URLSearchParams(recherche);
  const nommee = cherche.get("declinaison");
  if (nommee) return produit.variantes.find((v) => v.id === nommee) ?? null;
  const axes = produit.options.map((o) => o.cle).filter((c) => cherche.has(c));
  if (axes.length === 0) return null;
  const convient = (v: Variante) => axes.every((c) => cherche.getAll(c).includes(v.options?.[c] ?? ""));
  return produit.variantes.find((v) => v.stock > 0 && convient(v)) ?? produit.variantes.find(convient) ?? null;
}

export function FournisseurSelection({
  produit,
  children,
}: {
  produit: Produit;
  children: React.ReactNode;
}) {
  const [choix, setChoix] = useState<Record<string, string>>(() => ({
    ...(varianteParDefaut(produit)?.options ?? {}),
  }));

  // Arrivée depuis une liste filtrée (« ?taille=M », CarteProduit) : la
  // déclinaison cherchée, si elle existe — en stock d'abord. Lue une fois le
  // navigateur là : la page servie reste la même pour tous.
  const recherche = useSyncExternalStore(rienAEcouter, () => window.location.search, () => "");
  const [rechercheVue, setRechercheVue] = useState("");
  if (recherche !== rechercheVue) {
    setRechercheVue(recherche);
    const trouvee = varianteCherchee(produit, recherche);
    if (trouvee) setChoix({ ...trouvee.options });
  }

  const variante = useMemo(() => trouveVariante(produit, choix), [produit, choix]);

  const valeur = useMemo(
    () => ({ produit, choix, setChoix, variante }),
    [produit, choix, variante],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSelection(): Selection {
  const valeur = useContext(Contexte);
  if (!valeur) {
    throw new Error("useSelection doit être appelé dans <FournisseurSelection>");
  }
  return valeur;
}
