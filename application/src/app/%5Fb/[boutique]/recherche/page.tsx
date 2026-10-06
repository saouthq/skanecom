import type { Metadata } from "next";
import Link from "next/link";
import { Gabarit } from "@/components/Gabarit";
import { CarteProduit } from "@/components/CarteProduit";
import { EnteteListe } from "@/components/EnteteListe";
import { ChampRecherche } from "@/components/ChampRecherche";
import { Loupe } from "@/components/Icones";
import { cadre as chargeCadre, type Cadre } from "@/lib/boutique";
import { listeProduits, type CriteresSql, type Liste } from "@/lib/catalogue";
import { champ, t } from "@/lib/i18n";
import { dinarsVersMillimes } from "@/lib/prix";
import { comprendre, type Comprise } from "@/lib/recherche-phrase";

/* La recherche lit son terme dans l'adresse (`?q=`) : c'est la seule page de
   la vitrine qui n'est pas mise en cache. Elle cherche en base (nom, marque,
   description, référence, fautes de frappe comprises : public.liste_produits).

   Avec le réglage catalogue.recherche_phrase, une phrase se comprend d'abord
   (lib/recherche-phrase.ts) : le rayon, les déclinaisons, le prix, le stock
   deviennent des filtres, le reste est cherché en texte. Ce qui est compris
   est montré, avec « mot pour mot » (`&mot=1`) pour chercher la phrase telle
   quelle. Rien de compris, ou rien de trouvé : la recherche mot pour mot. */

/** La phrase comprise, cherchée : avec ses mots restants, puis sans eux
 *  (`ignores` : les mots qui n'ont rien donné, dits à l'écran). */
async function chercheComprise(cadre: Cadre, requete: string): Promise<{ comprise: Comprise; liste: Liste; ignores: string | null } | null> {
  const tout = await listeProduits(cadre.boutique.id, {}, "nouveautes", 1, 1);
  const comprise = comprendre(requete, {
    rayons: cadre.categories.map((c) => ({ slug: c.slug, nom: champ(c, "nom") })),
    axes: tout.facettes.axes.map((a) => ({
      cle: a.cle,
      nom: champ(a, "label"),
      valeurs: (tout.facettes.options[a.cle] ?? []).map((o) => o.valeur),
    })),
  });
  if (!comprise) return null;
  const criteres: CriteresSql = {
    ...(comprise.rayon ? { rayon: comprise.rayon } : {}),
    ...(Object.keys(comprise.options).length ? { options: comprise.options } : {}),
    ...(comprise.enStock ? { en_stock: true } : {}),
    ...(comprise.prixMin !== null ? { prix_min: dinarsVersMillimes(comprise.prixMin) } : {}),
    ...(comprise.prixMax !== null ? { prix_max: dinarsVersMillimes(comprise.prixMax) } : {}),
  };
  if (comprise.reste) {
    const avecTexte = await listeProduits(cadre.boutique.id, { ...criteres, q: comprise.reste }, "pertinence", 1, 48);
    if (avecTexte.total > 0) return { comprise, liste: avecTexte, ignores: null };
  }
  const sansTexte = await listeProduits(cadre.boutique.id, criteres, "pertinence", 1, 48);
  return sansTexte.total > 0 ? { comprise: { ...comprise, reste: "" }, liste: sansTexte, ignores: comprise.reste || null } : null;
}

export const metadata: Metadata = {
  title: t.seo.rechercheTitre,
  robots: { index: false, follow: true },
};

export default async function Recherche({
  params,
  searchParams,
}: {
  params: Promise<{ boutique: string }>;
  searchParams: Promise<{ q?: string; mot?: string }>;
}) {
  const [{ boutique }, { q, mot }] = await Promise.all([params, searchParams]);
  const cadre = await chargeCadre(boutique);
  const requete = (q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const comprise = requete.length >= 2 && cadre.recherchePhrase && mot !== "1" ? await chercheComprise(cadre, requete) : null;
  const liste = comprise?.liste ?? (requete.length >= 2 ? await listeProduits(cadre.boutique.id, { q: requete }, "pertinence", 1, 48) : null);
  const n = liste?.total ?? 0;
  const gabarit = cadre.theme.code;

  return (
    <Gabarit>
      <EnteteListe gabarit={gabarit} fil={[{ nom: t.recherche.titre }]} titre={t.recherche.titre}>
        <form action="/recherche" method="get" role="search" className="recherche-page">
          <label htmlFor="q" className="sr-only">
            {t.recherche.champAria}
          </label>
          <span className="recherche-page-champ">
            <ChampRecherche id="q" defaultValue={requete} placeholder={t.recherche.placeholder} />
          </span>
          <button type="submit" className="btn btn-primaire">
            <Loupe taille={18} />
            {t.recherche.lancer}
          </button>
        </form>
        <p className="recherche-bilan" aria-live="polite">
          {liste ? t.recherche.resultats(n, requete) : requete ? t.recherche.tropCourt : t.recherche.invite}
        </p>
        {comprise ? (
          <div className="recherche-comprise">
            <span className="recherche-comprise-titre">{t.recherche.compris}</span>
            <ul>
              {comprise.comprise.morceaux.map((m) => (
                <li key={`${m.genre}-${m.libelle}`} data-genre={m.genre}>{m.libelle}</li>
              ))}
              {comprise.comprise.reste ? <li data-genre="texte">{t.recherche.reste(comprise.comprise.reste)}</li> : null}
            </ul>
            {comprise.ignores ? <p className="recherche-comprise-ignore">{t.recherche.ignores(comprise.ignores)}</p> : null}
            <Link className="lien-souligne" href={`/recherche?${new URLSearchParams({ q: requete, mot: "1" })}`}>
              {t.recherche.motPourMot(requete)}
            </Link>
          </div>
        ) : null}
      </EnteteListe>

      {liste && liste.produits.length > 0 ? (
        <div className={`${gabarit === "technique" ? "te-grille" : "ed-grille"} recherche-resultats`}>
          {liste.produits.map((p, i) => (
            <CarteProduit key={p.id} produit={p} gabarit={gabarit} prixBarres={cadre.prixBarres} prioritaire={i < 4} />
          ))}
        </div>
      ) : liste ? (
        <div className="listing-vide">
          <p>{t.recherche.videTexte}</p>
          <Link className="btn btn-second" href="/catalogue">
            {t.commun.voirLeCatalogue}
          </Link>
        </div>
      ) : null}
    </Gabarit>
  );
}
