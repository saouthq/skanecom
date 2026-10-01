import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { EditeurApparence } from "@/components/console/EditeurApparence";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { quand } from "@/lib/gestion/libelles";
import { cadreDeGestion, PEUT_ECRIRE } from "@/lib/gestion/pages";
import { DIRECTION } from "@/lib/gestion/tableau";
import { contenuDe } from "@/lib/apparence";
import "../../apparence.css";

export const metadata: Metadata = { title: "Apparence" };

/* ============================================================================
   L'APPARENCE DE LA VITRINE — la structure, les couleurs, les polices, les
   formes et le rythme, réglés en voyant la vraie vitrine changer à côté
   (ordinateur ou téléphone). Chaque geste s'enregistre dans un brouillon que
   les visiteurs ne voient pas ; « Publier » le met en ligne. Propriétaire et
   administrateur règlent ; la direction regarde.
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
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  if (!DIRECTION.includes(boutique.role)) notFound();
  const sb = await clientSession();
  const [{ data, error }, cadre, hoteConsole, { data: piece }] = await Promise.all([
    sb.rpc("gestion_apparence", { p_boutique_id: boutique.boutique_id }),
    cadreDeGestion(sb, boutique.boutique_id),
    headers().then((h) => h.get("host")),
    // Une fiche à regarder dans l'aperçu : la première pièce mise en avant.
    sb.from("produits").select("slug, nom_fr").eq("boutique_id", boutique.boutique_id).eq("publie", true)
      .order("mis_en_avant", { ascending: false }).order("position").limit(1).maybeSingle(),
  ]);
  if (error) throw new Error(`Apparence illisible : ${error.message}`);
  const a = data as ApparenceGestion;
  const hote = cadre?.boutique.hote_principal ?? null;
  const ouverte = boutique.statut === "active";
  const message = q.ok ? { ok: true, texte: q.ok } : q.erreur ? { ok: false, texte: q.erreur } : null;

  return (
    <EditeurApparence
      key={`${a.version ?? 0}-${a.brouillon?.version ?? 0}`}
      action={`/gestion/${slug}/apparence/action`}
      retour={`/gestion/${slug}`}
      vitrine={hote && ouverte ? adresseVitrine(hote, hoteConsole) : null}
      ecrit={PEUT_ECRIRE.includes(boutique.role) && a.theme}
      nom={boutique.nom}
      fiche={piece ? { chemin: `/produit/${piece.slug}`, nom: piece.nom_fr ?? "Une fiche produit" } : null}
      version={a.version}
      publie={contenuDe(a.publie)}
      brouillon={a.brouillon ? {
        contenu: contenuDe(a.brouillon.contenu),
        version: a.brouillon.version,
        jeton: a.brouillon.jeton,
        auteur: a.brouillon.modifie_par,
        quand: quand(a.brouillon.modifie_le),
      } : null}
      message={message}
    />
  );
}
