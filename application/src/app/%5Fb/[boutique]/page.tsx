import type { Metadata } from "next";
import Link from "next/link";
import { Gabarit } from "@/components/Gabarit";
import { CarteProduit } from "@/components/CarteProduit";
import { Niche } from "@/components/Niche";
import { Fleche } from "@/components/Icones";
import { formePourCategorie } from "@/components/Silhouette";
import { cadre as chargeCadre, descendance, type Cadre } from "@/lib/boutique";
import { listeProduits, type Produit } from "@/lib/catalogue";
import { texte, type Section } from "@/lib/theme";
import { urlFichier } from "@/lib/photos";
import { champ, t } from "@/lib/i18n";
import { formatePrix } from "@/lib/prix";

/* ============================================================================
   L'ACCUEIL — composé des SECTIONS du thème de la boutique, dans l'ordre
   qu'elle a choisi (table `themes.sections`, ou les sections par défaut du
   thème) : bandeau, rayons, sélection, « comment ça se passe », texte libre.
   Aucun texte de marque n'est écrit ici : il vient du thème.
   ========================================================================== */

export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ boutique: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);
  const titre = texte(cadre.theme.textes, "seo_titre") || cadre.boutique.nom;
  return { title: { absolute: titre }, alternates: { canonical: "/" } };
}

export default async function Accueil({ params }: Params) {
  const { boutique } = await params;
  const cadre = await chargeCadre(boutique);

  /* Seules les sections qui ont de quoi s'afficher sont gardées : le registre
     s'efface tant qu'il n'y a qu'un rayon. Leurs numéros se CALCULENT sur
     celles qui restent — une page qui saute de « 01 » à « 03 » se lit comme
     une section perdue en route. */
  const sections = cadre.theme.sections.filter((s) => {
    if (s.type === "rayons") return cadre.racines.length > 1;
    if (s.type === "comment_ca_marche") return cadre.livraison.cod;
    if (s.type === "texte") return Boolean(texte(s.textes, "titre") || texte(s.textes, "texte"));
    return true;
  });
  const nombreSelection = Math.max(
    0,
    ...sections.map((s) => (s.type === "selection" ? (s.nombre ?? 4) : 0)),
  );
  const selection = nombreSelection > 0
    ? (await listeProduits(cadre.boutique.id, {}, "selection", 1, nombreSelection)).produits
    : [];

  return (
    <Gabarit cadre={cadre} className="flex-1">
      {sections.map((s, i) => {
        // Seules les sections qui affichent une étiquette portent un numéro.
        const rang = sections.slice(0, i + 1).filter(porteUnNumero).length;
        const num = String(rang).padStart(2, "0");
        switch (s.type) {
          case "hero":
            return <Hero key={i} section={s} cadre={cadre} num={num} />;
          case "rayons":
            return <Registre key={i} section={s} cadre={cadre} num={num} />;
          case "selection":
            return <Selection key={i} section={s} produits={selection.slice(0, s.nombre ?? 4)} num={num} />;
          case "comment_ca_marche":
            return <CommentCaMarche key={i} section={s} cadre={cadre} num={num} />;
          case "texte":
            return <Texte key={i} section={s} num={num} />;
        }
      })}
    </Gabarit>
  );
}

/** Une section affiche-t-elle son étiquette numérotée ? Le bandeau et le
 *  texte libre seulement si la boutique leur a donné une étiquette. */
function porteUnNumero(s: Section): boolean {
  if (s.type === "hero" || s.type === "texte") return Boolean(texte(s.textes, "etiquette"));
  return true;
}

function Etiquette({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <p className="etiquette">
      <b>{num}</b> <span>{children}</span>
    </p>
  );
}

