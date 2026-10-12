"use client";

import { useState } from "react";
import { Icone } from "./Icone";

/* ============================================================================
   CHOISIR UN FICHIER, dans un formulaire envoyé tel quel : une zone où l'on
   clique ou dépose le fichier, en français quelle que soit la langue du
   navigateur (le bouton natif disait « Choose File »). Le vrai champ couvre
   la zone, invisible : le clic, le dépôt et le clavier restent les siens.
   ========================================================================== */

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`);

export function ChoixFichier({ id, name, accept, required, aideId }: { id: string; name: string; accept: string; required?: boolean; aideId?: string }) {
  const [fichier, setFichier] = useState<{ nom: string; octets: number } | null>(null);
  const [survol, setSurvol] = useState(false);
  return (
    <div className="cf-zone" data-survol={survol ? "" : undefined} data-choisi={fichier ? "" : undefined}>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        className="cf-entree"
        aria-describedby={aideId}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          setFichier(f ? { nom: f.name, octets: f.size } : null);
        }}
        onDragEnter={() => setSurvol(true)}
        onDragLeave={() => setSurvol(false)}
        onDrop={() => setSurvol(false)}
      />
      <span className="cf-icone" aria-hidden="true"><Icone nom={fichier ? "fichier" : "importer"} taille={18} /></span>
      <span className="cf-texte" aria-live="polite">
        <strong>{fichier ? fichier.nom : "Choisir un fichier"}</strong>
        <span>{fichier ? `${taille(fichier.octets)} · prêt, ou choisissez-en un autre` : "ou glissez-le ici"}</span>
      </span>
    </div>
  );
}
