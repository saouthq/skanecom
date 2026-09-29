import Link from "next/link";
import { t } from "@/lib/i18n";

/* Page introuvable d'une boutique. Next.js ne lui donne pas les paramètres de
   la route : elle ne connaît donc pas la boutique, mais elle s'affiche dans
   son layout, donc à ses couleurs, et propose une sortie évidente. */
export default function Introuvable() {
  return (
    <main id="principal" className="enveloppe flex-1 section">
      <p className="etiquette">
        <b>404</b> <span>{t.introuvable.etiquette}</span>
      </p>
      <h1 className="text-t2 md:text-t1 mt-3 max-w-[20ch]">{t.introuvable.titre}</h1>
      <p className="chapo mt-4">{t.introuvable.texte}</p>
      <div className="flex flex-wrap gap-3 mt-8">
        <Link className="btn btn-primaire" href="/">{t.commun.accueil}</Link>
        <Link className="btn btn-second" href="/catalogue">{t.commun.voirLeCatalogue}</Link>
      </div>
    </main>
  );
}
