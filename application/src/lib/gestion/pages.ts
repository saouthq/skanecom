import type { SupabaseClient } from "@supabase/supabase-js";
import { formatePrix } from "@/lib/prix";
import { identiteLegale } from "@/lib/legal";
import { texte } from "@/lib/theme";
import { t } from "@/lib/i18n";
import { cadreDe, type Cadre, type CadreBrut } from "@/lib/boutique";
import { aUnContact, contactDe } from "@/lib/contact";
import type { Role } from "@/lib/console/session";

export { slugDe } from "@/lib/pages-forme";

/* ============================================================================
   LES PAGES DE LA BOUTIQUE AU BACKOFFICE — ce que la base rend
   (public.gestion_pages, migration 43), qui écrit, et les modèles proposés
   à une boutique qui n'en a pas encore : leur texte est composé de SES
   réglages (paiement, délais, retrait, rétractation), jamais inventé — elle
   n'a plus qu'à relire, ajuster et publier.
   ========================================================================== */

export type PageGestion = {
  id: string;
  slug: string;
  genre: "texte" | "questions";
  titre_fr: string;
  corps_fr: string;
  publie: boolean;
  dans_pied: boolean;
  position: number;
  version: number;
  modifiee_le: string;
  modifiee_par: string | null;
};

export const PEUT_ECRIRE: Role[] = ["proprietaire", "admin"];

/** Le cadre de la boutique pour son équipe, qu'elle soit ouverte ou encore en
 *  préparation (public.gestion_cadre) : les modèles s'en composent. */
export async function cadreDeGestion(sb: SupabaseClient, boutiqueId: string): Promise<Cadre | null> {
  const { data, error } = await sb.rpc("gestion_cadre", { p_boutique_id: boutiqueId });
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  return data ? cadreDe(data as CadreBrut) : null;
}

export type Modele = { cle: string; slug: string; genre: PageGestion["genre"]; titre: string; resume: string; corps: string };

export function modelesDePages(cadre: Cadre): Modele[] {
  const { livraison } = cadre;
  const id = identiteLegale(cadre);
  const retour = texte(cadre.theme.textes, "politique_retour");
  const resume = texte(cadre.theme.textes, "resume");
  const seuil = cadre.seuilGratuiteMillimes ? t.annonce.livraisonOfferte(formatePrix(cadre.seuilGratuiteMillimes)) : null;
  const retractation = `Vous pouvez vous rétracter dans les ${id.retractationJours} jours ouvrables qui suivent la réception (loi n° 2000-83), article non utilisé, dans son emballage ; les frais de retour sont ${id.retourOffert ? "offerts par la boutique" : "à votre charge"}.`;

  const questions = [
    livraison.cod ? `### Comment payer ?\n${t.produit.payezALaLivraisonTexte}` : null,
    livraison.delai ? `### Quels sont les délais de livraison ?\n${livraison.delai}, partout en Tunisie.${livraison.frais ? ` ${livraison.frais}` : ""}${seuil ? ` ${seuil}.` : ""}` : null,
    livraison.cod && livraison.rappel ? `### Vous m'appelez avant d'expédier ?\n${t.produit.confirmationTelephoniqueTexte}` : null,
    `### Puis-je refuser le colis ?\n${t.produit.refusPossibleTexte}`,
    cadre.retrait ? `### Puis-je retirer ma commande au magasin ?\nOui, gratuitement, au magasin de ${cadre.retrait.ville} (${cadre.retrait.adresse}) : ${t.commande.pretSous(cadre.retrait.delai_heures)}.${cadre.retrait.horaires ? ` Horaires : ${cadre.retrait.horaires}.` : ""}` : null,
    `### Comment suivre ma commande ?\nAvec son numéro et votre téléphone, sur la page [Suivre ma commande](/suivi) — sans compte.`,
    `### Puis-je retourner un article ?\n${[retour, retractation].filter(Boolean).join(" ")}`,
    cadre.sav?.garantieMois ? `### Mes articles sont-ils garantis ?\n${t.annonce.garantie(cadre.sav.garantieMois)}. Un souci ? Signalez-le depuis « Mes commandes » : la boutique vous rappelle. Le détail : [Garantie et SAV](/garantie-et-sav).` : null,
  ].filter(Boolean).join("\n\n");

  const livraisonEtRetours = [
    "## Livraison",
    [livraison.delai ? `${livraison.delai}, partout en Tunisie.` : "Partout en Tunisie.", livraison.frais, seuil ? `${seuil}.` : null].filter(Boolean).join(" "),
    livraison.cod && livraison.rappel ? t.produit.confirmationTelephoniqueTexte : null,
    cadre.retrait ? `## Retrait en magasin\nGratuit, au magasin de ${cadre.retrait.ville} (${cadre.retrait.adresse}) : ${t.commande.pretSous(cadre.retrait.delai_heures)}.` : null,
    livraison.cod ? `## Paiement\n${t.produit.payezALaLivraisonTexte}` : null,
    `## Refus à la livraison\n${t.produit.refusPossibleTexte}`,
    `## Retours\n${[retour, retractation].filter(Boolean).join(" ")}`,
    "Le détail : les [conditions de vente](/conditions-de-vente).",
  ].filter(Boolean).join("\n\n");

  const aPropos = [
    resume || `Présentez ${cadre.boutique.nom} en deux phrases : ce que vous vendez, et pourquoi on peut vous faire confiance.`,
    "## Notre histoire",
    "Racontez ici comment tout a commencé, et ce qui vous distingue. Des faits, des noms, des lieux : c'est ce qui rassure.",
    "## Nos engagements",
    [
      livraison.cod ? `- ${t.pied.paiementLivraison}, partout en Tunisie` : null,
      livraison.delai ? `- ${livraison.delai}` : null,
      `- ${t.produit.refusPossible}`,
      cadre.sav?.garantieMois ? `- ${t.annonce.garantie(cadre.sav.garantieMois)}` : null,
    ].filter(Boolean).join("\n"),
  ].join("\n\n");

  return [
    { cle: "questions", slug: "questions-frequentes", genre: "questions", titre: "Questions fréquentes", resume: "Paiement, délais, refus, suivi, retours : les réponses, composées de vos réglages.", corps: questions },
    { cle: "livraison", slug: "livraison-et-retours", genre: "texte", titre: "Livraison et retours", resume: "Vos délais, vos frais, le paiement et la rétractation, en clair.", corps: livraisonEtRetours },
    { cle: "a-propos", slug: "a-propos", genre: "texte", titre: "À propos", resume: "Qui vous êtes : un canevas à compléter de votre histoire.", corps: aPropos },
  ];
}

