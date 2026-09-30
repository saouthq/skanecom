import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { FormReception } from "@/components/console/FormReception";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_STOCKER } from "@/lib/gestion/catalogue";
import type { ProduitReception } from "@/lib/gestion/reception";

export const metadata: Metadata = { title: "Réception d'un arrivage" };

/* ============================================================================
   LA RÉCEPTION D'UN ARRIVAGE — Catalogue → Réception : le bon de livraison
   du fournisseur à la main, on tape la quantité reçue de chaque déclinaison,
   et tout passe au journal du stock en une fois. Propriétaire,
   administrateur, préparation ; la base revérifie (…_reception_arrivage.sql).
   ========================================================================== */

export default async function Reception({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ recues?: string; declinaisons?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const catalogue = `/gestion/${slug}/produits`;
  if (!PEUT_STOCKER.includes(boutique.role)) redirect(catalogue);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_reception_catalogue", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Catalogue illisible : ${error.message}`);
  const produits = data as ProduitReception[];
  const n = Number(messages.recues ?? 0);

  return (
    <>
      <EnTetePage
        avant={<Link href={catalogue}><Icone nom="retour" taille={14} /> Catalogue</Link>}
        titre="Réception d'un arrivage"
        description="Le bon de livraison à la main : la quantité reçue de chaque déclinaison. Tout passe au journal du stock en une fois, avec votre note."
      />
      <div className="pile">
        {n > 0 ? (
          <p className="message message-succes" role="status">
            Réception enregistrée : {n} pièce{n > 1 ? "s" : ""} sur {messages.declinaisons} déclinaison{Number(messages.declinaisons) > 1 ? "s" : ""}, au journal du stock.
          </p>
        ) : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {produits.length === 0 ? (
          <div className="vide bo-vide">
            <span className="vide-icone"><Icone nom="colis" taille={20} /></span>
            <strong>Rien à recevoir</strong>
            <p>Aucune déclinaison en vente pour le moment : créez d&apos;abord un produit.</p>
          </div>
        ) : (
          <FormReception action={`${catalogue}/reception/action`} produits={produits} />
        )}
      </div>
    </>
  );
}
