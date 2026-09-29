"use client";

import { useState } from "react";

/** Copie un texte dans le presse-papiers ; dit « Copié » un instant. */
export function BoutonCopier({ texte, libelle = "Copier le lien" }: { texte: string; libelle?: string }) {
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
    <button type="button" className="btn btn-primaire" onClick={copier} aria-live="polite">
      {etat === "copie" ? "Copié ✓" : etat === "echec" ? "Sélectionnez et copiez le lien" : libelle}
    </button>
  );
}
