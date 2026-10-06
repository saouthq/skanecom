import type { Enregistrement, StatutDomaine } from "@/lib/courriels/domaines";

/* Les réglages d'envoi des e-mails, tels que la console les lit
   (public.console_courriels, public.console_courriels_boutique). */

export type CourrielsBoutique = {
  id: string; slug: string; nom: string; statut: string; demonstration: boolean;
  /** L'e-mail que la boutique a donné (Réglages → Mentions légales). */
  email_boutique: string | null;
  hote_principal: string | null;
  nom_expediteur: string | null;
  reponse_a: string | null;
  domaine: string | null;
  adresse_locale: string;
  fournisseur: string | null;
  ref_fournisseur: string | null;
  statut_domaine: StatutDomaine | null;
  enregistrements: Enregistrement[];
  ajoute_le: string | null;
  verifie_le: string | null;
  derniere_verif: string | null;
  domaine_actif: boolean;
  reponse_plateforme?: string | null;
};

export type DonneesCourriels = {
  reponse_plateforme: string | null;
  mois: { envoyes: number; refuses: number };
  dernier_refus: { le: string; raison: string | null; sujet: string | null } | null;
  dernier_envoi: string | null;
  boutiques: CourrielsBoutique[];
};

export const LIBELLES_STATUT_DOMAINE: Record<StatutDomaine, { libelle: string; classe: string }> = {
  en_attente: { libelle: "En attente des DNS", classe: "ui-etat ui-etat-point ui-etat-ambre" },
  verifie: { libelle: "Vérifié", classe: "ui-etat ui-etat-point ui-etat-vert" },
  echec: { libelle: "Refusé", classe: "ui-etat ui-etat-point ui-etat-rouge" },
};

/** Le domaine à proposer : celui de la vitrine, sans « www. » (ni un hôte local). */
export function domaineSuggere(hote: string | null): string {
  const h = (hote ?? "").toLowerCase().replace(/^www\./, "");
  return !h || h.endsWith(".localhost") || h.endsWith(".workers.dev") || !h.includes(".") ? "" : h;
}

/** L'adresse d'expédition, ou ce qui en tient lieu quand le secret n'en donne pas. */
export function adresseOuEtat(adresse: string | null, fournisseur: string): string {
  if (adresse) return adresse;
  return fournisseur === "relais" ? "le relais local" : fournisseur === "apercu" ? "aperçu : rien ne part" : "aucun fournisseur : rien ne part";
}

/** Ce que voit le client : de qui, où vont ses réponses. */
export function ceQuePart(b: CourrielsBoutique, adressePlateforme: string | null) {
  const depuisDomaine = b.domaine_actif && b.statut_domaine === "verifie" && Boolean(b.domaine);
  return {
    nom: b.nom_expediteur || b.nom,
    adresse: depuisDomaine ? `${b.adresse_locale}@${b.domaine}` : adressePlateforme,
    depuisDomaine,
    reponse: b.reponse_a,
  };
}

/** « il y a 3 min », « le 5 oct. à 14:02 » (heure de Tunis). */
export function quandLisible(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Tunis" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" })}`;
}
