import Link from "next/link";
import { champ, t } from "@/lib/i18n";
import type { Categorie } from "@/lib/catalogue";

/* ============================================================================
   PIED DE PAGE

   Deux règles tenues ici, contre l'habitude :
   1. AUCUN lien mort. La maquette proposait « Conditions de vente », « Mentions
      légales », « Qui nous sommes » : ces textes n'existent pas (ils reviennent
      à Diane, PRD §4). Un lien qui mène nulle part sur un site de démonstration
      se voit tout de suite. La colonne « Commander » porte donc des FAITS, pas
      des liens — et ces faits viennent des réglages, jamais du code.
   2. Les rayons listés sont les rayons RÉELS de la base.
   ========================================================================== */

export function Pied({
  categories,
  livraison,
}: {
  categories: Categorie[];
  livraison: { frais: string | null; delai: string | null; cod: boolean; rappel: boolean };
}) {
  return (
    <footer className="pied maymar-sur-encre mt-auto">
      <div className="enveloppe">
        <div className="pied-grille">
          <div>
            <span className="marque" style={{ inlineSize: "148px" }} />
            <p className="text-petit mt-4 max-w-[34ch] text-[color-mix(in_srgb,var(--maymar-blanc)_70%,transparent)]">
              {t.marque.resume}
            </p>
          </div>

          <div>
            <p className="titre-col">{t.pied.catalogue}</p>
            <ul>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/categorie/${c.slug}`}>{champ(c, "nom")}</Link>
                </li>
              ))}
              <li>
                <Link href="/catalogue">{t.commun.toutLeCatalogue}</Link>
              </li>
              <li>
                <Link href="/recherche">{t.commun.rechercher}</Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="titre-col">{t.pied.commander}</p>
            {/* DEUX faits, pas quatre : la fiche produit porte déjà le détail
                complet, et le répéter mot pour mot en pied le transforme en
                bruit (juge visuel, 11/08). */}
            <ul className="text-[color-mix(in_srgb,var(--maymar-blanc)_72%,transparent)]">
              {livraison.cod ? <li>{t.pied.paiementLivraison}</li> : null}
              {livraison.delai ? <li>{livraison.delai}</li> : null}
            </ul>
          </div>
        </div>

        <div className="pied-bas">
          <span>{t.pied.droits(new Date().getFullYear())}</span>
          <span>{t.pied.devise}</span>
        </div>
      </div>
    </footer>
  );
}
