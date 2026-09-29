import Link from "next/link";
import { t } from "@/lib/i18n";

export type Etape = { nom: string; href?: string };

/* Le fil d'Ariane : des liens, la page courante en dernier, sans lien. Les
   séparateurs sont décoratifs (CSS), la liste reste lisible au lecteur
   d'écran. */
export function FilAriane({ etapes }: { etapes: Etape[] }) {
  return (
    <nav className="fil" aria-label={t.commun.filAriane}>
      <ol>
        <li>
          <Link href="/">{t.commun.accueil}</Link>
        </li>
        {etapes.map((e, i) => (
          <li key={`${e.nom}-${i}`}>
            {e.href && i < etapes.length - 1 ? <Link href={e.href}>{e.nom}</Link> : <span aria-current="page">{e.nom}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
