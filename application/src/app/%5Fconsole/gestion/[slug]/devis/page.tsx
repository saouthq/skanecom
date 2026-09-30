import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand, telephoneLisible } from "@/lib/gestion/libelles";
import { CLASSES_STATUT_DEVIS, FILTRES_DEVIS, LIBELLES_STATUT_DEVIS, type ListeDevis } from "@/lib/gestion/devis";

export const metadata: Metadata = { title: "Devis" };

/* ============================================================================
   LES DEVIS (module devis) — les demandes arrivées du panier de la boutique
   en ligne, la plus ancienne d'abord : qui, combien d'articles et de pièces,
   ce que ça vaut au catalogue. Puis les devis envoyés (en attente du
   client), acceptés (devenus commandes), et ceux refusés, annulés, expirés.
   ========================================================================== */
export default async function Devis({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filtre?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const filtre = FILTRES_DEVIS.find((f) => f.cle === recherche.filtre) ?? FILTRES_DEVIS[0];
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_liste_devis", { p_boutique_id: boutique.boutique_id, p_filtre: filtre.cle });
  if (error) throw new Error(`Devis illisibles : ${error.message}`);
  const liste = data as ListeDevis;
  const total = Object.values(liste.compteurs).reduce((a, b) => a + b, 0);
  if (!liste.actif && total === 0) notFound();
  const base = `/gestion/${slug}/devis`;
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        titre="Devis"
        description={
          liste.actif
            ? "Les listes de chantier : chiffrez chaque ligne, envoyez, le client accepte depuis son compte et la commande naît à vos prix."
            : "Le module est coupé : plus de nouvelle demande. Les devis restent ici, tels quels."
        }
      />

      <nav className="onglets" aria-label="Filtres des devis">
        {FILTRES_DEVIS.map((f) => (
          <Link key={f.cle} href={`${base}?filtre=${f.cle}`} aria-current={f.cle === filtre.cle ? "page" : undefined}>
            {f.libelle}
            <span className={`compte-onglet${f.cle === "a_chiffrer" && liste.compteurs.a_chiffrer > 0 ? " compte-alerte" : ""}`}>
              {liste.compteurs[f.cle]}
            </span>
          </Link>
        ))}
      </nav>

      {liste.devis.length === 0 ? (
        <div className="vide cat-vide">
          <span className="vide-icone"><Icone nom="fichier" taille={20} /></span>
          <strong>Rien ici</strong>
          <p>{filtre.vide}</p>
        </div>
      ) : (
        <ul className="cat-liste dv-liste" role="list">
          {liste.devis.map((d) => (
            <li key={d.numero} className="cat-ligne">
              <Link href={`${base}/${d.numero}`} className="cat-ligne-lien dv-ligne-lien">
                <span className="initiale cl-initiale" style={styleAvatar(d.client.nom ?? d.client.telephone)} aria-hidden="true">
                  {initiales(d.client.nom ?? "Client")}
                </span>
                <span className="cat-ligne-nom">
                  <strong>{d.numero} · {d.client.nom ?? telephoneLisible(d.client.telephone)}</strong>
                  <span className="dv-ligne-detail">
                    {d.articles} article{d.articles > 1 ? "s" : ""} · {d.pieces} pièce{d.pieces > 1 ? "s" : ""}
                    {d.message ? <span className="discret"> · « {d.message.length > 70 ? `${d.message.slice(0, 70)}…` : d.message} »</span> : null}
                  </span>
                </span>
                <span className="dv-ligne-etat">
                  <span className={CLASSES_STATUT_DEVIS[d.statut]}>{LIBELLES_STATUT_DEVIS[d.statut]}</span>
                  {d.commande ? <span className="ui-etat">{d.commande}</span> : null}
                </span>
                <span className="dv-ligne-date">
                  {d.statut === "demande" ? quand(d.cree_le, maintenant) : quand(d.clos_le ?? d.envoye_le ?? d.cree_le, maintenant)}
                </span>
                <span className="cat-ligne-prix">
                  {d.total_millimes !== null && d.statut !== "demande" ? <Prix millimes={d.total_millimes} /> : (
                    <span className="discret"><Prix millimes={d.catalogue_millimes} /> au catalogue</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
