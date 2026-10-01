/* ============================================================================
   LES AVIS DE SKANFACT (serveur/avis.ts de la plateforme) — l'en-tête
   `skanfact-signature: t=<secondes>,v1=<hex>`, où v1 est le HMAC-SHA256, avec
   le secret de l'abonnement (« whsec_… », pris tel quel), de « <t>.<corps> ».
   Au-delà de cinq minutes d'écart, refusé : un avis rejoué des heures plus
   tard ne passe pas.
   ========================================================================== */

const TOLERANCE_S = 300;

function hex(o: ArrayBuffer): string {
  return [...new Uint8Array(o)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparaison en temps constant (pour des chaînes de même longueur). */
function egales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signer(secret: string, horodatage: string, corps: string): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${horodatage}.${corps}`)));
}

export async function avisSigne(secret: string, entete: string | null, corps: string, maintenant = Date.now()): Promise<boolean> {
  if (!secret || !entete) return false;
  const parties = new Map(entete.split(",").map((p) => {
    const i = p.indexOf("=");
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
  }));
  const t = parties.get("t");
  const v1 = parties.get("v1");
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs(maintenant / 1000 - Number(t)) > TOLERANCE_S) return false;
  return egales(v1.toLowerCase(), await signer(secret, t, corps));
}

/** Le client SkanFact dont parle un avis, s'il le dit (facture.emise, facture.reglee, reglement.enregistre). */
export function clientDeLAvis(donnees: unknown): string | null {
  const d = (donnees ?? {}) as { client?: unknown; clientId?: unknown };
  const id = typeof d.client === "object" && d.client ? (d.client as { id?: unknown }).id : typeof d.client === "string" ? d.client : d.clientId;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