/** Les pages que la boutique a d'office, composées de ses réglages : on ne
 *  les écrit pas, on règle ce qui les nourrit. */
export type PageAutomatique = { titre: string; chemin: string; source: string; reglages: string | null };

export function pagesAutomatiques(cadre: Cadre | null, slug: string): PageAutomatique[] {
  const reglages = (ancre: string) => `/gestion/${slug}/reglages#t-${ancre}`;
  return [
    { titre: "Conditions de vente", chemin: "/conditions-de-vente", source: "Livraison, paiement, refus, retours et identité légale : tirées de vos réglages.", reglages: reglages("legal") },
    { titre: "Mentions légales", chemin: "/mentions-legales", source: "Raison sociale, matricule fiscal, adresse, contact.", reglages: reglages("legal") },
    { titre: "Confidentialité", chemin: "/confidentialite", source: "Les données gardées, pourquoi et combien de temps ; les droits du client.", reglages: reglages("legal") },
    ...(cadre?.sav ? [{ titre: "Garantie et SAV", chemin: "/garantie-et-sav", source: "La garantie annoncée et la marche à suivre pour un souci.", reglages: reglages("sav") }] : []),
    ...(!cadre || aUnContact(contactDe(cadre)) ? [{ titre: "Contact", chemin: "/contact", source: "Téléphone, WhatsApp, e-mail, magasin, horaires et réseaux.", reglages: reglages("vitrine") }] : []),
    { titre: "Suivre ma commande", chemin: "/suivi", source: "Le numéro de la commande et le téléphone suffisent : sans compte.", reglages: null },
  ];
}

/** Le message à l'équipe pour un refus de la base. */
export function messagePage(indice: string | undefined, message: string): string {
  switch (indice) {
    case "role":
      return "Seuls le propriétaire et l'administrateur écrivent les pages.";
    case "version":
      return "Cette page a été modifiée entre-temps par quelqu'un d'autre : rechargez-la (copiez d'abord votre texte, pour ne pas le perdre).";
    case "ordre":
      return "La liste des pages a changé entre-temps : la voici à jour, recommencez.";
    default:
      return message;
  }
}
