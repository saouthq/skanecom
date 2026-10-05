import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { FormSaisie } from "@/components/console/FormSaisie";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_SAISIR, type Saisie } from "@/lib/gestion/saisie";

export const metadata: Metadata = { title: "Saisir une commande" };

/* ============================================================================
   SAISIR UNE COMMANDE — Commandes → « Saisir une commande » : la commande
   reçue par téléphone, WhatsApp, Instagram, Facebook, TikTok ou au magasin.
   Le client par son numéro (retrouvé s'il est connu), les articles cherchés
   dans le catalogue, la livraison ou le retrait ; le total suit en direct,
   calculé par la base comme à la vitrine. Propriétaire, administrateur,
   appels ; la base revérifie tout (…_saisie_commande.sql).
   ?tel= : depuis la fiche d'un client, son numéro déjà tapé.
   ========================================================================== */

export default async function NouvelleCommande({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; tel?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const commandes = `/gestion/${slug}`;
  if (!PEUT_SAISIR.includes(boutique.role)) redirect(commandes);

  const sb = await clientSession();
  const [{ data, error }, { data: gouvernorats }] = await Promise.all([
    sb.rpc("gestion_saisie", { p_boutique_id: boutique.boutique_id }),
    sb.from("gouvernorats").select("code, nom_fr").eq("actif", true).order("position"),
  ]);
  if (error) throw new Error(`Saisie illisible : ${error.message}`);
  const saisie = data as Saisie;

  return (
    <>
      <EnTetePage
        avant={<Link href={commandes}><Icone nom="retour" taille={14} /> Commandes</Link>}
        titre="Saisir une commande"
        description="Reçue par téléphone, sur WhatsApp, sur les réseaux ou au magasin : le prix de la vitrine, le stock réservé, puis la confirmation et la livraison comme les autres."
      />
      {messages.erreur ? <p className="message message-erreur sc-erreur" role="alert">{messages.erreur}</p> : null}
      {saisie.produits.length === 0 ? (
        <div className="vide bo-vide">
          <span className="vide-icone"><Icone nom="colis" taille={20} /></span>
          <strong>Rien à vendre pour le moment</strong>
          <p>Aucun produit n&apos;est en vente : publiez-en un au catalogue d&apos;abord.</p>
        </div>
      ) : (
        <FormSaisie
          base={`${commandes}/commandes/nouvelle`}
          saisie={saisie}
          gouvernorats={((gouvernorats ?? []) as { code: string; nom_fr: string }[]).map((g) => ({ code: g.code, nom: g.nom_fr }))}
          telephoneInitial={(messages.tel ?? "").replace(/[^\d+ ]/g, "").slice(0, 20)}
          cle={crypto.randomUUID()}
        />
      )}
    </>
  );
}
