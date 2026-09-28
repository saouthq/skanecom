import Link from "next/link";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { chargeCadre } from "@/lib/boutique";
import { t } from "@/lib/i18n";

/* Une page introuvable reste une page de la maison : même en-tête, mêmes
   rayons, une sortie évidente. La page 404 par défaut de Next serait la seule
   surface du site à ne pas porter la marque. */

export default async function Introuvable() {
  const cadre = await chargeCadre();

  return (
    <>
      <Entete categories={cadre.categories} />
      <main id="principal" className="enveloppe flex-1 section">
        <p className="etiquette">
          <b>404</b> <span>{t.introuvable.etiquette}</span>
        </p>
        <h1 className="text-t2 md:text-t1 mt-3 max-w-[20ch]">{t.introuvable.titre}</h1>
        <p className="chapo mt-4">{t.introuvable.texte}</p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link className="btn btn-primaire" href="/catalogue">
            {t.commun.voirLeCatalogue}
          </Link>
          <Link className="btn btn-second" href="/recherche">
            {t.commun.rechercher}
          </Link>
        </div>
      </main>
      <Pied categories={cadre.categories} livraison={cadre.livraison} />
    </>
  );
}
