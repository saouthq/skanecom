import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { FormArrivage } from "@/components/console/FormArrivage";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_STOCKER } from "@/lib/gestion/catalogue";
import type { EcranArrivages } from "@/lib/gestion/arrivages";
import type { ProduitReception } from "@/lib/gestion/reception";

export const metadata: Metadata = { title: "Changer un arrivage" };

/* ============================================================================
   CHANGER UN ARRIVAGE ATTENDU — sa date qui glisse, une quantité revue par
   le fournisseur. Ce qui est déjà précommandé reste précommandé : si
   l'arrivage en apporte moins, la vitrine n'en propose plus, les commandes
   attendent le stock suivant.
   ========================================================================== */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function ChangerArrivage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const [{ slug, id }, messages] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { boutique } = await exigeMembre(slug);
  const catalogue = `/gestion/${slug}/produits`;
  if (!PEUT_STOCKER.includes(boutique.role)) redirect(catalogue);
  const sb = await clientSession();
  const [ecran, cat] = await Promise.all([
    sb.rpc("gestion_arrivages", { p_boutique_id: boutique.boutique_id }),
    sb.rpc("gestion_reception_catalogue", { p_boutique_id: boutique.boutique_id }),
  ]);
  if (ecran.error) throw new Error(`Arrivages illisibles : ${ecran.error.message}`);
  if (cat.error) throw new Error(`Catalogue illisible : ${cat.error.message}`);
  const arrivage = (ecran.data as EcranArrivages).arrivages.find((a) => a.id === id);
  if (!arrivage) notFound();
  if (arrivage.statut !== "attendu") redirect(`${catalogue}/arrivages#arrivage-${id}`);
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());

  return (
    <>
      <EnTetePage
        avant={<Link href={`${catalogue}/arrivages`}><Icone nom="retour" taille={14} /> Arrivages</Link>}
        titre={`Changer « ${arrivage.nom} »`}
        description="Ce qui est déjà précommandé reste précommandé. Si l'arrivage en apporte moins, la vitrine n'en propose plus, et les commandes attendent le stock suivant."
      />
      <div className="pile">
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        <FormArrivage action={`${catalogue}/arrivages/action`} produits={cat.data as ProduitReception[]} arrivage={arrivage}
          aujourdhui={aujourdhui} suffixe={arrivage.id} />
      </div>
    </>
  );
}
