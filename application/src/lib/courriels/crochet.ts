/* ============================================================================
   LE CROCHET « SEND EMAIL » DE SUPABASE AUTH — la signature des Standard
   Webhooks : en-têtes webhook-id, webhook-timestamp, webhook-signature
   (« v1,<base64> », plusieurs possibles), secret « v1,whsec_<base64> ».
   Signé : `${id}.${horodatage}.${corps}`, HMAC-SHA256. Au-delà de cinq
   minutes d'écart, refusé (un envoi rejoué ne repart pas).
   ========================================================================== */

const TOLERANCE_S = 300;

function octets(base64: string): Uint8Array<ArrayBuffer> {
  const binaire = atob(base64);
  const sortie = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) sortie[i] = binaire.charCodeAt(i);
  return sortie;
}

function base64(o: Uint8Array): string {
  let binaire = "";
  for (const b of o) binaire += String.fromCharCode(b);
  return btoa(binaire);
}

/** Comparaison en temps constant (pour des chaînes de même longueur). */
function egales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signer(secret: string, id: string, horodatage: string, corps: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw", octets(secret.replace(/^v1,/, "").replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return base64(new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${id}.${horodatage}.${corps}`))));
}

export async function signatureValide(secret: string, entetes: Headers, corps: string, maintenant = Date.now()): Promise<boolean> {
  const id = entetes.get("webhook-id");
  const horodatage = entetes.get("webhook-timestamp");
  const signatures = entetes.get("webhook-signature");
  if (!id || !horodatage || !signatures) return false;
  const ts = Number(horodatage);
  if (!Number.isFinite(ts) || Math.abs(maintenant / 1000 - ts) > TOLERANCE_S) return false;
  let attendue: string;
  try {
    attendue = await signer(secret, id, horodatage, corps);
  } catch {
    return false; // secret illisible
  }
  return signatures.split(" ").some((s) => {
    const [version, signature] = s.split(",");
    return version === "v1" && typeof signature === "string" && egales(signature, attendue);
  });
}
