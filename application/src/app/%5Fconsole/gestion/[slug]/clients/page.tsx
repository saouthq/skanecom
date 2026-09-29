import type { Metadata } from "next";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { EnTetePage, initiales } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand, telephoneLisible } from "@/lib/gestion/libelles";
import { FILTRES_CLIENTS, pastilleConfiance, type ListeClients } from "@/lib/gestion/clients";

export const metadata: Metadata = { title: "Clients" };

const PAR_PAGE = 50;

/* ============================================================================
   LES CLIENTS — ceux qui ont commandé (avec ou sans compte), les plus
   récents d'abord. Les filtres disent qui soigner (fidèles) et de qui se
   méfier (refus, surveillés, bloqués). Recherche par nom, numéro ou adresse
   électronique.
   ========================================================================== */
export default async function Clients({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filtre?: string; q?: string; page?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const filtre = FILTRES_CLIENTS.find((f) => f.cle === recherche.filtre) ?? FILTRES_CLIENTS[0];
  const q = (recherche.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_liste_clients", {
    p_boutique_id: boutique.boutique_id,
    p_filtre: filtre.cle,
    p_recherche: q || null,
    p_limite: PAR_PAGE,
    p_decalage: (page - 1) * PAR_PAGE,
  });
  if (error) throw new Error(`Clients illisibles : ${error.message}`);
  const liste = data as ListeClients;
  const pages = Math.max(1, Math.ceil(liste.total / PAR_PAGE));
  const base = `/gestion/${slug}/clients`;
  const lien = (f: string, p = 1) => `${base}?filtre=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        titre="Clients"
        description={`${liste.compteurs.tous} client${liste.compteurs.tous > 1 ? "s" : ""}, dont ${liste.compteurs.fideles} fidèle${liste.compteurs.fideles > 1 ? "s" : ""} (livrés au moins deux fois).`}
        actions={
          <form role="search" method="get" action={base} className="bo-recherche">
            <input type="hidden" name="filtre" value={filtre.cle} />
            <label htmlFor="q" className="sr-only">Chercher un client</label>
            <span className="bo-recherche-champ">
              <Icone nom="recherche" />
              <input id="q" name="q" type="search" className="entree" defaultValue={q} placeholder="Nom, numéro ou e-mail" autoComplete="off" />
            </span>
            <button type="submit" className="btn btn-second">Chercher</button>
          </form>
        }
      />

      <nav className="onglets" aria-label="Filtres des clients">
        {FILTRES_CLIENTS.map((f) => (
          <Link key={f.cle} href={lien(f.cle)} aria-current={f.cle === filtre.cle ? "page" : undefined}>
            {f.libelle}
            <span className={`compte-onglet${(f.cle === "bloques" || f.cle === "surveilles") && liste.compteurs[f.cle] > 0 ? " compte-alerte" : ""}`}>
              {liste.compteurs[f.cle]}
            </span>
          </Link>
        ))}
      </nav>

      {q ? (
        <p className="bo-resultat" role="status">
          {liste.total} client{liste.total > 1 ? "s" : ""} pour « {q} »
          <Link href={lien(filtre.cle).replace(/&q=[^&]*/, "")} className="btn btn-fantome btn-petit"><Icone nom="croix" taille={14} /> Effacer</Link>
        </p>
      ) : null}

      {liste.clients.length === 0 ? (
        <div className="vide cat-vide">
          <span className="vide-icone"><Icone nom={q ? "recherche" : "personne"} taille={20} /></span>
          <strong>{q ? "Aucun résultat" : "Personne ici"}</strong>
          <p>{q ? `Aucun client ne correspond à « ${q} ».` : filtre.vide}</p>
        </div>
      ) : (
        <ul className="cat-liste cl-liste" role="list">
          {liste.clients.map((c) => {
            const confiance = pastilleConfiance(c.niveau_risque);
            return (
              <li key={c.id} className="cat-ligne">
                <Link href={`${base}/${c.id}`} className="cat-ligne-lien cl-ligne-lien">
                  <span className="initiale cl-initiale" aria-hidden="true">{initiales(c.nom ?? "?")}</span>
                  <span className="cat-ligne-nom">
                    <strong>{c.nom ?? "Sans nom"}</strong>
                    <span className="tabular-nums">{telephoneLisible(c.telephone)}</span>
                  </span>
                  <span className="cl-ligne-etat">
                    {confiance ? <span className={confiance.classe}>{confiance.texte}</span> : null}
                    {c.nb_refus > 0 ? <span className="ui-etat ui-etat-rouge">{c.nb_refus} refus</span> : null}
                    {!confiance && c.nb_refus === 0 ? (
                      c.compte ? <span className="ui-etat">Compte</span> : <span className="ui-etat">Invité</span>
                    ) : null}
                  </span>
                  <span className="cl-ligne-cmd">
                    {c.nb_commandes} commande{c.nb_commandes > 1 ? "s" : ""}
                    {c.livrees ? <span className="discret"> · {c.livrees} livrée{c.livrees > 1 ? "s" : ""}</span> : null}
                  </span>
                  <span className="cl-ligne-date">{c.derniere_commande ? quand(c.derniere_commande, maintenant) : "—"}</span>
                  <span className="cat-ligne-prix">{c.encaisse > 0 ? <Prix millimes={c.encaisse} /> : <span className="discret">—</span>}</span>
                </Link>
              </li>
            );
          })}
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
