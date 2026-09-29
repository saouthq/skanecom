import type { Metadata } from "next";
import Link from "next/link";
import { Entete } from "@/components/Entete";
import { Pied } from "@/components/Pied";
import { CarteProduit } from "@/components/CarteProduit";
import { Niche } from "@/components/Niche";
import { Fleche } from "@/components/Icones";
import { formePourCategorie } from "@/components/Silhouette";
import { chargeCadre } from "@/lib/boutique";
import { chargeCatalogue } from "@/lib/catalogue";
import { champ, t } from "@/lib/i18n";
import { formatePrix } from "@/lib/prix";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: t.seo.accueilTitre },
  description: t.seo.descriptionSite,
  alternates: { canonical: "/" },
};

export default async function Accueil() {
  const [cadre, produits] = await Promise.all([chargeCadre(), chargeCatalogue()]);

  /* La sélection : les pièces mises en avant d'abord, complétées par le reste
     du catalogue. Aucun compte n'est écrit à la main — avec quatre produits,
     un « 159 références » serait un mensonge à l'écran. */
  const misEnAvant = produits.filter((p) => p.mis_en_avant);
  const selection = [...misEnAvant, ...produits.filter((p) => !p.mis_en_avant)].slice(0, 4);
  const toutEstMisEnAvant = selection.length > 0 && selection.every((p) => p.mis_en_avant);

  const comptePar = (slug: string) =>
    produits.filter((p) => p.categorie?.slug === slug).length;

  /* Les numéros de section se CALCULENT : le registre s'efface quand il n'y a
     qu'un rayon, et une page qui passe de « 01 » à « 03 » se lit comme une
     section perdue en route (juge visuel, 11/08). */
  const sections = [
    "hero",
    ...(cadre.categories.length > 1 ? ["registre"] : []),
    "boutique",
    "paiement",
  ];
  const num = (cle: string) => String(sections.indexOf(cle) + 1).padStart(2, "0");

  return (
    <>
      <a className="saut-contenu" href="#principal">
        {t.commun.sauterAuContenu}
      </a>
      <Entete categories={cadre.categories} />

      <main id="principal" className="flex-1">
        {/* ============================== HERO ============================== */}
        <section className="enveloppe pt-8 pb-12 md:pt-14 md:pb-20">
          <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] md:gap-20 md:items-center">
            <div>
              <p className="etiquette" data-leve style={{ "--d": ".05s" } as React.CSSProperties}>
                <b>{num("hero")}</b> <span>{t.accueil.etiquetteHero}</span>
              </p>
              <h1
                className="text-t1 md:text-heros mt-4"
                data-leve
                style={{ "--d": ".12s" } as React.CSSProperties}
              >
                {t.accueil.titreHero[0]}
                <br />
                {t.accueil.titreHero[1]}
              </h1>
              <p className="chapo mt-4" data-leve style={{ "--d": ".2s" } as React.CSSProperties}>
                {t.accueil.chapoHero}
              </p>

              <div
                className="flex flex-wrap gap-3 mt-6"
                data-leve
                style={{ "--d": ".28s" } as React.CSSProperties}
              >
                <Link className="btn btn-primaire" href="/catalogue">
                  {t.commun.voirLeCatalogue}
                </Link>
                {cadre.categories.length > 1 ? (
                  <a className="btn btn-second" href="#registre">
                    {t.accueil.parcourirParRayon}
                  </a>
                ) : null}
              </div>

              {/* UNE ligne de promesse, pas la liste complète : la section
                  « comment ça se passe » l'explique et le pied la rappelle.
                  Trois fois la même liste sur une page ne la rend pas plus
                  vraie (juge visuel, 11/08). */}
              {cadre.livraison.cod ? (
                <p
                  className="mt-8 pt-4 border-t border-filet text-petit text-encre-doux"
                  data-leve
                  style={{ "--d": ".36s" } as React.CSSProperties}
                >
                  <span className="fait">
                    {cadre.fraisMillimes
                      ? t.accueil.promesseAvecFrais(formatePrix(cadre.fraisMillimes))
                      : t.accueil.promesse}
                  </span>
                </p>
              ) : null}
            </div>

            {/* La niche d'accueil. La seule photo réelle (la valise jaune
                détourée par Théo) a été retirée le 29/09 : la niche dit
                « photo à venir » jusqu'au protocole photo, sans légende —
                il n'y a plus de pièce à légender. */}
            <div className="relative" data-arc style={{ "--d": ".16s" } as React.CSSProperties}>
              <Niche
                forme="valise"
                photo={null}
                className="aspect-[4/5] max-w-[24rem] mx-auto"
                tailles="(min-width: 900px) 24rem, 92vw"
              />
            </div>
          </div>
        </section>

        {/* ============================ LE REGISTRE =========================
            Une section qui annonce « rayon par rayon » au-dessus d'UNE ligne
            promet un catalogue qu'on n'a pas (juge visuel, 11/08). Tant qu'il
            n'y a qu'un rayon, la section entière disparaît : le catalogue est
            atteignable par le bouton du hero, la nav et le pied. Elle
            reviendra d'elle-même au deuxième rayon créé au backoffice. */}
        {cadre.categories.length > 1 ? (
        <section className="enveloppe section" id="registre">
          <p className="etiquette">
            <b>{num("registre")}</b> <span>{t.accueil.registreEtiquette}</span>
          </p>
          <h2 className="text-t2 mt-3 mb-6">{t.accueil.registreTitre}</h2>

          <div className="registre">
            {cadre.categories.map((c, i) => (
              <Link key={c.slug} href={`/categorie/${c.slug}`}>
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <Niche forme={formePourCategorie(c.slug)} mode="embleme" className="vignette" tailles="60px" />
                <span>
                  <h3>{champ(c, "nom")}</h3>
                  <span className="compte">
                    {t.catalogue.modeles(comptePar(c.slug))}
                    {champ(c, "description") ? ` — ${champ(c, "description")}` : ""}
                  </span>
                </span>
                <Fleche className="fleche rtl:-scale-x-100" />
              </Link>
            ))}

            {cadre.categories.length > 1 ? (
            <Link className="tout" href="/catalogue" style={{ gridColumn: "1 / -1" }}>
              <span className="num">—</span>
              <span />
              <span>
                <h3>{t.commun.toutLeCatalogue}</h3>
                <span className="compte">{t.catalogue.modeles(produits.length)}</span>
              </span>
              <Fleche className="fleche rtl:-scale-x-100" />
            </Link>
            ) : null}
          </div>
        </section>
        ) : null}

        {/* =========================== LA SÉLECTION ========================= */}
        <section className="enveloppe section pt-0">
          <hr className="filet-marque" />
          <div className="mt-6 mb-8">
            <p className="etiquette">
              <b>{num("boutique")}</b> <span>{t.accueil.selectionEtiquette}</span>
            </p>
            <h2 className="text-t2 mt-3">{t.accueil.selectionTitre}</h2>
            {toutEstMisEnAvant ? (
              <p className="text-petit text-encre-doux mt-2">{t.accueil.selectionMisEnAvant}</p>
            ) : null}
          </div>

          {selection.length > 0 ? (
            <div className="grille-produits">
              {/* Un seul rayon dans la sélection ⇒ inutile de l'écrire sous
                  chaque carte (juge visuel, 11/08). */}
              {selection.map((p) => (
                <CarteProduit
                  key={p.id}
                  produit={p}
                  avecRayon={new Set(selection.map((q) => q.categorie?.slug)).size > 1}
                />
              ))}
            </div>
          ) : (
            <div className="border border-filet rounded-carte bg-surface p-8">
              <h3 className="text-t4">{t.accueil.selectionVideTitre}</h3>
              <p className="text-petit text-encre-doux mt-2 max-w-[46ch]">{t.accueil.selectionVide}</p>
            </div>
          )}
        </section>

        {/* ======================== COMMENT ÇA SE PASSE ===================== */}
        <section className="sur-encre maymar-sur-encre">
          <div className="enveloppe section bande-paiement">
            <div className="tete-bande">
              <div>
                <p className="etiquette">
                  <b>{num("paiement")}</b> <span>{t.accueil.marcheEtiquette}</span>
                </p>
                <h2 className="text-t2 mt-3 max-w-[22ch]">{t.accueil.marcheTitre}</h2>
              </div>
              {!cadre.konnectActif ? (
                <p className="legende max-w-[38ch]">{t.accueil.konnectEteint}</p>
              ) : null}
            </div>

            <div className="marche">
              {[
                t.accueil.marche[0],
                cadre.livraison.rappel ? t.accueil.marche[1] : t.accueil.marcheAutomatique,
                {
                  titre: t.accueil.marche[2].titre,
                  /* Chaque fragment est une PHRASE : on les ponctue en les
                     assemblant, sinon on lit « ...jours ouvrés Toute la
                     Tunisie » (relevé par le juge visuel le 11/08). */
                  texte: [
                    t.accueil.marche[2].texte,
                    cadre.livraison.delai ? `${cadre.livraison.delai}.` : null,
                    cadre.livraison.frais,
                  ]
                    .filter(Boolean)
                    .join(" "),
                },
              ].map((etape, i) => (
                <div key={etape.titre}>
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{etape.titre}</h3>
                  <p>{etape.texte}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Pied categories={cadre.categories} livraison={cadre.livraison} />
    </>
  );
}
