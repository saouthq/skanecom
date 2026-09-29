import Link from "next/link";
import { Loupe } from "./Icones";
import { BoutonPanier } from "./BoutonPanier";
import { NavRayons } from "./NavRayons";
import { champ, t } from "@/lib/i18n";
import { urlFichier } from "@/lib/photos";
import type { Cadre } from "@/lib/boutique";

/* ============================================================================
   EN-TÊTE — logo de la boutique, rayons RÉELS, recherche, panier.

   La navigation ne contient aucun rayon inventé : elle est bâtie sur les
   rayons actifs de premier niveau de la boutique. La recherche est un LIEN
   vers une page, pas une boîte qui exige du JavaScript. Il est posé par le
   layout : il ne se redessine pas d'une page à l'autre (le tiroir du panier
   reste ouvert si on y navigue) et la page introuvable l'a aussi.
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

/** slug de chaque rayon → slug de son rayon de premier niveau. */
function racines(cadre: Cadre): Record<string, string> {
  const parId = new Map(cadre.categories.map((c) => [c.id, c]));
  const sortie: Record<string, string> = {};
  for (const c of cadre.categories) {
    let r = c;
    for (let garde = 0; r.parent_id && parId.has(r.parent_id) && garde < 10; garde++) r = parId.get(r.parent_id)!;
    sortie[c.slug] = r.slug;
  }
  return sortie;
}

export function Entete({ cadre }: { cadre: Cadre }) {
  const liens = [
    ...cadre.racines.slice(0, 5).map((c) => ({ cle: c.slug, href: `/categorie/${c.slug}`, nom: champ(c, "nom") })),
    { cle: "catalogue", href: "/catalogue", nom: t.commun.toutLeCatalogue },
  ];
  return (
    <header className="entete">
      <div className="enveloppe entete-rang">
        <Link href="/" aria-label={t.marque.accueilAria(cadre.boutique.nom)}>
          <Logo cadre={cadre} />
        </Link>

        <NavRayons liens={liens} racineDe={racines(cadre)} libelle={t.commun.navigationPrincipale} />

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
