"use client";

import { useRef } from "react";
import { t } from "@/lib/i18n";
import type { Filtres, Tri } from "@/lib/filtres";

/* Le tri est un formulaire GET comme les filtres : il fonctionne sans script
   (bouton « Trier »), et le script le soumet au changement. Les filtres en
   cours voyagent en champs cachés — trier ne doit jamais défaire un filtre. */
export function SelecteurTri({ action, valeurs }: { action: string; valeurs: Filtres }) {
  const form = useRef<HTMLFormElement>(null);

  const options: { valeur: Tri; libelle: string }[] = [
    { valeur: "nouveautes", libelle: t.catalogue.tris.nouveautes },
    { valeur: "prix-asc", libelle: t.catalogue.tris.prixCroissant },
    { valeur: "prix-desc", libelle: t.catalogue.tris.prixDecroissant },
    { valeur: "nom", libelle: t.catalogue.tris.nom },
  ];

  return (
    <form ref={form} action={action} method="get" className="ms-auto flex items-center gap-2">
      {valeurs.rayons.map((v) => (
        <input key={`r${v}`} type="hidden" name="rayon" value={v} />
      ))}
      {valeurs.couleurs.map((v) => (
        <input key={`c${v}`} type="hidden" name="couleur" value={v} />
      ))}
      {valeurs.tailles.map((v) => (
        <input key={`s${v}`} type="hidden" name="taille" value={v} />
      ))}
      {valeurs.enStock ? <input type="hidden" name="stock" value="1" /> : null}
      {valeurs.minDinars !== null ? <input type="hidden" name="min" value={valeurs.minDinars} /> : null}
      {valeurs.maxDinars !== null ? <input type="hidden" name="max" value={valeurs.maxDinars} /> : null}

      <label htmlFor="tri" className="text-petit text-encre-doux">
        {t.catalogue.trier}
      </label>
      <select
        id="tri"
        name="tri"
        defaultValue={valeurs.tri}
        onChange={() => form.current?.requestSubmit()}
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn-second">
          {t.catalogue.trier}
        </button>
      </noscript>
    </form>
  );
}
