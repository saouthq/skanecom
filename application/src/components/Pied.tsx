import Link from "next/link";
import { Logo } from "./Entete";
import { champ, t } from "@/lib/i18n";
import { texte } from "@/lib/theme";
import type { Cadre } from "@/lib/boutique";

/* ============================================================================
   PIED DE PAGE

   Deux règles tenues ici, contre l'habitude :
   1. AUCUN lien mort : pas de « Conditions de vente » ni de « Mentions
      légales » tant que ces pages n'existent pas. La colonne « Commander »
      porte des FAITS, et ces faits viennent des réglages, jamais du code.
   2. Les rayons listés sont les rayons RÉELS de la boutique.
   ========================================================================== */

export function Pied({ cadre }: { cadre: Cadre }) {
  const { livraison, theme } = cadre;
  const resume = texte(theme.textes, "resume");
  return (
    <footer className="pied theme-sur-encre mt-auto">
      <div className="enveloppe">
        <div className="pied-grille">
          <div>
            <Logo cadre={cadre} />
            {resume ? (
              <p className="text-petit mt-4 max-w-[34ch] text-[color-mix(in_srgb,var(--theme-surface)_70%,transparent)]">
                {resume}
              </p>
            ) : null}
          </div>

          <div>
            <p className="titre-col">{t.pied.catalogue}</p>
            <ul>
              {cadre.racines.map((c) => (
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
            <ul className="text-[color-mix(in_srgb,var(--theme-surface)_72%,transparent)]">
              {livraison.cod ? <li>{t.pied.paiementLivraison}</li> : null}
              {livraison.delai ? <li>{livraison.delai}</li> : null}
            </ul>
          </div>
        </div>

        <div className="pied-bas">
          <span>{t.pied.droits(new Date().getFullYear(), cadre.boutique.nom, texte(theme.textes, "origine") || undefined)}</span>
          <span>{t.pied.devise}</span>
        </div>
      </div>
    </footer>
  );
}
