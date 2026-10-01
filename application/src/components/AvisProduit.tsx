import Image from "next/image";
import { Etoiles } from "./Etoiles";
import { ListeAvis } from "./ListeAvis";
import { t } from "@/lib/i18n";
import { noteLisible, type AvisProduit as Avis } from "@/lib/avis";
import { urlFichier } from "@/lib/photos";

/* ============================================================================
   LES AVIS D'UN PRODUIT (module avis) — sous la fiche : la moyenne, la
   répartition des notes, puis les avis, le plus récent d'abord, chacun
   « Achat vérifié » (seul un client livré note l'article reçu), avec la
   déclinaison achetée et la réponse de la boutique. Rien tant qu'aucun avis
   n'est publié. `section` et `tete` : les classes du gabarit.

   Avec le réglage avis.photos : les photos jointes sous chaque avis, et en
   tête de la liste « Les photos des clients », en rang. La liste elle-même
   (ses filtres, sa suite) vit dans le navigateur : ListeAvis.

   Sous le titre de la fiche, ResumeAvis : les étoiles et le nombre d'avis,
   un lien vers la section ; et dès que plusieurs avis ont des photos, trois
   vignettes et « 6 photos de clients », un lien vers leur rang.
   ========================================================================== */

export function ResumeAvis({ avis }: { avis: Avis | null }) {
  if (!avis || avis.total === 0 || avis.moyenne === null) return null;
  const photos = avis.photos ?? [];
  const illustres = new Set(photos.map((p) => p.avis_id)).size;
  return (
    <div className="fiche-avis-tete">
      <a className="fiche-avis-resume" href="#avis">
        <Etoiles note={avis.moyenne} taille={15} />
        <span className="fiche-avis-note">{noteLisible(avis.moyenne)}</span>
        <span className="fiche-avis-total">{t.avis.total(avis.total)}</span>
      </a>
      {/* Comme le rang qu'il annonce : dès que les photos viennent de plusieurs avis. */}
      {illustres > 1 ? (
        <a className="fiche-avis-photos" href="#avis-rang">
          <span className="fiche-avis-vignettes" aria-hidden="true">
            {photos.slice(0, 3).map((p) => (
              <span key={p.id}>
                <Image src={urlFichier(p.chemin)} alt="" fill sizes="32px" />
              </span>
            ))}
          </span>
          <span className="fiche-avis-total">{t.avis.photosClientsCourt(photos.length)}</span>
        </a>
      ) : null}
    </div>
  );
}

export function AvisProduit({ avis, produitId, section, tete }: { avis: Avis | null; produitId: string; section: string; tete: string }) {
  if (!avis || avis.total === 0 || avis.moyenne === null) return null;
  return (
    <section id="avis" className={`avis ${section}`} aria-labelledby="avis-titre">
      <div className={tete}>
        <h2 id="avis-titre">{t.avis.titre}</h2>
      </div>
      <ListeAvis avis={avis} produitId={produitId} />
    </section>
  );
}
