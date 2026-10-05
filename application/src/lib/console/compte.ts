import { clientSession } from "./session";

/* ============================================================================
   MON COMPTE — ce que chacun règle pour soi, qu'il soit de l'équipe SkanEcom
   (/compte) ou d'une boutique (/gestion/<boutique>/compte) : son mot de
   passe, ses codes de secours, ses sessions.
   ========================================================================== */

/** Les codes de secours tout juste créés, montrés une fois (cookie HttpOnly,
 *  dix minutes) : la base n'en garde que l'empreinte. */
export const COOKIE_CODES = "skanecom_codes_secours";
export const DUREE_COOKIE_CODES = 600;

// Ni I, L, O, 0 ni 1 : rien qui se confonde à la lecture.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Dix codes « K7Q2M-9XR4T », tirés par le générateur cryptographique. */
export function nouveauxCodes(n = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < n) {
    const octets = crypto.getRandomValues(new Uint8Array(10));
    const brut = [...octets].map((o) => ALPHABET[o % ALPHABET.length]).join("");
    codes.add(`${brut.slice(0, 5)}-${brut.slice(5)}`);
  }
  return [...codes];
}

/** Où revenir après un geste du compte : l'une des deux pages, jamais ailleurs. */
export function retourCompte(valeur: unknown): string {
  const v = String(valeur ?? "");
  return /^\/gestion\/[a-z0-9-]{1,48}\/compte$/.test(v) ? v : "/compte";
}

/** La personne connectée : sa session est-elle en double authentification
 *  (aal2), le compte en a-t-il une (un facteur validé), et lui manque-t-il
 *  ce second pas (un facteur, mais une session aal1) ? */
export async function sessionCompte(): Promise<{ id: string; email: string; aal2: boolean; aFacteur: boolean; doitConfirmer: boolean } | null> {
  const sb = await clientSession();
  const { data } = await sb.auth.getUser();
  if (!data.user?.email) return null;
  const { data: niveau } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal2 = niveau?.currentLevel === "aal2";
  const aFacteur = niveau?.nextLevel === "aal2";
  return { id: data.user.id, email: data.user.email, aal2, aFacteur, doitConfirmer: aFacteur && !aal2 };
}
