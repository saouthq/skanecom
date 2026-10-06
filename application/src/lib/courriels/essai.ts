import { cadre as chargeCadre } from "@/lib/boutique";
import { courrielCode, courrielInvitation, marqueDeBoutique, MARQUE_PLATEFORME } from "./messages";
import { courrielCommande, type CourrielDu } from "./commandes";
import type { Courriel } from "./modele";

/* L'e-mail d'essai que la console envoie (page E-mails → Envoi, et l'onglet
   E-mails d'une boutique) : un vrai modèle, aux couleurs de la boutique, le
   sujet précédé de « [Essai] », un code et une commande d'exemple. */

export const MODELES_ESSAI = [
  { cle: "code", libelle: "Code de connexion", boutique: true },
  { cle: "commande", libelle: "Commande reçue", boutique: true },
  { cle: "invitation", libelle: "Invitation de l'équipe (au nom de SkanEcom)", boutique: false },
] as const;
export type ModeleEssai = (typeof MODELES_ESSAI)[number]["cle"];

const CONSOLE = "https://app.skanecom.tn";

/** Une commande d'exemple, pour les aperçus et l'essai. */
export function commandeExemple(b: { slug: string; nom: string }, evenement: CourrielDu["evenement"]): CourrielDu {
  return {
    id: 0, evenement, a: [],
    boutique: { id: "", slug: b.slug, nom: b.nom },
    commande: {
      numero: "CMD-2026-00042", statut: evenement, origine: "vitrine", mode_paiement: "cod", mode_livraison: "domicile",
      contact_nom: "Amel B.", contact_telephone: "+21620123456",
      livraison: { ligne1: "12 rue de Marseille", ligne2: null, ville: "Tunis", gouvernorat: "Tunis", code_postal: "1000" },
      sous_total_millimes: 267000, frais_livraison_millimes: 7000, remise_millimes: 0, total_millimes: 274000,
      code_promo: null, transporteur: "Aramex", numero_suivi: "AR-58201", motif_annulation: null, cree_le: new Date().toISOString(),
    },
    lignes: [
      { nom: "Un article du catalogue", detail: "Noir", quantite: 2, total_millimes: 178000, lot: null, precommande: false },
      { nom: "Un autre article", detail: null, quantite: 1, total_millimes: 89000, lot: null, precommande: false },
    ],
  };
}

/** Rédige l'essai : au nom de la boutique (son slug), ou de SkanEcom. */
export async function courrielDEssai(modele: ModeleEssai, boutique: { slug: string; nom: string; hote: string | null } | null):
  Promise<{ nom: string; courriel: Courriel; auNomDeLaBoutique: boolean }> {
  const auNomDeLaBoutique = Boolean(boutique) && modele !== "invitation";
  let courriel: Courriel;
  if (!auNomDeLaBoutique || !boutique) {
    courriel = courrielInvitation(MARQUE_PLATEFORME, `${CONSOLE}/bienvenue?jeton=essai&type=invite`);
  } else {
    const marque = marqueDeBoutique(await chargeCadre(boutique.slug), boutique.hote ? `https://${boutique.hote}` : null);
    courriel = modele === "commande"
      ? courrielCommande(marque, commandeExemple(boutique, "recue"), { site: marque.site, console: CONSOLE })
      : courrielCode(marque, "482913");
  }
  return {
    nom: auNomDeLaBoutique && boutique ? boutique.nom : MARQUE_PLATEFORME.nom,
    courriel: { ...courriel, sujet: `[Essai] ${courriel.sujet}` },
    auNomDeLaBoutique,
  };
}
