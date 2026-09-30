"use client";

import { useState } from "react";
import { Icone } from "@/components/console/Icone";

/** Copie un texte dans le presse-papiers ; dit « Copié » un instant. */
export function BoutonCopier({ texte, libelle = "Copier le lien", classe = "btn btn-primaire" }: { texte: string; libelle?: string; classe?: string }) {
  const [etat, setEtat] = useState<"" | "copie" | "echec">("");
  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setEtat("copie");
    } catch {
      setEtat("echec");
    }
    setTimeout(() => setEtat(""), 2500);
  }
  return (
    <button type="button" className={classe} onClick={copier} aria-live="polite">
      <Icone nom={etat === "copie" ? "coche" : "copier"} />
      {etat === "copie" ? "Copié" : etat === "echec" ? "Sélectionnez et copiez le lien" : libelle}
    </button>
  );
}
