import { cadre as chargeCadre } from "@/lib/boutique";
import { hoteDe, resoudre } from "@/lib/annuaire";
import { courrielChangementEmail, courrielCode, courrielInvitation, courrielMotDePasse, marqueDeBoutique, MARQUE_PLATEFORME } from "./messages";
import type { Courriel, Marque } from "./modele";

/* ============================================================================
   DE L'ÉVÉNEMENT DE SUPABASE AUTH À L'E-MAIL — qui écrit (la boutique du lien
   de retour, sinon la plateforme), à qui, et quoi : le code, le lien.
   La vitrine demande le code avec son adresse pour lien de retour
   (Connexion.tsx) : l'e-mail part au nom de la boutique, à ses couleurs.
   ========================================================================== */

export type EvenementCourriel = {
  user: { email?: string; new_email?: string };
  email_data: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to?: string;
    site_url?: string;
    email_action_type?: string;
  };
};

export type Pret = { a: string; nom: string; courriel: Courriel; code: string | null };

async function qui(redirection: string | undefined): Promise<{ marque: Marque; boutique: boolean }> {
  if (redirection) {
    try {
      const url = new URL(redirection);
      const resolution = await resoudre(hoteDe(url.host));
      if (resolution.etat === "boutique") {
        const cadre = await chargeCadre(resolution.slug);
        return { marque: marqueDeBoutique(cadre, url.origin), boutique: true };
      }
    } catch {
      // adresse illisible ou boutique introuvable : la plateforme écrit
    }
  }
  return { marque: MARQUE_PLATEFORME, boutique: false };
}

/** Le lien d'accueil de la console : choisir son mot de passe (invitation ou oubli). */
function lienBienvenue(site: string, jeton: string, type: "invite" | "recovery", email: string): string {
  return `${site.replace(/\/+$/, "")}/bienvenue?${new URLSearchParams({ jeton, type, e: email })}`;
}

export async function composer(ev: EvenementCourriel): Promise<Pret | { erreur: string }> {
  const d = ev.email_data ?? {};
  const email = ev.user?.email ?? "";
  const type = d.email_action_type ?? "";
  const { marque, boutique } = await qui(d.redirect_to);
  const site = d.site_url ?? "";

  switch (type) {
    case "signup":
    case "magiclink":
    case "email":
    case "reauthentication": {
      if (!email || !d.token) return { erreur: "code ou adresse absents" };
      return { a: email, nom: marque.nom, courriel: courrielCode(marque, d.token, !boutique), code: d.token };
    }
    case "invite": {
      if (!email || !d.token_hash || !site) return { erreur: "invitation incomplète" };
      return { a: email, nom: marque.nom, courriel: courrielInvitation(marque, lienBienvenue(site, d.token_hash, "invite", email)), code: null };
    }
    case "recovery": {
      if (!email || !d.token_hash || !site) return { erreur: "lien de mot de passe incomplet" };
      return { a: email, nom: marque.nom, courriel: courrielMotDePasse(marque, lienBienvenue(site, d.token_hash, "recovery", email)), code: null };
    }
    case "email_change": {
      // La nouvelle adresse reçoit son code ; l'ancienne, si Supabase en envoie un aussi, le sien.
      const a = ev.user?.new_email || email;
      const code = ev.user?.new_email ? d.token_new || d.token : d.token;
      if (!a || !code) return { erreur: "changement d'adresse incomplet" };
      return { a, nom: marque.nom, courriel: courrielChangementEmail(marque, code, !boutique), code };
    }
    default:
      return { erreur: `type d'e-mail inconnu : ${type || "aucun"}` };
  }
}
