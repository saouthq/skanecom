import { urlFichier } from "@/lib/photos";

/* ============================================================================
   LE DÉPÔT DES FICHIERS — photos des produits, côté serveur.

   Production : le bucket R2 lié au Worker (liaison FICHIERS,
   cloudflare.config.ts), servi au public par son domaine
   (NEXT_PUBLIC_FICHIERS_URL).
   Local : le relais (outils/relais-rest.mjs) tient lieu de R2 — PUT et DELETE
   sur la même adresse publique, avec la clé de service comme clé de dépôt.
   On le reconnaît comme next.config.ts : l'adresse des fichiers est locale.

   La base a le dernier mot sur le chemin (dossier de la boutique,
   private.valide_chemin) ; ici, on vérifie ce que contient le fichier.
   ========================================================================== */

type R2 = {
  put(cle: string, corps: ArrayBuffer, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
  delete(cle: string): Promise<void>;
};

/** Poids maximal d'une photo reçue (le navigateur les réduit d'ordinaire bien avant). */
export const POIDS_MAX = 10 * 1024 * 1024;

/** Le type d'une image d'après ses premiers octets — jamais d'après son nom
 *  ni d'après ce que le navigateur annonce. */
export function typeImage(o: Uint8Array): { type: string; extension: string } | null {
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { type: "image/jpeg", extension: "jpg" };
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return { type: "image/png", extension: "png" };
  const ascii = (debut: number, fin: number) => String.fromCharCode(...o.subarray(debut, fin));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", extension: "webp" };
  return null;
}

function depotLocal(): string | null {
  const base = process.env.NEXT_PUBLIC_FICHIERS_URL;
  if (!base) return null;
  return ["127.0.0.1", "localhost"].includes(new URL(base).hostname) ? base : null;
}

async function bucket(): Promise<R2> {
  const { env } = await import("cloudflare:workers");
  const r2 = env.FICHIERS as R2 | undefined;
  if (!r2) throw new Error("Dépôt de fichiers : la liaison R2 FICHIERS manque au Worker (cloudflare.config.ts)");
  return r2;
}

function cleLocale(): string {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error("Dépôt local : SUPABASE_SERVICE_ROLE_KEY manque (application/.dev.vars)");
  return cle;
}

/** Dépose un fichier. Ses noms sont uniques : il ne change jamais, on le
 *  garde un an en cache. */
export async function deposerFichier(chemin: string, corps: ArrayBuffer, type: string): Promise<void> {
  if (depotLocal()) {
    const r = await fetch(urlFichier(chemin), {
      method: "PUT",
      headers: { "content-type": type, "x-depot-cle": cleLocale() },
      body: corps,
    });
    if (!r.ok) throw new Error(`Dépôt local refusé (${r.status})`);
    return;
  }
  await (await bucket()).put(chemin, corps, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
  });
}

/** Retire un fichier ; sans erreur s'il n'y est déjà plus. */
export async function retirerFichier(chemin: string): Promise<void> {
  if (depotLocal()) {
    const r = await fetch(urlFichier(chemin), { method: "DELETE", headers: { "x-depot-cle": cleLocale() } });
    if (!r.ok && r.status !== 404) throw new Error(`Retrait local refusé (${r.status})`);
    return;
  }
  await (await bucket()).delete(chemin);
}
