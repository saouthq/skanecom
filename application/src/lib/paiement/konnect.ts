/* ============================================================================
   KONNECT — le paiement en ligne sur le compte de la boutique (migration
   …_konnect). SkanEcom n'encaisse jamais : la clé d'API et le portefeuille
   sont ceux de la boutique, la clé arrive ici déchiffrée le temps d'un appel.
   · ouvrir : POST /payments/init-payment → la page de paiement (payUrl) et
     la référence (paymentRef) ;
   · relire : GET /payments/<référence> → l'état, que l'on note. L'appel
     que Konnect fait à la boutique n'est pas signé : on n'en prend que la
     référence, et l'on relit toujours chez Konnect avant d'agir ;
   · essai : le bac à sable de Konnect (api.sandbox.konnect.network), aucun
     argent réel ; réel : la production.
   En local (la base locale, 127.0.0.1), le relais de l'API tient lieu de
   Konnect (outils/konnect-dev.mjs) : une page « Payer / Refuser ».
   ========================================================================== */

export type ModeKonnect = "essai" | "reel";
export type EtatKonnect = "paye" | "en_attente" | "echoue" | "expire";
export type Reponse<T> = { ok: true; valeur: T } | { ok: false; raison: string; cle?: boolean };

const BASES: Record<ModeKonnect, string> = {
  essai: "https://api.sandbox.konnect.network/api/v2",
  reel: "https://api.konnect.network/api/v2",
};

function base(mode: ModeKonnect): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // La base locale : le relais de l'API joue Konnect (jamais en ligne).
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(supabase)) return `${supabase.replace(/\/+$/, "")}/konnect-dev/api/v2`;
  return BASES[mode];
}

async function appel(mode: ModeKonnect, cle: string, chemin: string, init: RequestInit = {}): Promise<Reponse<unknown> & { statut?: number }> {
  try {
    const r = await fetch(`${base(mode)}${chemin}`, {
      ...init,
      headers: { "x-api-key": cle, "content-type": "application/json", accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(12_000),
    });
    const corps = await r.json().catch(() => null) as { errors?: { message?: string }[]; message?: string } | null;
    if (r.ok) return { ok: true, valeur: corps, statut: r.status };
    const message = corps?.errors?.[0]?.message ?? corps?.message ?? `HTTP ${r.status}`;
    if (r.status === 401 || r.status === 403) {
      return { ok: false, raison: "Konnect refuse la clé d'API (vérifiez-la, et le mode : essai ou réel).", cle: true, statut: r.status };
    }
    return { ok: false, raison: `Konnect : ${message}`, statut: r.status };
  } catch (err) {
    return { ok: false, raison: `Konnect injoignable : ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** La clé est-elle acceptée ? Une référence inconnue répond « introuvable »
 *  à une bonne clé, « refusée » à une mauvaise : rien n'est créé chez Konnect. */
export async function verifierCle(mode: ModeKonnect, cle: string): Promise<Reponse<true>> {
  const r = await appel(mode, cle, "/payments/000000000000000000000000");
  if (r.ok || (r.statut && r.statut !== 401 && r.statut !== 403 && r.statut < 500)) return { ok: true, valeur: true };
  return { ok: false, raison: r.ok ? "" : r.raison, cle: !r.ok && r.cle };
}

export type Ouverture = {
  mode: ModeKonnect; cle: string; wallet: string;
  montantMillimes: number; numero: string; description: string;
  contact: { nom: string; telephone: string; email: string | null };
  /** L'adresse que Konnect appelle quand l'état change (?payment_ref=…). */
  webhook: string;
  /** Où revient l'acheteur, payé ou non. */
  retour: string;
};

export async function ouvrirPaiement(o: Ouverture): Promise<Reponse<{ adresse: string; reference: string }>> {
  const [prenom, ...nom] = o.contact.nom.trim().split(/\s+/);
  const r = await appel(o.mode, o.cle, "/payments/init-payment", {
    method: "POST",
    body: JSON.stringify({
      receiverWalletId: o.wallet,
      token: "TND",
      amount: Math.round(o.montantMillimes),
      type: "immediate",
      description: o.description.slice(0, 250),
      acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
      lifespan: 30,
      checkoutForm: false,
      addPaymentFeesToAmount: false,
      firstName: prenom || o.contact.nom,
      lastName: nom.join(" ") || prenom || o.contact.nom,
      phoneNumber: o.contact.telephone.replace(/^\+216/, ""),
      ...(o.contact.email ? { email: o.contact.email } : {}),
      orderId: o.numero,
      webhook: o.webhook,
      silentWebhook: true,
      successUrl: o.retour,
      failUrl: o.retour,
      theme: "light",
    }),
  });
  if (!r.ok) return r;
  const v = r.valeur as { payUrl?: string; paymentRef?: string } | null;
  if (!v?.payUrl || !v.paymentRef) return { ok: false, raison: "Konnect n'a pas donné de page de paiement" };
  return { ok: true, valeur: { adresse: v.payUrl, reference: v.paymentRef } };
}

type PaiementKonnect = {
  status?: string; amount?: number; reachedAmount?: number;
  transactions?: { status?: string; amount?: number }[];
};

/** L'état d'un paiement chez Konnect, et ce qui a été payé (en millimes). */
export async function lirePaiement(mode: ModeKonnect, cle: string, reference: string):
  Promise<Reponse<{ etat: EtatKonnect; payeMillimes: number | null; brut: Record<string, unknown> }>> {
  const r = await appel(mode, cle, `/payments/${encodeURIComponent(reference)}`);
  if (!r.ok) return r;
  const p = ((r.valeur as { payment?: PaiementKonnect } | null)?.payment ?? {}) as PaiementKonnect;
  const s = String(p.status ?? "").toLowerCase();
  const etat: EtatKonnect = s === "completed" || s === "paid" || s === "success" ? "paye"
    : s === "expired" ? "expire"
    : s === "failed" || s === "canceled" || s === "cancelled" || s === "rejected" ? "echoue"
    : "en_attente";
  const reussies = (p.transactions ?? []).filter((t) => String(t.status ?? "").toLowerCase() === "success");
  const paye = typeof p.reachedAmount === "number" ? p.reachedAmount
    : reussies.length ? reussies.reduce((s2, t) => s2 + (t.amount ?? 0), 0)
    : etat === "paye" && typeof p.amount === "number" ? p.amount : null;
  return { ok: true, valeur: { etat, payeMillimes: paye, brut: { status: p.status ?? null, amount: p.amount ?? null, reachedAmount: p.reachedAmount ?? null } } };
}
