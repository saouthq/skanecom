import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EditeurApparence } from "@/components/console/EditeurApparence";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { quand } from "@/lib/gestion/libelles";
import { cadreDeGestion, modelesDePages, pagesAutomatiques, PEUT_ECRIRE } from "@/lib/gestion/pages";
import type { ContenuPage, PageEditeur } from "@/components/console/PanneauPages";
import { DIRECTION } from "@/lib/gestion/tableau";
import type { AccueilGestion } from "@/lib/gestion/accueil";
import { contenuDe, reglagesLus } from "@/lib/apparence";
import "../../apparence.css";

export const metadata: Metadata = { title: "Éditeur de la vitrine" };

/* ============================================================================
   L'ÉDITEUR DE LA VITRINE — tout ce qui se voit sur la vitrine, réglé au même
   endroit en voyant la vraie vitrine changer à côté (ordinateur ou
   téléphone) : le style (structure, couleurs, polices, formes, rythme),
   l'accueil (ses sections, leurs textes et leurs photos), l'en-tête et le
   pied de page (l'annonce, les réseaux, le bouton WhatsApp, les horaires),
   les pages de la boutique (À propos, questions…). Chaque geste
   s'enregistre dans un brouillon que les visiteurs ne voient pas ;
   « Publier » met le tout en ligne. Propriétaire et administrateur règlent ;
   la direction regarde.
   ========================================================================== */

type ApparenceGestion = {
  theme: boolean;
  version: number | null;
  publie: Record<string, unknown> | null;
  reglages: Record<string, unknown> | null;
  pages: { id: string; slug: string; genre: "texte" | "questions"; titre_fr: string; corps_fr: string; publie: boolean; dans_pied: boolean; version: number; brouillon: ContenuPage | null }[];
  modifie_le: string | null;
  modifie_par: string | null;
  brouillon: { contenu: Record<string, unknown>; version: number; jeton: string; modifie_le: string; modifie_par: string | null } | null;
};

export default async function Apparence({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; panneau?: string; page?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) notFound();
  const sb = await clientSession();
  const [{ data, error }, accueil, cadre, hoteConsole, { data: piece }, { data: numero }] = await Promise.all([
    sb.rpc("gestion_apparence", { p_boutique_id: boutique.boutique_id }),
    // Ce que l'accueil peut montrer : les rayons, les pages, les avis, les marques.
    sb.rpc("gestion_accueil", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
    // Une fiche à regarder dans l'aperçu : la première pièce mise en avant.
    sb.from("produits").select("slug, nom_fr").eq("boutique_id", boutique.boutique_id).eq("publie", true)
      .order("mis_en_avant", { ascending: false }).order("position").limit(1).maybeSingle(),
    // Le numéro WhatsApp (écran Réglages) : sans lui, pas de bouton flottant.
    sb.from("reglages").select("valeur").eq("boutique_id", boutique.boutique_id).eq("cle", "contact.whatsapp").maybeSingle(),
  ]);
  if (error) throw new Error(`Apparence illisible : ${error.message}`);
  if (accueil.error) throw new Error(`Accueil illisible : ${accueil.error.message}`);
  const a = data as ApparenceGestion;
  const infos = accueil.data as AccueilGestion;
  const hote = cadre?.boutique.hote_principal ?? null;
  const ouverte = boutique.statut === "active";
  const message = q.ok ? { ok: true, texte: q.ok } : q.erreur ? { ok: false, texte: q.erreur } : null;
  const publie = contenuDe(a.publie ?? { sections: null });
  // Un brouillon d'avant l'accueil dans l'éditeur : l'accueil publié le complète.
  const brouillon = a.brouillon ? contenuDe(a.brouillon.contenu) : null;
  if (brouillon && brouillon.sections === undefined) brouillon.sections = publie.sections ?? null;
  const pages: PageEditeur[] = (a.pages ?? []).map((p) => ({
    id: p.id, slug: p.slug, version: p.version, brouillon: p.brouillon,
    en_ligne: { titre_fr: p.titre_fr, corps_fr: p.corps_fr, genre: p.genre, publie: p.publie, dans_pied: p.dans_pied },
  }));
  const panneaux = ["accueil", "cadre", "pages"] as const;
  const panneau = (panneaux as readonly string[]).includes(q.panneau ?? "") ? (q.panneau as (typeof panneaux)[number]) : "style";

  return (
    <EditeurApparence
      key={`${a.version ?? 0}-${a.brouillon?.version ?? 0}`}
      action={`/gestion/${slug}/apparence/action`}
      photoAction={`/gestion/${slug}/accueil/photo`}
      retour={`/gestion/${slug}`}
      vitrine={hote && ouverte ? adresseVitrine(hote, hoteConsole) : null}
      ecrit={PEUT_ECRIRE.includes(boutique.role) && a.theme}
      nom={boutique.nom}
      fiche={piece ? { chemin: `/produit/${piece.slug}`, nom: piece.nom_fr ?? "Une fiche produit" } : null}
      panneau={panneau}
      pages={pages}
      pageOuverte={q.page && (q.page === "nouvelle" || pages.some((p) => p.id === q.page)) ? q.page : null}
      modeles={cadre ? modelesDePages(cadre) : []}
      office={pagesAutomatiques(cadre, slug)}
      affichee={hote}
      infos={{ rayons: infos.rayons, pages: infos.pages, avis: infos.avis, marques: infos.marques, produits: infos.produits, catalogue: infos.catalogue ?? [] }}
      reglages={reglagesLus(a.reglages, true)}
      whatsapp={String((numero as { valeur?: unknown } | null)?.valeur ?? "").replace(/\D/g, "").length >= 8}
      version={a.version}
      publie={{ ...publie, sections: publie.sections ?? null }}
      brouillon={a.brouillon && brouillon ? {
        contenu: brouillon,
        version: a.brouillon.version,
        jeton: a.brouillon.jeton,
        auteur: a.brouillon.modifie_par,
        quand: quand(a.brouillon.modifie_le),
      } : null}
      message={message}
    />
  );
}
