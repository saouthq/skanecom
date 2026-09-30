import Link from "next/link";
import { ChampRecherche } from "@/components/ChampRecherche";
import { Loupe } from "@/components/Icones";
import { t } from "@/lib/i18n";

/* Page introuvable d'une boutique. Next.js ne lui donne pas les paramètres de
   la route : elle ne connaît donc pas la boutique, mais elle s'affiche dans
   son layout, donc à ses couleurs, et propose une sortie évidente : chercher
   tout de suite (les pièces se proposent pendant la frappe), ou repartir de
   l'accueil ou du catalogue. */
export default function Introuvable() {
  return (
    <main id="principal" className="enveloppe flex-1 section">
      <p className="etiquette">
        <b>404</b> <span>{t.introuvable.etiquette}</span>
      </p>
      <h1 className="text-t2 md:text-t1 mt-3 max-w-[20ch]">{t.introuvable.titre}</h1>
      <p className="chapo mt-4">{t.introuvable.texte}</p>
      <form action="/recherche" method="get" role="search" className="recherche-page mt-8">
        <label htmlFor="q-introuvable" className="sr-only">
          {t.recherche.champAria}
        </label>
        <span className="recherche-page-champ">
          <ChampRecherche id="q-introuvable" placeholder={t.recherche.placeholder} />
        </span>
        <button type="submit" className="btn btn-primaire">
          <Loupe taille={18} />
          {t.recherche.lancer}
        </button>
      </form>
      <div className="flex flex-wrap gap-3 mt-6">
        <Link className="btn btn-second" href="/">{t.commun.accueil}</Link>
        <Link className="btn btn-second" href="/catalogue">{t.commun.voirLeCatalogue}</Link>
      </div>
    </main>
  );
}
