/* ============================================================================
   LE CHIFFREMENT DES CLÉS CONFIÉES PAR LES COMMERÇANTS (la clé de l'API de
   leur SkanFact) — AES-GCM 256, la clé dans le secret du Worker
   SKANFACT_CHIFFRE (32 octets en base64), jamais dans la base : une base
   copiée ne donne aucune clé. Le contexte (l'identifiant de la boutique)
   est lié au chiffré : un chiffré recopié sur une autre boutique ne se
   déchiffre pas.
   Rangé : base64(iv de 12 octets ‖ chiffré et son étiquette).
   ========================================================================== */

const te = new TextEncoder();

function octets(base64: string): Uint8Array<ArrayBuffer> {
  const b = atob(base64);
  const o = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
  return o;
}

function base64(o: Uint8Array): string {
  let b = "";
  for (const x of o) b += String.fromCharCode(x);
  return btoa(b);
}

async function cle(): Promise<CryptoKey | null> {
  const brut = (process.env.SKANFACT_CHIFFRE ?? "").trim();
  if (!brut) return null;
  let o: Uint8Array<ArrayBuffer>;
  try {
    o = octets(brut);
  } catch {
    return null;
  }
  if (o.length !== 32) return null;
  return crypto.subtle.importKey("raw", o, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Le chiffrement est-il possible (le secret du Worker est posé) ? */
export async function chiffrementPret(): Promise<boolean> {
  return (await cle()) !== null;
}

export async function chiffrer(texte: string, contexte: string): Promise<string | null> {
  const k = await cle();
  if (!k) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(contexte) }, k, te.encode(texte)));
  const tout = new Uint8Array(iv.length + c.length);
  tout.set(iv);
  tout.set(c, iv.length);
  return base64(tout);
}

export async function dechiffrer(range: string, contexte: string): Promise<string | null> {
  const k = await cle();
  if (!k) return null;
  try {
    const tout = octets(range);
    const clair = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: tout.slice(0, 12), additionalData: te.encode(contexte) }, k, tout.slice(12),
    );
    return new TextDecoder().decode(clair);
  } catch {
    return null; // un autre secret, une autre boutique, un chiffré abîmé
  }
}
