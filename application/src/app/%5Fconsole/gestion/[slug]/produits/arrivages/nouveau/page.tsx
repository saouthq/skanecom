import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { FormArrivage } from "@/components/console/FormArrivage";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_STOCKER } from "@/lib/gestion/catalogue";
import type { ProduitReception } from "@/lib/gestion/reception";

export const metadata: Metadata = { title: "Annoncer un arrivage" };

/* ============================================================================
   ANNONCER UN ARRIVAGE — son nom, sa date, la quantité attendue de chaque
   déclinaison (la liste de la réception). Propriétaire, administrateur,
   préparation ; la base revérifie (public.gestion_enregistrer_arrivage).
   ========================================================================== */

export default async function NouvelArrivage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const catalogue = `/gestion/${slug}/produits`;
  if (!PEUT_STOCKER.includes(boutique.role)) redirect(catalogue);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_reception_catalogue", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Catalogue illisible : ${error.message}`);
  const produits = data as ProduitReception[];
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());

  return (
    <>
      <EnTetePage
        avant={<Link href={`${catalogue}/arrivages`}><Icone nom="retour" taille={14} /> Arrivages</Link>}
        titre="Annoncer un arrivage"
        description="Ce que le conteneur apporte, déclinaison par déclinaison, et quand. Les pièces épuisées se précommandent dès l'annonce, si le réglage est allumé."
      />
      <div className="pile">
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {produits.length === 0 ? (
          <div className="vide bo-vide">
            <span className="vide-icone"><Icone nom="colis" taille={20} /></span>
            <strong>Rien à annoncer</strong>
            <p>Aucune déclinaison en vente pour le moment : créez d&apos;abord un produit.</p>
          </div>
        ) : (
          <FormArrivage action={`${catalogue}/arrivages/action`} produits={produits} aujourdhui={aujourdhui} suffixe="nouveau" />
        )}
      </div>
    </>
  );
}
