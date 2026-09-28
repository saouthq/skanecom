import Link from "next/link";
import { Loupe } from "./Icones";
import { BoutonPanier } from "./BoutonPanier";
import { champ, t } from "@/lib/i18n";
import type { Categorie } from "@/lib/catalogue";

/* ============================================================================
   EN-TÊTE — logo, rayons RÉELS, recherche, panier.

   La navigation ne contient aucun rayon inventé : elle est bâtie sur les
   catégories actives de la base. Un catalogue d'une seule catégorie affiche
   une seule entrée — c'est honnête, et ça se remplira tout seul quand le père
   ajoutera des rayons depuis le backoffice.

   La recherche est un LIEN vers une page, pas une boîte qui exige du
   JavaScript : elle fonctionne même si le script ne charge pas.
   ========================================================================== */

export function Entete({
  categories,
  actif,
}: {
  categories: Categorie[];
  actif?: string;
}) {
  return (
    <header className="entete">
      <div className="enveloppe entete-rang">
        <Link href="/" aria-label={t.marque.accueilAria}>
          <span className="marque" />
        </Link>

        <nav className="nav" aria-label={t.commun.navigationPrincipale}>
          {categories.slice(0, 5).map((c) => (
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
