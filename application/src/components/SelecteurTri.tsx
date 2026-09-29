"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { cheminFiltres, type Filtres, type Tri } from "@/lib/filtres";
import { noteReprise, reprends } from "@/lib/reprise";

/* Le tri est un formulaire GET vers /filtrer comme les filtres : il
   fonctionne sans script (bouton « Trier »). Avec script, changer de tri mène
   directement à l'adresse canonique, sans recharger ni remonter la page. Les
   filtres en cours voyagent avec le tri — trier ne doit jamais défaire un
   filtre. */
export function SelecteurTri({ base, valeurs }: { base: string; valeurs: Filtres }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [tri, setTri] = useState<Tri>(valeurs.tri);
  // L'adresse a changé ailleurs (retour arrière) : le menu la suit.
  const [suivi, setSuivi] = useState(valeurs.tri);
  if (suivi !== valeurs.tri) {
    setSuivi(valeurs.tri);
    setTri(valeurs.tri);
  }
  useEffect(() => reprends("tri", form.current), []);

  const trie = (valeur: Tri) => {
    setTri(valeur);
    noteReprise("tri", form.current);
    router.push(cheminFiltres(base, { ...valeurs, tri: valeur, page: 1 }), { scroll: false });
  };

  const options: { valeur: Tri; libelle: string }[] = [
    { valeur: "nouveautes", libelle: t.catalogue.tris.nouveautes },
    { valeur: "prix-asc", libelle: t.catalogue.tris.prixCroissant },
    { valeur: "prix-desc", libelle: t.catalogue.tris.prixDecroissant },
    { valeur: "nom", libelle: t.catalogue.tris.nom },
  ];

  return (
    <form
      ref={form}
      action="/filtrer"
      method="get"
      className="ms-auto flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        trie(tri);
      }}
    >
      <input type="hidden" name="base" value={base} />
      {Object.entries(valeurs.options).flatMap(([cle, liste]) =>
        liste.map((v) => <input key={`${cle}${v}`} type="hidden" name={`a.${cle}`} value={v} />),
      )}
      {valeurs.enStock ? <input type="hidden" name="stock" value="1" /> : null}
      {valeurs.minDinars !== null ? <input type="hidden" name="min" value={valeurs.minDinars} /> : null}
      {valeurs.maxDinars !== null ? <input type="hidden" name="max" value={valeurs.maxDinars} /> : null}

      <label htmlFor="tri" className="text-petit text-encre-doux">
        {t.catalogue.trier}
      </label>
      <select id="tri" name="tri" value={tri} onChange={(e) => trie(e.target.value as Tri)}>
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
