"use client";

import { useState, type KeyboardEvent } from "react";

/* ============================================================================
   LA QUANTITÉ, TAPÉE — entre « − » et « + », un vrai champ : 500 vis à
   l'unité (par 20 au moins) ne se comptent pas à coups de « + ». On tape le
   nombre ; il est borné (le minimum de la déclinaison, le stock) quand on
   quitte le champ ou qu'on valide par Entrée. Les flèches haut et bas
   l'avancent d'un, comme les boutons. Un champ vidé ou illisible revient à
   la quantité d'avant.
   ========================================================================== */

export function ChampQuantite({
  valeur,
  minimum = 1,
  maximum,
  onChange,
  libelle,
  className,
}: {
  valeur: number;
  minimum?: number;
  /** Le stock (ou rien : le panier ne le connaît pas, la commande vérifie). */
  maximum?: number;
  onChange: (quantite: number) => void;
  libelle: string;
  className?: string;
}) {
  // Le texte en cours de frappe ; `null` = le champ montre la valeur.
  const [texte, setTexte] = useState<string | null>(null);
  const borne = (n: number) => Math.max(minimum, maximum === undefined ? n : Math.min(n, Math.max(minimum, maximum)));

  const valide = () => {
    if (texte === null) return;
    const n = Number.parseInt(texte, 10);
    setTexte(null);
    if (Number.isFinite(n) && n > 0 && borne(n) !== valeur) onChange(borne(n));
  };

  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      valide();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const n = borne(valeur + (e.key === "ArrowUp" ? 1 : -1));
      setTexte(null);
      if (n !== valeur) onChange(n);
    } else if (e.key === "Escape" && texte !== null) {
      setTexte(null);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      enterKeyHint="done"
      className={className ?? "qte-saisie"}
      aria-label={libelle}
      value={texte ?? String(valeur)}
      onChange={(e) => setTexte(e.target.value.replace(/\D/g, "").slice(0, 6))}
      onFocus={(e) => e.target.select()}
      onBlur={valide}
      onKeyDown={touche}
    />
  );
}