function Hero({ section, cadre, num }: { section: Extract<Section, { type: "hero" }>; cadre: Cadre; num: string }) {
  const titre = texte(section.textes, "titre", cadre.boutique.nom).split("\n");
  const chapo = texte(section.textes, "chapo") || texte(cadre.theme.textes, "resume") || t.accueil.chapoHero;
  const etiquette = texte(section.textes, "etiquette");
  const photo = section.image
    ? {
        src: urlFichier(section.image.chemin),
        alt: texte(section.textes, "image_alt", cadre.boutique.nom),
        detoure: section.image.detouree,
      }
    : null;

  return (
    <section className="enveloppe pt-8 pb-12 md:pt-14 md:pb-20">
      <div className={photo ? "grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] md:gap-20 md:items-center" : "max-w-[46rem]"}>
        <div>
          {etiquette ? (
            <div data-leve style={{ "--d": ".05s" } as React.CSSProperties}>
              <Etiquette num={num}>{etiquette}</Etiquette>
            </div>
          ) : null}
          <h1 className="text-t1 md:text-heros mt-4" data-leve style={{ "--d": ".12s" } as React.CSSProperties}>
            {titre.map((ligne, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {ligne}
              </span>
            ))}
          </h1>
          <p className="chapo mt-4" data-leve style={{ "--d": ".2s" } as React.CSSProperties}>
            {chapo}
          </p>

          <div className="flex flex-wrap gap-3 mt-6" data-leve style={{ "--d": ".28s" } as React.CSSProperties}>
            <Link className="btn btn-primaire" href="/catalogue">
              {t.commun.voirLeCatalogue}
            </Link>
            {cadre.racines.length > 1 ? (
              <a className="btn btn-second" href="#registre">
                {t.accueil.parcourirParRayon}
              </a>
            ) : null}
          </div>

          {/* UNE ligne de promesse, pas la liste complète : la section
              « comment ça se passe » l'explique, le pied la rappelle. */}
          {cadre.livraison.cod ? (
            <p className="mt-8 pt-4 border-t border-filet text-petit text-encre-doux" data-leve style={{ "--d": ".36s" } as React.CSSProperties}>
              <span className="fait">
                {cadre.fraisMillimes
                  ? t.accueil.promesseAvecFrais(
                      formatePrix(cadre.fraisMillimes),
                      cadre.seuilGratuiteMillimes ? formatePrix(cadre.seuilGratuiteMillimes) : undefined,
                    )
                  : t.accueil.promesse}
              </span>
            </p>
          ) : null}
        </div>

        {photo ? (
          <div className="relative" data-arc style={{ "--d": ".16s" } as React.CSSProperties}>
            <Niche photo={photo} className="aspect-[4/5] max-w-[24rem] mx-auto" prioritaire tailles="(min-width: 900px) 24rem, 92vw" />
            {texte(section.textes, "cartel") ? (
              <p className="mt-4 text-legende text-encre-doux border-t border-filet pt-2">{texte(section.textes, "cartel")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Registre({ section, cadre, num }: { section: Extract<Section, { type: "rayons" }>; cadre: Cadre; num: string }) {
  const compte = (slug: string) =>
    descendance(cadre.categories, slug).reduce((n, c) => n + (c.nb_produits ?? 0), 0);

  return (
    <section className="enveloppe section" id="registre">
      <Etiquette num={num}>{texte(section.textes, "etiquette", t.accueil.registreEtiquette)}</Etiquette>
      <h2 className="text-t2 mt-3 mb-6">{texte(section.textes, "titre", t.accueil.registreTitre)}</h2>

      <div className="registre">
        {cadre.racines.map((c, i) => (
          <Link key={c.slug} href={`/categorie/${c.slug}`}>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <Niche forme={formePourCategorie(c.slug)} mode="embleme" className="vignette" tailles="60px" />
            <span>
              <h3>{champ(c, "nom")}</h3>
              <span className="compte">
                {t.catalogue.modeles(compte(c.slug))}
                {champ(c, "description") ? ` — ${champ(c, "description")}` : ""}
              </span>
            </span>
            <Fleche className="fleche rtl:-scale-x-100" />
          </Link>
        ))}

        <Link className="tout" href="/catalogue" style={{ gridColumn: "1 / -1" }}>
          <span className="num">—</span>
          <span />
          <span>
            <h3>{t.commun.toutLeCatalogue}</h3>
            <span className="compte">{t.catalogue.modeles(cadre.boutique.nb_produits)}</span>
          </span>
          <Fleche className="fleche rtl:-scale-x-100" />
        </Link>
      </div>
    </section>
  );
}

function Selection({ section, produits, num }: { section: Extract<Section, { type: "selection" }>; produits: Produit[]; num: string }) {
  const toutEstMisEnAvant = produits.length > 0 && produits.every((p) => p.mis_en_avant);
  return (
    <section className="enveloppe section pt-0">
      <hr className="filet-marque" />
      <div className="mt-6 mb-8">
        <Etiquette num={num}>{texte(section.textes, "etiquette", t.accueil.selectionEtiquette)}</Etiquette>
        <h2 className="text-t2 mt-3">{texte(section.textes, "titre", t.accueil.selectionTitre)}</h2>
        {toutEstMisEnAvant ? <p className="text-petit text-encre-doux mt-2">{t.accueil.selectionMisEnAvant}</p> : null}
      </div>

      {produits.length > 0 ? (
        <div className="grille-produits">
          {/* Un seul rayon dans la sélection ⇒ inutile de l'écrire sous chaque carte. */}
          {produits.map((p) => (
            <CarteProduit key={p.id} produit={p} avecRayon={new Set(produits.map((q) => q.categorie?.slug)).size > 1} />
          ))}
        </div>
      ) : (
        <div className="border border-filet rounded-carte bg-surface p-8">
          <h3 className="text-t4">{t.accueil.selectionVideTitre}</h3>
          <p className="text-petit text-encre-doux mt-2 max-w-[46ch]">{t.accueil.selectionVide}</p>
        </div>
      )}
    </section>
  );
}

function CommentCaMarche({ section, cadre, num }: { section: Extract<Section, { type: "comment_ca_marche" }>; cadre: Cadre; num: string }) {
  if (!cadre.livraison.cod) return null;
  const etapes = [
    t.accueil.marche[0],
    cadre.livraison.rappel ? t.accueil.marche[1] : t.accueil.marcheAutomatique,
    {
      titre: t.accueil.marche[2].titre,
      /* Chaque fragment est une PHRASE : on les ponctue en les assemblant. */
      texte: [t.accueil.marche[2].texte, cadre.livraison.delai ? `${cadre.livraison.delai}.` : null, cadre.livraison.frais]
        .filter(Boolean)
        .join(" "),
    },
  ];

  return (
    <section className="sur-encre theme-sur-encre">
      <div className="enveloppe section bande-paiement">
        <div className="tete-bande">
          <div>
            <Etiquette num={num}>{texte(section.textes, "etiquette", t.accueil.marcheEtiquette)}</Etiquette>
            <h2 className="text-t2 mt-3 max-w-[22ch]">{texte(section.textes, "titre", t.accueil.marcheTitre)}</h2>
          </div>
          {!cadre.konnectActif ? <p className="legende max-w-[38ch]">{t.accueil.konnectEteint}</p> : null}
        </div>

        <div className="marche">
          {etapes.map((etape, i) => (
            <div key={etape.titre}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{etape.titre}</h3>
              <p>{etape.texte}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Texte({ section, num }: { section: Extract<Section, { type: "texte" }>; num: string }) {
  const titre = texte(section.textes, "titre");
  const corps = texte(section.textes, "texte");
  if (!titre && !corps) return null;
  return (
    <section className="enveloppe section">
      {texte(section.textes, "etiquette") ? <Etiquette num={num}>{texte(section.textes, "etiquette")}</Etiquette> : null}
      {titre ? <h2 className="text-t2 mt-3">{titre}</h2> : null}
      {corps ? <p className="chapo mt-4 whitespace-pre-line">{corps}</p> : null}
    </section>
  );
}
