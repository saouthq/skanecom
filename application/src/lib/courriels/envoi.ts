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
   ========================================================================== */

export type Envoi = { a: string; nom: string; sujet: string; html: string; texte: string; code?: string | null };
export type Resultat = { ok: true } | { ok: false; raison: string };

const guillemets = (x: string) => `"${x.replace(/["\\\r\n]/g, "")}"`;

/** « resend:re_123:bonjour@maymar.tn » → le fournisseur, sa clé, l'adresse d'expédition. */
export function lireEnvoi(valeur: string): { fournisseur: string; cle: string; expediteur: string } {
  const [fournisseur = "", cle = "", ...reste] = valeur.trim().split(":");
  return { fournisseur, cle, expediteur: reste.join(":") };
}

export async function envoyer(e: Envoi): Promise<Resultat> {
  const { fournisseur, cle, expediteur } = lireEnvoi(process.env.COURRIELS_ENVOI ?? "");
  try {
    switch (fournisseur) {
      case "resend": {
        if (!cle || !expediteur) return { ok: false, raison: "Resend : COURRIELS_ENVOI attend « resend:<clé>:<adresse> »" };
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
          body: JSON.stringify({ from: `${guillemets(e.nom)} <${expediteur}>`, to: [e.a], subject: e.sujet, html: e.html, text: e.texte }),
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
