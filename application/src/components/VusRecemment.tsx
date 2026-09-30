"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PrixCarte } from "./PrixCarte";
import { noteVu, oublieVus, useVus } from "@/lib/vus";
import { t } from "@/lib/i18n";
import type { ProduitVu, ReponseVus } from "@/lib/suggestions";

/* ============================================================================
   LE RAIL « VUS RÉCEMMENT » — les pièces consultées dans ce navigateur
   (lib/vus.ts), relues en base (prix « dès », photo, stock ; au prix pro
   pour un pro connecté). Sur une fiche, la pièce courante n'y figure pas et
   s'inscrit en tête pour la suivante. Défilement horizontal, aimanté ;
   « Effacer » oublie la liste. Rien d'affiché tant que rien n'a été vu : le
   rail ne prend pas de place pour rien. `section` et `tete` : les classes
   du gabarit (te-section, ed-section…), pour qu'il se range comme les
   autres sections de la page.
   ========================================================================== */

export function VusRecemment({ courant, section, tete }: { courant?: string; section: string; tete: string }) {
  const vus = useVus();
  const cle = vus.filter((s) => s !== courant).slice(0, 10).join(",");
  const [produits, setProduits] = useState<{ cle: string; liste: ProduitVu[] } | null>(null);

  // La fiche courante entre dans la liste (pour la prochaine fiche).
  useEffect(() => {
    if (courant) noteVu(courant);
  }, [courant]);

  useEffect(() => {
    if (!cle) return;
    const arret = new AbortController();
    fetch(`/recherche/vus?slugs=${encodeURIComponent(cle)}`, { signal: arret.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ReponseVus>) : { produits: [] }))
      .then((rep) => setProduits({ cle, liste: rep.produits }))
      .catch(() => {});
    return () => arret.abort();
  }, [cle]);

  const liste = produits && produits.cle === cle ? produits.liste : [];
  if (!cle || liste.length === 0) return null;
  return (
    <section className={`vus ${section}`} aria-labelledby="vus-titre">
      <div className={tete}>
        <h2 id="vus-titre">{t.vus.titre}</h2>
        <button type="button" className="lien-souligne vus-effacer" onClick={oublieVus} aria-label={t.vus.effacerAria}>
          {t.vus.effacer}
        </button>
      </div>
      <ul className="vus-rail" role="list">
        {liste.map((p, i) => (
          <li key={p.slug} className="vus-carte" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
            <Link href={`/produit/${p.slug}`} className="vus-lien">
              <span className="vus-photo" data-etat={p.etat}>
                {p.photo ? (
                  <Image src={p.photo} alt="" fill sizes="(min-width: 700px) 184px, 36vw" />
                ) : (
                  <span className="panier-vignette-attente">{p.nom.trim().charAt(0)}</span>
                )}
                {p.etat === "rupture" ? <span className="vus-rupture">{t.stock.rupture}</span> : null}
              </span>
              {p.marque ? <span className="vus-marque">{p.marque}</span> : null}
              <span className="vus-nom">{p.nom}</span>
              <PrixCarte classe="vus-prix" produitId={p.id} variantes={p.variantes} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
