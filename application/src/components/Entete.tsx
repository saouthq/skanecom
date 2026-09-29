import Link from "next/link";
import { Loupe } from "./Icones";
import { BoutonPanier } from "./BoutonPanier";
import { champ, t } from "@/lib/i18n";
import { urlFichier } from "@/lib/photos";
import type { Cadre } from "@/lib/boutique";

/* ============================================================================
   EN-TÊTE — logo de la boutique, rayons RÉELS, recherche, panier.

   La navigation ne contient aucun rayon inventé : elle est bâtie sur les
   rayons actifs de premier niveau de la boutique. La recherche est un LIEN
   vers une page, pas une boîte qui exige du JavaScript.
   ========================================================================== */

export function Logo({ cadre }: { cadre: Cadre }) {
  const { logo } = cadre.theme;
  if (!logo) return <span className="marque-texte">{cadre.boutique.nom}</span>;
  if (logo.mode === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="marque-image" src={urlFichier(logo.chemin)} alt={cadre.boutique.nom} />;
  }
  return <span className="marque" role="img" aria-label={cadre.boutique.nom} />;
}

export function Entete({ cadre, actif }: { cadre: Cadre; actif?: string }) {
  return (
    <header className="entete">
      <div className="enveloppe entete-rang">
        <Link href="/" aria-label={t.marque.accueilAria(cadre.boutique.nom)}>
          <Logo cadre={cadre} />
        </Link>

        <nav className="nav" aria-label={t.commun.navigationPrincipale}>
          {cadre.racines.slice(0, 5).map((c) => (
            <Link
              key={c.slug}
              href={`/categorie/${c.slug}`}
              aria-current={actif === c.slug ? "page" : undefined}
            >
              {champ(c, "nom")}
            </Link>
          ))}
          <Link href="/catalogue" aria-current={actif === "catalogue" ? "page" : undefined}>
            {t.commun.toutLeCatalogue}
          </Link>
        </nav>

        <div className="entete-actions">
          <Link className="icone-btn" href="/recherche" aria-label={t.commun.rechercher}>
            <Loupe />
          </Link>
          <BoutonPanier />
        </div>
      </div>
    </header>
  );
}
