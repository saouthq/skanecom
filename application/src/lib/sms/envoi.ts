import { clientService } from "@/lib/console/service";

/* ============================================================================
   L'ENVOI DES SMS — les codes de connexion des acheteurs, que Supabase Auth
   confie au crochet « Send SMS » de l'application (/crochets/sms). Comme
   pour les e-mails, un seul point de sortie, et un fournisseur choisi par
   le secret SMS_ENVOI :
   · « twilio:<compte>:<jeton>:<expéditeur> » : l'envoi réel ; l'expéditeur
     est un numéro (+…) ou un service de messagerie Twilio (MG…) ;
   · « relais » : en local, le relais de l'API le garde (outils/relais-rest.mjs) ;
   · « aucun » : rien ne part — l'aperçu en ligne, dont les codes passent
     par un crochet Postgres (supabase/apercu/codes-demo.sql).
   Chaque SMS est noté au journal des envois et compté au mois de sa
   boutique (la consommation, migration …_console_consommation).
   ========================================================================== */

export type Sms = { a: string; code: string; nom: string; boutique: string | null };
export type Resultat = { ok: true } | { ok: false; raison: string };

/** « twilio:AC123:jeton:+21670000000 » → le fournisseur, et ce qui suit. */
export function lireSms(valeur: string): { fournisseur: string; parties: string[] } {
  const [fournisseur = "", ...parties] = valeur.trim().split(":");
  return { fournisseur, parties };
}

/** Le texte du SMS : court (un seul SMS, même accentué : 70 caractères), le
 *  nom de la boutique d'abord — c'est lui que l'acheteur reconnaît. */
export function texteSms(nom: string, code: string): string {
  const qui = nom.length > 24 ? `${nom.slice(0, 23).trimEnd()}…` : nom;
  return `${qui} : votre code est ${code}. Ne le partagez pas.`;
}

export async function envoyerSms(s: Sms): Promise<Resultat> {
  const { fournisseur } = lireSms(process.env.SMS_ENVOI ?? "");
  const resultat = await envoyerSansJournal(s);
  try {
    await clientService().rpc("console_noter_envoi", {
      p_canal: "sms", p_destinataire: s.a, p_expediteur: s.nom, p_sujet: "Code de connexion",
      p_fournisseur: fournisseur || "aucun", p_ok: resultat.ok, p_raison: resultat.ok ? null : resultat.raison,
      p_boutique_id: s.boutique, p_nature: "code",
    });
  } catch { /* un journal indisponible n'empêche pas le SMS */ }
  return resultat;
}

async function envoyerSansJournal(s: Sms): Promise<Resultat> {
  const { fournisseur, parties } = lireSms(process.env.SMS_ENVOI ?? "");
  try {
    switch (fournisseur) {
      case "twilio": {
        const [compte = "", jeton = "", ...reste] = parties;
        const expediteur = reste.join(":");
        if (!compte || !jeton || !expediteur) return { ok: false, raison: "Twilio : SMS_ENVOI attend « twilio:<compte>:<jeton>:<expéditeur> »" };
        const corps = new URLSearchParams({ To: s.a, Body: texteSms(s.nom, s.code) });
        corps.set(expediteur.startsWith("MG") ? "MessagingServiceSid" : "From", expediteur);
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(compte)}/Messages.json`, {
          method: "POST",
          headers: { authorization: `Basic ${btoa(`${compte}:${jeton}`)}`, "content-type": "application/x-www-form-urlencoded" },
          body: corps,
        });
        return r.ok ? { ok: true } : { ok: false, raison: `Twilio : HTTP ${r.status}` };
      }
      case "relais": {
        // Le relais de l'API locale reçoit ce que Supabase Auth lui aurait confié.
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        if (!base) return { ok: false, raison: "Relais : NEXT_PUBLIC_SUPABASE_URL attendue" };
        const r = await fetch(`${base.replace(/\/+$/, "")}/sms-dev`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ user: { phone: s.a.replace(/\D/g, "") }, sms: { otp: s.code }, texte: texteSms(s.nom, s.code) }),
        });
        return r.ok ? { ok: true } : { ok: false, raison: `Relais : HTTP ${r.status}` };
      }
      default:
        return { ok: false, raison: "Aucun fournisseur de SMS configuré (SMS_ENVOI)" };
    }
  } catch (err) {
    return { ok: false, raison: `Envoi impossible : ${err instanceof Error ? err.message : String(err)}` };
  }
}
