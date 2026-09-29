import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { urlFichier } from "@/lib/photos";
import { FILTRES_CATALOGUE, PEUT_MODIFIER, type ListeProduits } from "@/lib/gestion/catalogue";

export const metadata: Metadata = { title: "Catalogue" };

const PAR_PAGE = 60;

/* ============================================================================
   LE CATALOGUE — tous les produits de la boutique, en vitrine ou en
   brouillon ; les filtres « stock bas » et « rupture » disent quoi
   recommander. Recherche par nom, marque ou référence.
   ========================================================================== */
export default async function Catalogue({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filtre?: string; q?: string; page?: string; ok?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const filtre = FILTRES_CATALOGUE.find((f) => f.cle === recherche.filtre) ?? FILTRES_CATALOGUE[0];
  const q = (recherche.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_liste_produits", {
    p_boutique_id: boutique.boutique_id,
    p_filtre: filtre.cle,
    p_recherche: q || null,
    p_limite: PAR_PAGE,
    p_decalage: (page - 1) * PAR_PAGE,
  });
  if (error) throw new Error(`Catalogue illisible : ${error.message}`);
  const liste = data as ListeProduits;
  const pages = Math.max(1, Math.ceil(liste.total / PAR_PAGE));
  const base = `/gestion/${slug}/produits`;
  const lien = (f: string, p = 1) => `${base}?filtre=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  const peutCreer = PEUT_MODIFIER.includes(boutique.role);

  return (
    <>
      <EnTetePage
        titre="Catalogue"
        description={`${liste.compteurs.tous} produit${liste.compteurs.tous > 1 ? "s" : ""}, dont ${liste.compteurs.publies} en vitrine.`}
        actions={
          <>
            <form role="search" method="get" action={base} className="bo-recherche">
              <input type="hidden" name="filtre" value={filtre.cle} />
              <label htmlFor="q" className="sr-only">Chercher un produit</label>
              <span className="bo-recherche-champ">
                <Icone nom="recherche" />
                <input id="q" name="q" type="search" className="entree" defaultValue={q} placeholder="Nom, marque ou référence" autoComplete="off" />
              </span>
              <button type="submit" className="btn btn-second">Chercher</button>
            </form>
            {peutCreer ? (
              <Link href={`${base}/nouveau`} className="btn btn-primaire"><Icone nom="plus" /> Nouveau produit</Link>
            ) : null}
          </>
        }
      />

      {recherche.ok ? <p className="message message-succes mb-4" role="status">{recherche.ok}</p> : null}

      <nav className="onglets" aria-label="Filtres du catalogue">
        {FILTRES_CATALOGUE.map((f) => (
          <Link key={f.cle} href={lien(f.cle)} aria-current={f.cle === filtre.cle ? "page" : undefined}>
            {f.libelle}
            <span className={`compte-onglet${(f.cle === "stock_bas" || f.cle === "rupture") && liste.compteurs[f.cle] > 0 ? " compte-alerte" : ""}`}>
              {liste.compteurs[f.cle]}
            </span>
          </Link>
        ))}
      </nav>

      {q ? (
        <p className="bo-resultat" role="status">
          {liste.total} produit{liste.total > 1 ? "s" : ""} pour « {q} »
          <Link href={lien(filtre.cle).replace(/&q=[^&]*/, "")} className="btn btn-fantome btn-petit"><Icone nom="croix" taille={14} /> Effacer</Link>
        </p>
      ) : null}

      {liste.produits.length === 0 ? (
        <div className="vide cat-vide">
          <span className="vide-icone"><Icone nom={q ? "recherche" : "colis"} taille={20} /></span>
          <strong>{q ? "Aucun résultat" : "Rien ici"}</strong>
          <p>{q ? `Aucun produit « ${filtre.libelle.toLowerCase()} » ne correspond à « ${q} ».` : filtre.vide}</p>
        </div>
      ) : (
        <ul className="cat-liste" role="list">
          {liste.produits.map((p) => (
            <li key={p.id} className="cat-ligne">
              <Link href={`${base}/${p.id}`} className="cat-ligne-lien">
                <span className="cat-vignette">
                  {p.image ? <Image src={urlFichier(p.image)} alt="" fill sizes="48px" /> : <Icone nom="colis" taille={18} />}
                </span>
                <span className="cat-ligne-nom">
                  <strong>{p.nom}</strong>
                  <span>{[p.marque, p.categorie].filter(Boolean).join(" · ") || "Sans rayon"}</span>
                </span>
                <span className="cat-ligne-etat">
                  {p.publie
                    ? <span className="ui-etat ui-etat-point ui-etat-vert">En vitrine</span>
                    : <span className="ui-etat ui-etat-point">Brouillon</span>}
                </span>
                <span className="cat-ligne-var">
                  {p.nb_variantes} déclinaison{p.nb_variantes > 1 ? "s" : ""}
                </span>
                <span className="cat-ligne-stock">
                  {p.stock_total === 0 ? (
                    <span className="ui-etat ui-etat-point ui-etat-rouge">Rupture</span>
                  ) : p.variantes_bas > 0 ? (
                    <span className="ui-etat ui-etat-point ui-etat-ambre">{p.stock_total} · stock bas</span>
                  ) : (
                    <span className="tabular-nums">{p.stock_total} en stock</span>
                  )}
                </span>
                <span className="cat-ligne-prix">
                  {p.prix_min !== null ? (
                    <>
                      {p.prix_max !== null && p.prix_max > p.prix_min ? <span className="discret">dès </span> : null}
                      <Prix millimes={p.prix_min} />
                    </>
                  ) : <span className="discret">—</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="bo-pages" aria-label="Pages">
          {page > 1 ? <Link href={lien(filtre.cle, page - 1)} className="btn btn-second">Précédents</Link> : <span />}
          <span className="text-petit discret">Page {page} sur {pages}</span>
          {page < pages ? <Link href={lien(filtre.cle, page + 1)} className="btn btn-second">Suivants</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
