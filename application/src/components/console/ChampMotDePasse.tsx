"use client";

import { useState } from "react";
import { Icone } from "./Icone";

/** Un mot de passe qu'on peut afficher le temps de le relire (sur un
 *  téléphone, une faute de frappe ne se voit pas). Le champ reste un champ
 *  de formulaire ordinaire : il part avec le formulaire, sans script. */
export function ChampMotDePasse({ id, name, autoComplete, minLength, decritPar, autoFocus }: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  decritPar?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="champ-mdp">
      <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength}
        aria-describedby={decritPar} autoFocus={autoFocus} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="champ-mdp-oeil" aria-pressed={visible} aria-controls={id}
        title={visible ? "Masquer" : "Afficher"} onClick={() => setVisible((v) => !v)}>
        <Icone nom="oeil" taille={16} />
        <span className="sr-only">{visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}</span>
      </button>
    </span>
  );
}
