import { lireEnvoi } from "@/lib/courriels/envoi";
import { chiffrementPret } from "@/lib/gestion/chiffre";
import { modeFichiers } from "@/lib/gestion/fichiers";
import { adresseSkanFact, configSkanFact, secretPartenaire } from "./skanfact";

/* ============================================================================
   L'ÉTAT TECHNIQUE DE LA PLATEFORME (migration …_console_etat_technique) —
   ce que la base sait (files, envois, domaines), et ce que seul le serveur
   sait : quels secrets sont posés. Jamais leur valeur : « posé » ou
   « manque », le fournisseur d'e-mails, l'hôte de SkanFact.
   ========================================================================== */

export type DonneesEtat = {
  le: string;
  base: { taille: number; version: string; migration: string | null; connexions: number; connexions_max: number };
  envois: {
    partis: number; refuses: number; dernier_parti: string | null;
    dernier_refus: { le: string; sujet: string | null; fournisseur: string; raison: string | null } | null;
  };
  courriels_commandes: { a_envoyer: number; en_retard: number; refuses: number; sans_adresse: number; plus_ancien: string | null; derniere_erreur: string | null };
  skanfact: {
    connectees: number; coupees: number; a_envoyer: number; en_retard: number; refuses: number; plus_ancien: string | null;
    coupures: number; coupures_en_retard: number; boutiques_refus: { slug: string; nom: string; n: number }[];
  };
  domaines: DomaineEtat[];
};

export type DomaineEtat = {
  hote: string; type: string; principal: boolean; statut: "en_attente" | "actif" | "erreur";
  verifie_le: string | null; erreur: string | null;
  boutique: { slug: string; nom: string; statut: string; demonstration: boolean };
};

export type Configuration = {
  courriels: { fournisseur: string; expediteur: string | null; crochet: boolean };
  skanfact: { hote: string | null; lecture: boolean; partenaire: boolean; chiffre: boolean; avis: boolean };
  fichiers: { mode: "local" | "r2" | "manque"; public: string | null };
};

/** Ce que le serveur sait de sa configuration : posé ou non, jamais la valeur d'un secret. */
export async function configuration(): Promise<Configuration> {
  const { fournisseur, expediteur } = lireEnvoi(process.env.COURRIELS_ENVOI ?? "");
  const sf = adresseSkanFact();
  let publicFichiers: string | null = null;
  try {
    publicFichiers = process.env.NEXT_PUBLIC_FICHIERS_URL ? new URL(process.env.NEXT_PUBLIC_FICHIERS_URL).host : null;
  } catch { /* une adresse illisible : « — » */ }
  return {
    courriels: {
      fournisseur: fournisseur || "aucun",
      // L'adresse d'expédition se lit dans chaque e-mail : elle n'est pas secrète.
      expediteur: (fournisseur === "resend" || fournisseur === "brevo") && expediteur ? expediteur : null,
      crochet: Boolean((process.env.COURRIELS_CROCHET_SECRET ?? "").trim()),
    },
    skanfact: {
      hote: sf ? new URL(sf).host : null,
      lecture: configSkanFact() !== null,
      partenaire: secretPartenaire() !== null,
      chiffre: await chiffrementPret(),
      avis: Boolean((process.env.SKANFACT_AVIS_SECRET ?? "").trim()),
    },
    fichiers: { mode: await modeFichiers(), public: publicFichiers },
  };
}

/** Ce que rend un appel, et le temps qu'il a pris (en ms). */
export async function chronometre<T>(f: () => PromiseLike<T>): Promise<[T, number]> {
  const debut = Date.now();
  const r = await f();
  return [r, Date.now() - debut];
}

export const hoteLocal = (h: string) => h === "localhost" || h.endsWith(".localhost");

/** La phrase d'une requête qui n'aboutit pas, lisible par l'équipe. */
export function phraseErreur(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "Pas de réponse en 8 secondes";
  const code = err?.cause?.code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Nom de domaine introuvable (DNS)";
  if (code === "CERT_HAS_EXPIRED") return "Certificat expiré";
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return "Certificat d'un autre domaine";
  if (code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "Certificat non reconnu";
  if (code === "ECONNREFUSED") return "Connexion refusée";
  const brut = err?.cause?.message || err?.message || String(e);
  // Le Worker ne dit pas pourquoi (« internal error; reference = … ») : le nom ne répond pas, ou le serveur.
  if (/internal error|network connection lost|dns/i.test(brut)) return "Injoignable : le nom ne répond pas (DNS) ou le serveur est éteint";
  if (/certificate|tls|ssl/i.test(brut)) return "Certificat refusé";
  return brut.slice(0, 200);
}

/** Le certificat d'un domaine, vérifié pour de vrai : une requête HTTPS (HEAD,
 *  sans suivre de redirection, 8 secondes au plus). Une réponse, quelle
 *  qu'elle soit, prouve un certificat valable ; une erreur, non. */
export async function verifierCertificat(hote: string): Promise<{ hote: string; statut: "actif" | "erreur"; erreur: string | null }> {
  try {
    await fetch(`https://${hote}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return { hote, statut: "actif", erreur: null };
  } catch (e) {
    return { hote, statut: "erreur", erreur: phraseErreur(e) };
  }
}

/** « 22 Mo », « 1,4 Go ». */
export function taille(octets: number): string {
  const mo = octets / (1024 * 1024);
  if (mo < 1024) return `${Math.max(1, Math.round(mo)).toLocaleString("fr-FR")} Mo`;
  return `${(mo / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
}

export const LIBELLES_FOURNISSEUR: Record<string, string> = {
  resend: "Resend", brevo: "Brevo", apercu: "Aperçu (rien ne part)", relais: "Relais local", aucun: "Aucun",
};
