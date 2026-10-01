import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EditeurApparence } from "@/components/console/EditeurApparence";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { quand } from "@/lib/gestion/libelles";
import { cadreDeGestion, PEUT_ECRIRE } from "@/lib/gestion/pages";
import { DIRECTION } from "@/lib/gestion/tableau";
import type { AccueilGestion } from "@/lib/gestion/accueil";
import { contenuDe } from "@/lib/apparence";
import "../../apparence.css";

export const metadata: Metadata = { title: "Éditeur de la vitrine" };

/* ============================================================================
   L'ÉDITEUR DE LA VITRINE — tout ce qui se voit sur la vitrine, réglé au même
   endroit en voyant la vraie vitrine changer à côté (ordinateur ou
   téléphone) : le style (structure, couleurs, polices, formes, rythme) et
   l'accueil (ses sections, leurs textes et leurs photos). Chaque geste
   s'enregistre dans un brouillon que les visiteurs ne voient pas ;
   « Publier » met le tout en ligne. Propriétaire et administrateur règlent ;
   la direction regarde.
   ========================================================================== */

type ApparenceGestion = {
  theme: boolean;
  version: number | null;
  publie: Record<string, unknown> | null;
  modifie_le: string | null;
  modifie_par: string | null;
  brouillon: { contenu: Record<string, unknown>; version: number; jeton: string; modifie_le: string; modifie_par: string | null } | null;
};

export default async function Apparence({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; panneau?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) notFound();
  const sb = await clientSession();
  const [{ data, error }, accueil, cadre, hoteConsole, { data: piece }] = await Promise.all([
    sb.rpc("gestion_apparence", { p_boutique_id: boutique.boutique_id }),
    // Ce que l'accueil peut montrer : les rayons, les pages, les avis, les marques.
    sb.rpc("gestion_accueil", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
    // Une fiche à regarder dans l'aperçu : la première pièce mise en avant.
    sb.from("produits").select("slug, nom_fr").eq("boutique_id", boutique.boutique_id).eq("publie", true)
      .order("mis_en_avant", { ascending: false }).order("position").limit(1).maybeSingle(),
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
      panneau={q.panneau === "accueil" ? "accueil" : "style"}
      infos={{ rayons: infos.rayons, pages: infos.pages, avis: infos.avis, marques: infos.marques, produits: infos.produits }}
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
