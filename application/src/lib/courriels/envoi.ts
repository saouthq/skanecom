import { clientService } from "@/lib/console/service";

/* ============================================================================
   L'ENVOI — un seul point de sortie pour tous les e-mails, et un fournisseur
   choisi par le secret COURRIELS_ENVOI (un seul secret : un secret déclaré
   est exigé dans chaque environnement, cloudflare.config.ts) :
   · « resend:<clé>:<adresse> » / « brevo:<clé>:<adresse> » : l'envoi réel,
     depuis une adresse d'un domaine vérifié chez le fournisseur ;
   · « apercu » : l'aperçu en ligne n'envoie rien — l'e-mail, rendu, est
     gardé en base et la console le montre (supabase/apercu/codes-demo.sql) ;
   · « relais » : en local, le relais de l'API le garde (outils/relais-rest.mjs).
   Le nom affiché est celui de la boutique : l'acheteur reçoit « Maymar ».
   La console règle, par boutique, un autre nom affiché, l'adresse où vont
   les réponses, et son propre domaine d'envoi une fois vérifié
   (commandes@maymar.tn ; migration …_courriels_expediteur). Si le
   fournisseur refuse ce domaine, l'e-mail repart de l'adresse de la
   plateforme : il arrive quand même.
   ========================================================================== */

/** Ce qu'est l'envoi, pour le compter (la consommation de chaque boutique,
 *  migration …_console_consommation) : un code de connexion, le suivi d'une
 *  commande, un accès de l'équipe (invitation, mot de passe), la lettre. */
export type NatureEnvoi = "code" | "commande" | "equipe" | "lettre" | "essai";

export type Envoi = {
  a: string; nom: string; sujet: string; html: string; texte: string; code?: string | null;
  /** La boutique pour qui l'e-mail part (son id) ; absente : SkanEcom elle-même. */
  boutique?: string | null;
  nature?: NatureEnvoi;
};
export type Resultat = { ok: true; note?: string } | { ok: false; raison: string };

const guillemets = (x: string) => `"${x.replace(/["\\\r\n]/g, "")}"`;

/** « resend:re_123:bonjour@maymar.tn » → le fournisseur, sa clé, l'adresse d'expédition. */
export function lireEnvoi(valeur: string): { fournisseur: string; cle: string; expediteur: string } {
  const [fournisseur = "", cle = "", ...reste] = valeur.trim().split(":");
  return { fournisseur, cle, expediteur: reste.join(":") };
}

/** Ce que la console a réglé pour cette boutique (ou, sans boutique, pour la
 *  plateforme) ; illisible : rien de changé, l'e-mail part comme avant. */
type Expediteur = { nom: string | null; reponse_a: string | null; adresse: string | null; reponse_plateforme: string | null };
async function expediteurDe(boutique: string | null | undefined): Promise<Expediteur | null> {
  try {
    const { data } = await clientService().rpc("courriels_expediteur", { p_boutique_id: boutique ?? null });
    return (data as Expediteur | null) ?? null;
  } catch {
    return null;
  }
}

/** Ce qui part, une fois les réglages appliqués : de qui, où vont les réponses. */
export type Pret = Envoi & { de?: string | null; reponse_a?: string | null };

/** Envoie, puis note l'envoi au journal (l'adresse masquée par la base) et
 *  le compte au mois de sa boutique : la console voit ce qui part, ce qui
 *  casse, et ce que chaque boutique consomme. Le journal ne bloque jamais l'envoi. */
export async function envoyer(e: Envoi): Promise<Resultat> {
  const x = await expediteurDe(e.boutique);
  const pret: Pret = {
    ...e,
    nom: (e.boutique ? x?.nom : null) || e.nom,
    de: e.boutique ? x?.adresse ?? null : null,
    reponse_a: (e.boutique ? x?.reponse_a : x?.reponse_plateforme) ?? null,
  };
  let resultat = await envoyerSansJournal(pret);
  let parti = pret.de;
  // Le domaine de la boutique refusé (vérification perdue, clé…) : l'e-mail
  // repart de l'adresse de la plateforme, la raison reste au journal.
  if (!resultat.ok && pret.de) {
    const premier = resultat.raison;
    resultat = await envoyerSansJournal({ ...pret, de: null });
    if (resultat.ok) {
      resultat = { ok: true, note: `${pret.de} refusé (${premier}) : reparti de la plateforme` };
      parti = null;
    }
  }
  try {
    await clientService().rpc("console_noter_envoi", {
      p_canal: "email", p_destinataire: e.a, p_expediteur: parti ? `${pret.nom} <${parti}>` : pret.nom, p_sujet: e.sujet,
      p_fournisseur: lireEnvoi(process.env.COURRIELS_ENVOI ?? "").fournisseur || "aucun",
      p_ok: resultat.ok, p_raison: resultat.ok ? resultat.note ?? null : resultat.raison,
      p_boutique_id: e.boutique ?? null, p_nature: e.nature ?? null,
    });
  } catch { /* un journal indisponible n'empêche pas l'e-mail */ }
  return resultat;
}

async function envoyerSansJournal(e: Pret): Promise<Resultat> {
  const { fournisseur, cle, expediteur: plateforme } = lireEnvoi(process.env.COURRIELS_ENVOI ?? "");
  const expediteur = e.de || plateforme;
  try {
    switch (fournisseur) {
      case "resend": {
        if (!cle || !expediteur) return { ok: false, raison: "Resend : COURRIELS_ENVOI attend « resend:<clé>:<adresse> »" };
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: `${guillemets(e.nom)} <${expediteur}>`, to: [e.a], subject: e.sujet, html: e.html, text: e.texte,
            ...(e.reponse_a ? { reply_to: e.reponse_a } : {}),
          }),
        });
        return r.ok ? { ok: true } : { ok: false, raison: `Resend : HTTP ${r.status}` };
      }
      case "brevo": {
        if (!cle || !expediteur) return { ok: false, raison: "Brevo : COURRIELS_ENVOI attend « brevo:<clé>:<adresse> »" };
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": cle, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: { name: e.nom, email: expediteur }, to: [{ email: e.a }],
            subject: e.sujet, htmlContent: e.html, textContent: e.texte,
            ...(e.reponse_a ? { replyTo: { email: e.reponse_a } } : {}),
          }),
        });
        return r.ok ? { ok: true } : { ok: false, raison: `Brevo : HTTP ${r.status}` };
      }
      case "apercu": {
        const { error } = await clientService().rpc("console_noter_courriel_apercu", {
          p_destinataire: e.a, p_code: e.code ?? "", p_expediteur: e.nom, p_sujet: e.sujet, p_html: e.html, p_texte: e.texte,
        });
        return error ? { ok: false, raison: `Aperçu : ${error.message}` } : { ok: true };
      }
      case "relais": {
        // Le relais de l'API locale, à l'adresse de la base (outils/api-locale.sh).
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        if (!base) return { ok: false, raison: "Relais : NEXT_PUBLIC_SUPABASE_URL attendue" };
        const r = await fetch(`${base.replace(/\/+$/, "")}/email-dev/rendu`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e),
        });
        return r.ok ? { ok: true } : { ok: false, raison: `Relais : HTTP ${r.status}` };
      }
      default:
        return { ok: false, raison: "Aucun expéditeur d'e-mails configuré (COURRIELS_ENVOI)" };
    }
  } catch (err) {
    return { ok: false, raison: `Envoi impossible : ${err instanceof Error ? err.message : String(err)}` };
  }
}
