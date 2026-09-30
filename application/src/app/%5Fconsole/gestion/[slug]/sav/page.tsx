import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnTetePage, initiales, styleAvatar } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { age, lienAppel, telephoneLisible } from "@/lib/gestion/libelles";
import { ETAPES_SAV, LIBELLES_STATUT_SAV, libelleIssue, type StatutSav } from "@/lib/gestion/sav";

export const metadata: Metadata = { title: "Service après-vente" };

/* ============================================================================
   LE SERVICE APRÈS-VENTE — les demandes des clients (module « sav »), par
   étape : nouvelles (la plus ancienne d'abord : c'est elle qu'on rappelle),
   en cours, closes. Chacune dit l'article, le client, et s'il est encore
   sous la garantie annoncée par la boutique.
   ========================================================================== */

type Ligne = {
  numero: string;
  statut: StatutSav;
  issue: string | null;
  cree_le: string;
  cloturee_le: string | null;
  produit_nom: string;
  variante_libelle: string | null;
  numero_serie: string | null;
  description: string;
  commande: string;
  client_nom: string;
  client_telephone: string;
  sous_garantie: boolean | null;
};

type Liste = {
  total: number;
  compteurs: Record<"nouvelles" | "en_cours" | "closes", number>;
  demandes: Ligne[];
};

const PAR_PAGE = 50;

export default async function ServiceApresVente({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ etape?: string; page?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data: etat } = await sb.rpc("gestion_sav_etat", { p_boutique_id: boutique.boutique_id });
  const etape = ETAPES_SAV.find((e) => e.cle === recherche.etape) ?? ETAPES_SAV[0];
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);
  const { data, error } = await sb.rpc("gestion_liste_sav", {
    p_boutique_id: boutique.boutique_id, p_etape: etape.cle, p_limite: PAR_PAGE, p_decalage: (page - 1) * PAR_PAGE,
  });
  if (error) throw new Error(`Demandes illisibles : ${error.message}`);
  const liste = data as Liste;
  // Module coupé et aucune demande passée : rien à montrer ici.
  if (!(etat as { actif: boolean } | null)?.actif && liste.compteurs.nouvelles + liste.compteurs.en_cours + liste.compteurs.closes === 0) notFound();
  const maintenant = new Date();
  const pages = Math.max(1, Math.ceil(liste.total / PAR_PAGE));
  const lien = (e: string, p = 1) => `/gestion/${slug}/sav?etape=${e}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <EnTetePage
        titre="Service après-vente"
        description={etape.cle === "nouvelles"
          ? "Les demandes des clients, la plus ancienne en haut : rappelez, puis prenez-la en charge."
          : "Ce qu'un client a signalé sur un article de sa commande, et ce que la boutique en a fait."}
      />

      <nav className="onglets bo-etapes" aria-label="Étapes du service après-vente">
        {ETAPES_SAV.map((e) => (
          <Link key={e.cle} href={lien(e.cle)} aria-current={e.cle === etape.cle ? "page" : undefined}>
            {e.libelle}
            <span className="compte-onglet">{liste.compteurs[e.cle]}</span>
          </Link>
        ))}
      </nav>

      {liste.demandes.length === 0 ? (
        <div className="vide bo-vide">
          <span className="vide-icone"><Icone nom="outil" taille={20} /></span>
          <strong>Rien ici</strong>
          <p>{etape.vide}</p>
        </div>
      ) : (
        <ul className="bo-liste" role="list">
          {liste.demandes.map((d) => {
            const issue = libelleIssue(d.statut, d.issue);
            return (
              <li key={d.numero} className="bo-ligne sav-ligne" data-statut={d.statut}>
                <Link href={`/gestion/${slug}/sav/${d.numero}`} className="bo-ligne-lien">
                  <span className="bo-ligne-id">
                    <span className="bo-numero">{d.numero}</span>
                    <span className="bo-age" title={d.cree_le}><Icone nom="horloge" taille={13} /> {age(d.cree_le, maintenant)}</span>
                  </span>
                  <span className="bo-ligne-client">
                    <span className="avatar" style={styleAvatar(d.client_nom)} aria-hidden="true">{initiales(d.client_nom)}</span>
                    <span className="bo-ligne-client-texte">
                      <strong>{d.client_nom}</strong>
                      <span>{telephoneLisible(d.client_telephone)} · {d.commande}</span>
                    </span>
                  </span>
                  <span className="bo-ligne-articles sav-ligne-article">
                    <span className="sav-produit">{d.produit_nom}{d.variante_libelle ? <span> · {d.variante_libelle}</span> : null}</span>
                    <span className="sav-extrait">« {d.description}{d.description.length >= 140 ? "…" : ""} »</span>
                  </span>
                  <span className="bo-badges ui-etats">
                    {d.sous_garantie === true ? <span className="ui-etat ui-etat-vert"><Icone nom="bouclier" taille={12} /> Sous garantie</span> : null}
                    {d.sous_garantie === false ? <span className="ui-etat ui-etat-ambre">Hors garantie</span> : null}
                    {d.numero_serie ? <span className="ui-etat">N° {d.numero_serie}</span> : null}
                  </span>
                  <span className="bo-ligne-fin">
                    <span className={`bo-statut sav-statut-${d.statut}`}>{LIBELLES_STATUT_SAV[d.statut]}</span>
                    {issue ? <span className="text-petit discret">{issue}</span> : null}
                  </span>
                </Link>
                {d.statut === "nouvelle" ? (
                  <a className="bo-appel" href={lienAppel(d.client_telephone)} aria-label={`Appeler ${d.client_nom} au ${telephoneLisible(d.client_telephone)}`}>
                    <Icone nom="telephone" taille={18} />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="bo-pages" aria-label="Pages">
          {page > 1 ? <Link href={lien(etape.cle, page - 1)} className="btn btn-second">Précédentes</Link> : <span />}
          <span className="text-petit discret">Page {page} sur {pages}</span>
          {page < pages ? <Link href={lien(etape.cle, page + 1)} className="btn btn-second">Suivantes</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
