/* ============================================================================
   TURNSTILE (côté serveur) — l'anti-robots de Cloudflare, sans énigme pour
   les vrais visiteurs : un jeton obtenu dans le navigateur, vérifié ici.

   Deux secrets du Worker : TURNSTILE_CLE_SITE (publique, elle part dans la
   page) et TURNSTILE_SECRET. Les deux posés : la vérification est active
   (le formulaire de contact, les codes par SMS) ; l'un ou l'autre absent, ou
   « aucune » : rien ne change. Le widget de Cloudflare doit connaître le
   domaine de chaque boutique (son tableau de bord, « Hostname management »).

   Cloudflare injoignable au moment de vérifier : on laisse passer (le
   visiteur ne paie pas une panne de l'anti-robots), et le journal le dit.
   Un jeton refusé, absent ou déjà servi : refusé.
   ========================================================================== */

const VERIFIER = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const valeur = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s && s !== "aucune" && s !== "aucun" ? s : null;
};

/** La vérification est-elle active (les deux clés posées) ? */
export function turnstileActif(): boolean {
  return Boolean(valeur(process.env.TURNSTILE_CLE_SITE) && valeur(process.env.TURNSTILE_SECRET));
}

/** La clé publique du widget, pour la page ; null si la vérification n'est pas active. */
export function cleSiteTurnstile(): string | null {
  return turnstileActif() ? valeur(process.env.TURNSTILE_CLE_SITE) : null;
}

/** Le jeton du visiteur est-il bon ? Vrai d'office quand la vérification n'est pas active. */
export async function verifierTurnstile(jeton: unknown, ip: string | null): Promise<boolean> {
  const secret = valeur(process.env.TURNSTILE_SECRET);
  if (!turnstileActif() || !secret) return true;
  if (typeof jeton !== "string" || !jeton || jeton.length > 2048) return false;
  const corps = new URLSearchParams({ secret, response: jeton });
  if (ip) corps.set("remoteip", ip);
  try {
    const r = await fetch(VERIFIER, { method: "POST", body: corps, signal: AbortSignal.timeout(5000) });
    const j = (await r.json().catch(() => null)) as { success?: boolean } | null;
    if (j && typeof j.success === "boolean") return j.success;
    console.error(`Turnstile : réponse illisible (HTTP ${r.status}), le visiteur passe`);
    return true;
  } catch (e) {
    console.error(`Turnstile injoignable (${String(e).slice(0, 120)}), le visiteur passe`);
    return true;
  }
}

/** L'adresse du visiteur, telle que Cloudflare la donne. */
export function ipDuVisiteur(req: Request): string | null {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
