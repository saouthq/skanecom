import Link from "next/link";
import { FilAriane, type Etape } from "./FilAriane";
import type { CodeTheme } from "@/lib/theme";

/* L'en-tête d'une liste (catalogue, rayon, recherche) : fil d'Ariane,
   titre, chapô et sous-rayons. Éditorial : un titre de magazine, centré sur
   la page. Technique : un titre net, le compte et les sous-rayons en tuiles. */
export function EnteteListe({
  gabarit,
  fil,
  titre,
  chapo,
  sousRayons = [],
  children,
}: {
  gabarit: CodeTheme;
  fil: Etape[];
  titre: string;
  chapo?: string | null;
  sousRayons?: { slug: string; nom: string; compte?: number }[];
  children?: React.ReactNode;
}) {
  return (
    <header className={gabarit === "technique" ? "te-entete-liste" : "ed-entete-liste"}>
      <FilAriane etapes={fil} />
      <h1>{titre}</h1>
      {chapo ? <p className="chapo">{chapo}</p> : null}
      {sousRayons.length > 0 ? (
        <ul className="sous-rayons">
          {sousRayons.map((r) => (
            <li key={r.slug}>
              <Link href={`/categorie/${r.slug}`}>
                <span>{r.nom}</span>
                {r.compte !== undefined ? <span className="n">{r.compte}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </header>
  );
}
