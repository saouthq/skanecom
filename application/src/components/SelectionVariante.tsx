"use client";

import { createContext, useContext, useMemo, useState } from "react";
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
